"""
ResHub LangGraph Backend — agents/graph.py
==========================================
Model         : llama-3.1-70b-versatile  (Groq)
Search        : duckduckgo-search        (free, no API key)
Tools         : create_folder, navigate_folder, create_todo,
                delete_todo, list_resources, generate_summary
Session store : Redis  (per session_id, TTL 24h)
History trim  : Summarise + compress via extra LLM call when > HISTORY_LIMIT turns
"""

import json
import os
import re
import uuid
from functools import lru_cache
from typing import Annotated, Any, Literal, Optional

import redis
from dotenv import load_dotenv
from duckduckgo_search import DDGS
from groq import Groq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

load_dotenv()

# ─────────────────────────────────────────────
# 0.  CLIENTS & CONSTANTS
# ─────────────────────────────────────────────

_groq = Groq(api_key=os.getenv("GROQ_API_KEY"))

_redis = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    db=0,
    decode_responses=True,
)

MODEL         = "llama-3.3-70b-versatile"
HISTORY_LIMIT = 20          # messages before compression
SESSION_TTL   = 60 * 60 * 24  # 24 h

# ─────────────────────────────────────────────
# 1.  STATE SCHEMA
# ─────────────────────────────────────────────

class AgentState(TypedDict):
    # ── identifiers ──────────────────────────
    session_id:   str
    user_id:      int
    folder_id:    Optional[int]
    # ── DB handle (passed from FastAPI) ──────
    db:           object
    # ── conversation ─────────────────────────
    messages:     list[dict]   # full history [{role, content}]
    user_message: str          # latest raw user text (convenience alias)
    # ── routing ──────────────────────────────
    intent:       str          # greeting|tool_call|rag|search|pending
    pending_tool: Optional[str]
    pending_arg:  Optional[str]
    tool_args:    dict
    # ── RAG ──────────────────────────────────
    rag_context:  str
    context_docs: list
    # ── output ───────────────────────────────
    final_answer: str
    agent_result: Optional[str]

# ─────────────────────────────────────────────
# 2.  TOOL DEFINITIONS  (Groq function-calling)
# ─────────────────────────────────────────────

TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "create_folder",
            "description": "Create a new project folder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder_name": {"type": "string"}
                },
                "required": ["folder_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "navigate_folder",
            "description": "Open / navigate into an existing folder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder_name": {"type": "string"}
                },
                "required": ["folder_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_todo",
            "description": "Add a new todo / task item in the current folder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "todo_name": {"type": "string"}
                },
                "required": ["todo_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_todo",
            "description": "Delete an existing todo item by its name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "todo_name": {"type": "string"}
                },
                "required": ["todo_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_resources",
            "description": "List all uploaded resources/documents in the current folder.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_summary",
            "description": "Generate a structured document/PDF summary of the project.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# Required arg per tool — drives pending-state validation
TOOL_REQUIRED_ARG: dict[str, Optional[str]] = {
    "create_folder":    "folder_name",
    "navigate_folder":  "folder_name",
    "create_todo":      "todo_name",
    "delete_todo":      "todo_name",
    "list_resources":   None,
    "generate_summary": None,
}

# ─────────────────────────────────────────────
# 3.  REDIS SESSION HELPERS
# ─────────────────────────────────────────────

def _session_key(session_id: str) -> str:
    return f"reshub:session:{session_id}"


def load_session(session_id: str) -> list[dict]:
    try:
        raw = _redis.get(_session_key(session_id))
        return json.loads(raw) if raw else []
    except Exception:
        return []


def save_session(session_id: str, messages: list[dict]) -> None:
    try:
        _redis.setex(_session_key(session_id), SESSION_TTL, json.dumps(messages))
    except Exception as e:
        print(f"[Redis save error] {e}")


def new_session_id() -> str:
    return str(uuid.uuid4())

# ─────────────────────────────────────────────
# 4.  HISTORY COMPRESSION NODE
# ─────────────────────────────────────────────

def compress_history(state: AgentState) -> AgentState:
    messages = state["messages"]
    if len(messages) <= HISTORY_LIMIT:
        return state

    mid      = len(messages) // 2
    old      = messages[:mid]
    recent   = messages[mid:]

    blob = "\n".join(
        f"{m['role'].upper()}: {m['content']}"
        for m in old if isinstance(m.get("content"), str)
    )
    resp = _groq.chat.completions.create(
        model=MODEL,
        messages=[{
            "role": "user",
            "content": (
                "Summarise this conversation segment into one concise paragraph "
                "preserving all key facts, decisions, and tool actions.\n\n" + blob
            ),
        }],
        max_tokens=512,
    )
    summary = resp.choices[0].message.content.strip()
    compressed = [
        {"role": "system", "content": f"[Older context summary]: {summary}"}
    ] + recent

    return {**state, "messages": compressed}

# ─────────────────────────────────────────────
# 5.  INTENT CLASSIFICATION + ROUTING NODE
# ─────────────────────────────────────────────

SYSTEM_PROMPT = """You are ResHub AI — a professional workspace assistant.

STRICT RULES:
1. Greetings (hi/hello/hey/thanks) → reply conversationally, NO tool calls.
2. Informational questions → answer from RAG context if provided. If RAG is empty, set intent to "search".
3. Workspace actions → ALWAYS use the matching tool call.
4. NEVER call a tool when a required argument is missing — ask for it instead.
5. Keep responses professional and concise.
"""

def classify_and_route(state: AgentState) -> AgentState:
    messages = list(state["messages"])

    # If pending, inject reminder so LLM treats latest reply as the missing arg
    if state.get("pending_tool"):
        reminder = {
            "role": "system",
            "content": (
                f"PENDING STATE: You previously asked for '{state['pending_arg']}' "
                f"required by '{state['pending_tool']}'. "
                "The user's latest message IS that answer — extract it and call the tool now."
            ),
        }
        messages = messages[:-1] + [reminder, messages[-1]]

    build = [{"role": "system", "content": SYSTEM_PROMPT}]
    if state.get("rag_context"):
        build.append({
            "role": "system",
            "content": f"[Retrieved resource context]:\n{state['rag_context']}",
        })
    build.extend(messages)

    resp = _groq.chat.completions.create(
        model=MODEL,
        messages=build,
        tools=TOOLS,
        tool_choice="auto",
        max_tokens=1024,
    )

    choice = resp.choices[0]
    msg    = choice.message

    # ── Tool-call path ────────────────────────────────────────────────
    if choice.finish_reason == "tool_calls" and msg.tool_calls:
        tc        = msg.tool_calls[0]
        tool_name = tc.function.name
        try:
            args = json.loads(tc.function.arguments)
        except Exception:
            args = {}

        req = TOOL_REQUIRED_ARG.get(tool_name)

        # Validation — missing required arg → pending state
        if req and not str(args.get(req, "")).strip():
            question = _pending_question(tool_name, req)
            return {
                **state,
                "intent":       "pending",
                "pending_tool": tool_name,
                "pending_arg":  req,
                "tool_args":    args,
                "final_answer": question,
            }

        return {
            **state,
            "intent":       "tool_call",
            "pending_tool": tool_name,   # carried to executor
            "pending_arg":  req,
            "tool_args":    args,
            "final_answer": "",
        }

    # ── Direct text reply ─────────────────────────────────────────────
    reply = msg.content or ""

    # Decide if this needs a web search (LLM said it doesn't know + no RAG)
    needs_search = (
        not state.get("rag_context")
        and any(phrase in reply.lower() for phrase in [
            "i don't know", "i'm not sure", "no information",
            "cannot find", "not available", "outside my knowledge",
        ])
    )

    intent = "search" if needs_search else ("greeting" if _is_greeting(state["user_message"]) else "rag")

    return {
        **state,
        "intent":       intent,
        "pending_tool": None,
        "pending_arg":  None,
        "tool_args":    {},
        "final_answer": reply,
    }


def _pending_question(tool: str, arg: str) -> str:
    MAP = {
        ("create_folder",   "folder_name"): "What should the folder be named?",
        ("navigate_folder", "folder_name"): "Which folder would you like to open?",
        ("create_todo",     "todo_name"):   "What should the todo item be called?",
        ("delete_todo",     "todo_name"):   "Which todo should be deleted?",
    }
    return MAP.get((tool, arg), f"Please provide the `{arg}`.")


def _is_greeting(text: str) -> bool:
    return text.strip().lower() in {"hi", "hello", "hey", "good morning", "good evening", "howdy", "thanks", "thank you"}

# ─────────────────────────────────────────────
# 6.  TOOL EXECUTOR NODE
# ─────────────────────────────────────────────

def execute_tool(state: AgentState) -> AgentState:
    tool   = state["pending_tool"]
    args   = state["tool_args"]
    result = _dispatch(tool, args, state)

    tool_msg = {"role": "tool", "content": json.dumps(result), "name": tool}
    return {
        **state,
        "messages":     state["messages"] + [tool_msg],
        "final_answer": result.get("message", str(result)),
        "agent_result": result.get("message"),
        # clear pending state after execution
        "pending_tool": None,
        "pending_arg":  None,
    }


def _dispatch(tool: str, args: dict, state: AgentState) -> dict:
    db        = state.get("db")
    user_id   = state.get("user_id")
    folder_id = state.get("folder_id")

    if tool == "create_folder":
        return _create_folder(args, db, user_id)
    if tool == "navigate_folder":
        return _navigate_folder(args, db, user_id)
    if tool == "create_todo":
        return _create_todo(args, db, folder_id)
    if tool == "delete_todo":
        return _delete_todo(args, db, folder_id)
    if tool == "list_resources":
        return _list_resources(db, folder_id)
    if tool == "generate_summary":
        return _generate_summary(db, folder_id, state)
    return {"status": "error", "message": f"Unknown tool: {tool}"}


# ── Real handlers wired to existing SQLAlchemy models ────────────────────────

def _create_folder(args: dict, db, user_id: int) -> dict:
    from database import Folder
    name     = args["folder_name"].strip()
    existing = db.query(Folder).filter(Folder.user_id == user_id, Folder.name == name).first()
    if existing:
        return {"status": "exists", "message": f"📁 A folder named **{name}** already exists."}
    folder = Folder(name=name, user_id=user_id)
    db.add(folder); db.commit(); db.refresh(folder)
    return {"status": "success", "message": f"✅ Folder **{name}** created successfully!", "folder_id": folder.id}


def _navigate_folder(args: dict, db, user_id: int) -> dict:
    from database import Folder
    name    = args["folder_name"].strip()
    folders = db.query(Folder).filter(Folder.user_id == user_id).all()
    match   = next((f for f in folders if f.name.lower() == name.lower()), None)
    if match:
        return {"status": "success", "message": f"📁 Opening **{match.name}**...",
                "intent": "navigate_folder", "folder_id": match.id, "folder_name": match.name}
    names = "\n".join(f"• {f.name}" for f in folders)
    return {"status": "not_found", "message": f"❌ No folder named **{name}**. Your folders:\n\n{names}"}


def _create_todo(args: dict, db, folder_id: Optional[int]) -> dict:
    if folder_id is None:
        return {"status": "error", "message": "⚠️ Open a project folder first, then I can add tasks."}
    from database import Task
    text = args["todo_name"].strip()
    task = Task(text=text, folder_id=folder_id, completed=False)
    db.add(task); db.commit()
    return {"status": "success", "message": f"✅ Task added: **{text}**"}


def _delete_todo(args: dict, db, folder_id: Optional[int]) -> dict:
    if folder_id is None:
        return {"status": "error", "message": "⚠️ Open a project folder first."}
    from database import Task
    name  = args["todo_name"].strip()
    tasks = db.query(Task).filter(Task.folder_id == folder_id).all()
    match = next((t for t in tasks if t.text.lower() == name.lower()), None)
    if not match:
        # fuzzy: partial match
        match = next((t for t in tasks if name.lower() in t.text.lower()), None)
    if not match:
        return {"status": "not_found", "message": f"❌ No task matching **{name}** found."}
    db.delete(match); db.commit()
    return {"status": "success", "message": f"🗑️ Task **{match.text}** deleted."}


def _list_resources(db, folder_id: Optional[int]) -> dict:
    if folder_id is None:
        return {"status": "error", "message": "⚠️ Open a project folder to see its resources."}
    from database import Resource
    resources = db.query(Resource).filter(Resource.folder_id == folder_id).all()
    if not resources:
        return {"status": "success", "message": "No resources uploaded yet. Upload files from the Resources tab."}
    lines = "\n".join(f"📄 {r.filename}" for r in resources)
    return {"status": "success", "message": f"**Resources in this project:**\n{lines}"}


def _generate_summary(db, folder_id: Optional[int], state: AgentState) -> dict:
    if folder_id is None:
        return {"status": "error", "message": "⚠️ Open a project folder to generate a summary."}

    from database import Note, Folder, Resource
    from rag.chroma_store import get_collection
    from datetime import datetime

    folder = db.query(Folder).filter(Folder.id == folder_id).first()

    # 1. Retrieve documents from ChromaDB collection
    try:
        collection = get_collection(folder_id)
        chroma_data = collection.get()
        chunks = chroma_data.get("documents", []) if chroma_data else []
        print(f"[Summary] Retrieved {len(chunks)} chunks from ChromaDB for folder {folder_id}")
    except Exception as e:
        print(f"[Summary Generation] Failed to fetch Chroma docs: {e}")
        chunks = []

    # 2. Track metadata of what files were uploaded
    resources = db.query(Resource).filter(Resource.folder_id == folder_id).all()
    file_list = ", ".join([r.filename for r in resources]) if resources else "No files attached."
    indexed_count = sum(1 for r in resources if r.indexed) if resources else 0

    # 3. Pull associated team notes
    notes = db.query(Note).filter(Note.folder_id == folder_id).all()
    notes_text = "\n".join(f"- {n.title}: {(n.content or '')[:200]}" for n in notes)

    # 4. Build context with explicit handling for missing resources
    if not chunks and resources:
        context = f"[⚠️ INDEXING STATUS: {indexed_count}/{len(resources)} files indexed. Content extraction in progress.]"
    elif not chunks:
        context = "[No resources uploaded yet]"
    else:
        context = "\n\n".join(chunks[:15])

    # 5. Synthesize with stricter prompt that enforces ResHub naming and resource focus
    summary_prompt = (
        f"You are a technical analyst for ResHub, summarizing the project: '{folder.name if folder else 'Unknown'}'.\n"
        f"Files uploaded: {file_list}\n"
        f"Indexed files: {indexed_count}/{len(resources)}\n\n"
        f"RESOURCE CONTENT:\n--- START ---\n{context}\n--- END ---\n\n"
        f"PROJECT NOTES:\n{notes_text or '(None)'}\n\n"
        "INSTRUCTIONS:\n"
        "1. If resources are empty or indexing is in progress, explicitly state that.\n"
        "2. Only synthesize information from the provided resources and notes.\n"
        "3. Do NOT generate default content about other projects.\n"
        "4. Focus on concrete details: goals, features, tech stack, findings from the resources.\n"
        "5. If insufficient data, summarize what IS available and note what's missing."
    )

    resp = _groq.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a ResHub assistant. Analyze only the provided resources. Do not generate default or fabricated content."},
            {"role": "user",   "content": summary_prompt},
        ],
        max_tokens=1200,
    )

    summary_text = resp.choices[0].message.content.strip()
    date_str     = datetime.utcnow().strftime("%Y-%m-%d")

    note = Note(title=f"Summary — {date_str}", content=summary_text, folder_id=folder_id)
    db.add(note); db.commit()

    return {
        "status":  "success",
        "message": (
            f"✅ Summary compiled and saved to Notes as **Summary — {date_str}**.\n\n"
            + summary_text[:500] + "..."
        ),
    }
