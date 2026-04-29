"""
LangGraph Agent Graph for TaskNest.

The RAG chatbot is the orchestrator. When a user sends a message,
the graph detects intent and routes to the appropriate agent node:
  - folder_agent   → create/delete/describe folders
  - resource_agent → list resources
  - notes_agent    → create notes from chat
  - task_agent     → add/list/complete tasks
  - rag_agent      → default: answer from retrieved docs
"""

from typing import TypedDict, Annotated, Optional
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain.schema import SystemMessage, HumanMessage
from rag.chroma_store import query_documents
import os
from dotenv import load_dotenv

load_dotenv()

llm = ChatGroq(
    groq_api_key=os.getenv("GROQ_API_KEY"),
    model_name="llama3-70b-8192",
    temperature=0.3,
)


# ── State ────────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    user_message: str
    folder_id: int
    db: object          # SQLAlchemy session
    user_id: int
    intent: Optional[str]
    context_docs: list[str]
    agent_result: Optional[str]
    final_answer: Optional[str]


# ── Intent Classifier ────────────────────────────────────────────────────────

def classify_intent(state: AgentState) -> AgentState:
    msg = state["user_message"].lower()
    if any(w in msg for w in ["create folder", "new folder", "delete folder", "rename folder"]):
        state["intent"] = "folder_agent"
    elif any(w in msg for w in ["add task", "create task", "mark task", "complete task", "list task", "show tasks"]):
        state["intent"] = "task_agent"
    elif any(w in msg for w in ["save note", "create note", "add note", "copy to notes"]):
        state["intent"] = "notes_agent"
    elif any(w in msg for w in ["list resources", "show files", "what files"]):
        state["intent"] = "resource_agent"
    else:
        state["intent"] = "rag_agent"
    return state


def route_intent(state: AgentState) -> str:
    return state["intent"]


# ── Folder Agent ─────────────────────────────────────────────────────────────

def folder_agent(state: AgentState) -> AgentState:
    from database import Folder, SessionLocal
    db = state["db"]
    msg = state["user_message"]

    if "create" in msg.lower() or "new folder" in msg.lower():
        # Extract name from message (simple heuristic)
        words = msg.replace("create folder", "").replace("new folder", "").strip()
        name = words.strip('"\'').strip() or "New Folder"
        folder = Folder(name=name, user_id=state["user_id"])
        db.add(folder)
        db.commit()
        state["agent_result"] = f"✅ Folder **{name}** created successfully."
    elif "delete" in msg.lower():
        state["agent_result"] = "⚠️ For safety, folder deletion is done from the UI."
    else:
        folders = db.query(Folder).filter(Folder.user_id == state["user_id"]).all()
        names = [f.name for f in folders]
        state["agent_result"] = f"📁 Your folders: {', '.join(names)}" if names else "No folders yet."

    state["final_answer"] = state["agent_result"]
    return state


# ── Task Agent ───────────────────────────────────────────────────────────────

def task_agent(state: AgentState) -> AgentState:
    from database import Task
    db = state["db"]
    msg = state["user_message"]
    folder_id = state["folder_id"]

    if "add task" in msg.lower() or "create task" in msg.lower():
        text = msg.lower().replace("add task", "").replace("create task", "").strip('"\'').strip()
        if text:
            task = Task(text=text, folder_id=folder_id)
            db.add(task)
            db.commit()
            state["agent_result"] = f"✅ Task **{text}** added to your to-do list."
        else:
            state["agent_result"] = "Please specify the task name. E.g. 'add task Review documentation'"

    elif "list task" in msg.lower() or "show tasks" in msg.lower():
        tasks = db.query(Task).filter(Task.folder_id == folder_id).all()
        if tasks:
            task_list = "\n".join(
                f"{'✅' if t.completed else '⬜'} {t.text}" for t in tasks
            )
            state["agent_result"] = f"**Tasks:**\n{task_list}"
        else:
            state["agent_result"] = "No tasks yet for this project."

    elif "complete" in msg.lower() or "mark" in msg.lower():
        # Try to find task by text match
        tasks = db.query(Task).filter(Task.folder_id == folder_id, Task.completed == False).all()
        matched = None
        for t in tasks:
            if t.text.lower() in msg.lower():
                matched = t
                break
        if matched:
            matched.completed = True
            db.commit()
            state["agent_result"] = f"✅ Marked **{matched.text}** as complete!"
        else:
            state["agent_result"] = "Couldn't find that task. Try 'list tasks' to see all tasks."
    else:
        state["agent_result"] = "Task action not recognized. Try: 'add task X', 'list tasks', 'complete task X'"

    state["final_answer"] = state["agent_result"]
    return state


