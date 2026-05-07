"""
LangGraph Agent Graph for TaskNest.

The RAG chatbot is the orchestrator. When a user sends a message,
the graph detects intent using the LLM and routes to the correct agent:
  - folder_agent   → create / list folders
  - task_agent     → add / list / complete tasks
  - notes_agent    → create / save notes
  - resource_agent → list uploaded files
  - rag_agent      → answer from uploaded project documents
"""

import os
import re
from typing import TypedDict, Optional

from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain.schema import SystemMessage, HumanMessage

from rag.chroma_store import query_documents

load_dotenv()

llm = ChatGroq(
    groq_api_key=os.getenv("GROQ_API_KEY"),
    model_name="llama-3.1-8b-instant",
    temperature=0.1,
)


# ── State ─────────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    user_message: str
    folder_id: Optional[int]
    db: object
    user_id: int
    intent: Optional[str]
    context_docs: list
    agent_result: Optional[str]
    final_answer: Optional[str]


# ── Intent Classifier (LLM-powered) ──────────────────────────────────────────

def classify_intent(state: AgentState) -> AgentState:
    msg = state["user_message"].lower()

    # Fast-path for unambiguous keywords
    folder_kw   = ["create folder", "new folder", "delete folder", "list folders",
                   "make folder", "make a folder", "create a folder", "add folder"]
    task_kw     = ["add task", "create task", "new task", "mark task", "complete task",
                   "list task", "show task", "to-do", "todo", "add to-do", "create to-do"]
    notes_kw    = ["save note", "create note", "add note", "copy to notes", "make note"]
    resource_kw = ["list resources", "show files", "what files", "my files", "list files"]

    if any(k in msg for k in folder_kw):
        state["intent"] = "folder_agent"
        return state
    if any(k in msg for k in task_kw):
        state["intent"] = "task_agent"
        return state
    if any(k in msg for k in notes_kw):
        state["intent"] = "notes_agent"
        return state
    if any(k in msg for k in resource_kw):
        state["intent"] = "resource_agent"
        return state

    # LLM classification for natural / ambiguous phrasing
    classify_prompt = (
        "You are a task router for a project management app called TaskNest.\n"
        "Classify the user message into EXACTLY ONE intent:\n\n"
        "- folder_agent   : user EXPLICITLY wants to create, delete, rename, or list folders\n"
        "- task_agent     : user EXPLICITLY wants to add, list, or complete to-do tasks\n"
        "- notes_agent    : user EXPLICITLY wants to save or create a note\n"
        "- resource_agent : user EXPLICITLY wants to see uploaded files\n"
        "- rag_agent      : greetings, questions, general chat, or document questions\n\n"
        "RULE: Greetings like hello/hi/hey/thanks are ALWAYS rag_agent.\n"
        "RULE: Only use a specific agent when the user clearly requests that action.\n"
        "Reply with ONLY the intent name, nothing else.\n\n"
        f"User message: {state['user_message']}"
    )
    response = llm.invoke([HumanMessage(content=classify_prompt)])
    intent = response.content.strip().lower()
    valid = {"folder_agent", "task_agent", "notes_agent", "resource_agent", "rag_agent"}
    state["intent"] = intent if intent in valid else "rag_agent"
    return state


def route_intent(state: AgentState) -> str:
    return state["intent"]


# ── Folder Agent ──────────────────────────────────────────────────────────────

def folder_agent(state: AgentState) -> AgentState:
    from database import Folder
    db  = state["db"]
    msg = state["user_message"]

    if any(w in msg.lower() for w in ["delete", "remove"]):
        state["final_answer"] = "⚠️ For safety, folder deletion is done from the UI."
        return state

    if any(w in msg.lower() for w in ["list", "show", "what folders", "my folders"]):
        folders = db.query(Folder).filter(Folder.user_id == state["user_id"]).all()
        if folders:
            names = "\n".join(f"📁 {f.name}" for f in folders)
            state["final_answer"] = f"**Your folders:**\n{names}"
        else:
            state["final_answer"] = "You don\'t have any folders yet."
        return state

    # Guard: only proceed if there is clear creation intent
    create_kw = ["create", "make", "new", "add"]
    if not any(w in msg.lower() for w in create_kw):
        state["final_answer"] = "I can help you manage folders! Try: \'create folder <name>\' or \'list folders\'."
        return state

    # Extract folder name with LLM
    extract_prompt = (
        "Extract ONLY the project folder name from this message.\n"
        "Rules:\n"
        "- Return just the name, no quotes, no explanation.\n"
        "- If the message has a specific name (e.g. \'TaskNest\', \'Finance App\'), return that name.\n"
        "- If no name is given, return exactly: New Project\n\n"
        f"Message: {msg}\nFolder name:"
    )
    extracted = llm.invoke([HumanMessage(content=extract_prompt)])
    name = extracted.content.strip().strip("\"\'").strip() or "New Project"

    existing = db.query(Folder).filter(
        Folder.user_id == state["user_id"],
        Folder.name == name
    ).first()
    if existing:
        state["final_answer"] = f"📁 A folder named **{name}** already exists."
        return state

    folder = Folder(name=name, user_id=state["user_id"])
    db.add(folder)
    db.commit()
    db.refresh(folder)
    state["final_answer"] = f"✅ Folder **{name}** created successfully! You can find it on the home page."
    return state