# ─────────────────────────────────────────────
# 7.  WEB SEARCH FALLBACK NODE
# ─────────────────────────────────────────────

WARNING_PREFIX = (
    "the question you asked is not inside the resource — "
    "if you want an accurate result then please consider uploading that specific resource\n\n"
)

def web_search_node(state: AgentState) -> AgentState:
    query = state["user_message"]
    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=5):
                results.append(f"**{r['title']}**: {r['body']}")
    except Exception as e:
        results = [f"Search error: {e}"]

    synthesis = "\n\n".join(results) if results else "No results found."
    return {**state, "intent": "search", "final_answer": WARNING_PREFIX + synthesis}

# ─────────────────────────────────────────────
# 8.  FINALISE NODE  (persist to Redis + messages list)
# ─────────────────────────────────────────────

def finalise(state: AgentState) -> AgentState:
    assistant_msg = {"role": "assistant", "content": state["final_answer"]}
    updated = state["messages"] + [assistant_msg]
    save_session(state["session_id"], updated)
    return {**state, "messages": updated}

# ─────────────────────────────────────────────
# 9.  CONDITIONAL EDGES
# ─────────────────────────────────────────────

def route_after_classify(state: AgentState) -> str:
    intent = state["intent"]
    if intent == "tool_call":
        return "execute_tool"
    if intent == "search":
        return "web_search_node"
    return "finalise"  # greeting | rag | pending