# ── Notes Agent ───────────────────────────────────────────────────────────────

def notes_agent(state: AgentState) -> AgentState:
    from database import Note
    db = state["db"]
    msg = state["user_message"]
    folder_id = state["folder_id"]

    # Extract content after the trigger words
    content = msg
    for trigger in ["save note", "create note", "add note", "copy to notes"]:
        content = content.lower().replace(trigger, "").strip()

    title = content[:50] if content else "Note from chat"
    note = Note(title=title, content=content, folder_id=folder_id)
    db.add(note)
    db.commit()
    state["agent_result"] = f"📝 Note saved: **{title}**"
    state["final_answer"] = state["agent_result"]
    return state


# ── Resource Agent ────────────────────────────────────────────────────────────

def resource_agent(state: AgentState) -> AgentState:
    from database import Resource
    db = state["db"]
    folder_id = state["folder_id"]

    resources = db.query(Resource).filter(Resource.folder_id == folder_id).all()
    if resources:
        file_list = "\n".join(f"📄 {r.filename}" for r in resources)
        state["agent_result"] = f"**Resources in this project:**\n{file_list}"
    else:
        state["agent_result"] = "No resources uploaded yet. Upload files to get started."

    state["final_answer"] = state["agent_result"]
    return state


# ── RAG Agent (default) ───────────────────────────────────────────────────────

def rag_agent(state: AgentState) -> AgentState:
    folder_id = state["folder_id"]
    user_message = state["user_message"]

    # Retrieve relevant docs from ChromaDB
    docs = query_documents(folder_id, user_message, n_results=5)
    state["context_docs"] = docs

    if docs:
        context = "\n\n---\n\n".join(docs)
        system_prompt = (
            "You are TaskNest's intelligent assistant. "
            "Answer the user's question using ONLY the context below from their project resources. "
            "If the context doesn't contain the answer, say so honestly. "
            "Be concise, clear, and helpful.\n\n"
            f"CONTEXT:\n{context}"
        )
    else:
        system_prompt = (
            "You are TaskNest's intelligent assistant. "
            "No resources have been uploaded to this project folder yet, "
            "so you cannot answer from documents. "
            "You can still help with general questions or suggest uploading resources."
        )

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ])

    state["final_answer"] = response.content
    return state


# ── Build Graph ───────────────────────────────────────────────────────────────

def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("classifier", classify_intent)
    graph.add_node("folder_agent", folder_agent)
    graph.add_node("task_agent", task_agent)
    graph.add_node("notes_agent", notes_agent)
    graph.add_node("resource_agent", resource_agent)
    graph.add_node("rag_agent", rag_agent)

    graph.set_entry_point("classifier")

    graph.add_conditional_edges(
        "classifier",
        route_intent,
        {
            "folder_agent": "folder_agent",
            "task_agent": "task_agent",
            "notes_agent": "notes_agent",
            "resource_agent": "resource_agent",
            "rag_agent": "rag_agent",
        },
    )

    for node in ["folder_agent", "task_agent", "notes_agent", "resource_agent", "rag_agent"]:
        graph.add_edge(node, END)

    return graph.compile()


# Singleton compiled graph
agent_graph = build_graph()