# ── Task Agent ────────────────────────────────────────────────────────────────

def task_agent(state: AgentState) -> AgentState:
    from database import Task
    db        = state["db"]
    msg       = state["user_message"]
    folder_id = state["folder_id"]

    if folder_id is None:
        state["final_answer"] = "⚠️ Tasks are folder-specific. Open a project folder first, then ask me to add tasks."
        return state

    msg_lower = msg.lower()

    if any(w in msg_lower for w in ["list task", "show task", "my tasks", "what tasks"]):
        tasks = db.query(Task).filter(Task.folder_id == folder_id).all()
        if tasks:
            lines = "\n".join(f"{'✅' if t.completed else '⬜'} {t.text}" for t in tasks)
            state["final_answer"] = f"**Tasks in this project:**\n{lines}"
        else:
            state["final_answer"] = "No tasks yet for this project. Ask me to add one!"
        return state

    if any(w in msg_lower for w in ["complete", "mark", "done", "finish"]):
        tasks = db.query(Task).filter(Task.folder_id == folder_id, Task.completed == False).all()
        matched = next((t for t in tasks if t.text.lower() in msg_lower), None)
        if matched:
            matched.completed = True
            db.commit()
            state["final_answer"] = f"✅ Marked **{matched.text}** as complete!"
        else:
            state["final_answer"] = "Couldn't find that task. Try 'list tasks' to see all tasks."
        return state

    # Extract task text with LLM
    extract_prompt = (
        "Extract ONLY the task description from this message.\n"
        "Return just the task text — no quotes, no explanation.\n"
        "If no specific task is mentioned, return: New Task\n\n"
        f"Message: {msg}\nTask:"
    )
    extracted = llm.invoke([HumanMessage(content=extract_prompt)])
    text = extracted.content.strip().strip('"\'').strip() or "New Task"

    task = Task(text=text, folder_id=folder_id, completed=False)
    db.add(task)
    db.commit()
    state["final_answer"] = f"✅ Task added: **{text}**"
    return state


# ── Notes Agent ───────────────────────────────────────────────────────────────

def notes_agent(state: AgentState) -> AgentState:
    from database import Note
    db        = state["db"]
    msg       = state["user_message"]
    folder_id = state["folder_id"]

    if folder_id is None:
        state["final_answer"] = "⚠️ Notes are folder-specific. Open a project folder first."
        return state

    content = msg
    for trigger in ["save note", "create note", "add note", "copy to notes", "make note"]:
        content = re.sub(trigger, "", content, flags=re.IGNORECASE).strip()

    title = content[:60] if content else "Note from chat"
    note  = Note(title=title, content=content, folder_id=folder_id)
    db.add(note)
    db.commit()
    state["final_answer"] = f"📝 Note saved: **{title}**"
    return state


# ── Resource Agent ────────────────────────────────────────────────────────────

def resource_agent(state: AgentState) -> AgentState:
    from database import Resource
    db        = state["db"]
    folder_id = state["folder_id"]

    if folder_id is None:
        state["final_answer"] = "⚠️ Resources are folder-specific. Open a project folder to see its files."
        return state

    resources = db.query(Resource).filter(Resource.folder_id == folder_id).all()
    if resources:
        lines = "\n".join(f"📄 {r.filename}" for r in resources)
        state["final_answer"] = f"**Resources in this project:**\n{lines}"
    else:
        state["final_answer"] = "No resources uploaded yet. Upload files from the Resources tab."
    return state


# ── RAG Agent (default) ───────────────────────────────────────────────────────

def rag_agent(state: AgentState) -> AgentState:
    folder_id    = state["folder_id"]
    user_message = state["user_message"]

    docs = query_documents(folder_id, user_message, n_results=5) if folder_id else []
    state["context_docs"] = docs

    if docs:
        context = "\n\n---\n\n".join(docs)
        system_prompt = (
            "You are TaskNest's intelligent project assistant. "
            "Answer the user's question using ONLY the context below from their uploaded project resources. "
            "If the context doesn't contain the answer, say so honestly. "
            "Do NOT give generic OS or computer instructions — stay focused on project content.\n\n"
            f"CONTEXT:\n{context}"
        )
    else:
        system_prompt = (
            "You are TaskNest's intelligent project assistant. "
            "No resources have been uploaded to this project folder yet. "
            "Do NOT give generic computer or OS instructions. "
            "If the user wants to create folders, tasks, or notes — tell them to simply ask you directly, "
            "e.g. 'create folder X' or 'add task Y'."
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

    graph.add_node("classifier",     classify_intent)
    graph.add_node("folder_agent",   folder_agent)
    graph.add_node("task_agent",     task_agent)
    graph.add_node("notes_agent",    notes_agent)
    graph.add_node("resource_agent", resource_agent)
    graph.add_node("rag_agent",      rag_agent)

    graph.set_entry_point("classifier")

    graph.add_conditional_edges(
        "classifier",
        route_intent,
        {
            "folder_agent":   "folder_agent",
            "task_agent":     "task_agent",
            "notes_agent":    "notes_agent",
            "resource_agent": "resource_agent",
            "rag_agent":      "rag_agent",
        },
    )

    for node in ["folder_agent", "task_agent", "notes_agent", "resource_agent", "rag_agent"]:
        graph.add_edge(node, END)

    return graph.compile()


agent_graph = build_graph()