# ─────────────────────────────────────────────
# 10. GRAPH COMPILATION
# ─────────────────────────────────────────────

@lru_cache(maxsize=1)
def build_graph():
    g = StateGraph(AgentState)

    g.add_node("compress_history",   compress_history)
    g.add_node("classify_and_route", classify_and_route)
    g.add_node("execute_tool",       execute_tool)
    g.add_node("web_search_node",    web_search_node)
    g.add_node("finalise",           finalise)

    g.add_edge(START, "compress_history")
    g.add_edge("compress_history", "classify_and_route")

    g.add_conditional_edges(
        "classify_and_route",
        route_after_classify,
        {
            "execute_tool":    "execute_tool",
            "web_search_node": "web_search_node",
            "finalise":        "finalise",
        },
    )

    g.add_edge("execute_tool",    "finalise")
    g.add_edge("web_search_node", "finalise")
    g.add_edge("finalise",        END)

    return g.compile()


# Compiled once at import — warmed up in main.py startup
agent_graph = build_graph()

# ─────────────────────────────────────────────
# 11. PUBLIC ENTRY POINT  (called by chat router)
# ─────────────────────────────────────────────

def run_graph(
    user_message: str,
    session_id:   str,
    db:           object,
    user_id:      int,
    folder_id:    Optional[int] = None,
    rag_context:  str           = "",
) -> dict:
    """
    Main entry point for the chat routers.
    Returns dict with: final_answer, intent, context_docs, session_id
    """
    history = load_session(session_id)
    history.append({"role": "user", "content": user_message})

    initial: AgentState = {
        "session_id":   session_id,
        "user_id":      user_id,
        "folder_id":    folder_id,
        "db":           db,
        "messages":     history,
        "user_message": user_message,
        "intent":       "",
        "pending_tool": None,
        "pending_arg":  None,
        "tool_args":    {},
        "rag_context":  rag_context,
        "context_docs": [],
        "final_answer": "",
        "agent_result": None,
    }

    final = agent_graph.invoke(initial)
    return {
        "final_answer": final["final_answer"],
        "intent":       final["intent"],
        "context_docs": final.get("context_docs", []),
        "session_id":   session_id,
        "agent_result": final.get("agent_result"),
    }