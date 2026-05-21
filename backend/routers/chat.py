"""
ResHub — routers/chat.py
========================
All LLM chat is now routed through the LangGraph agent (agents/graph.py).
- Session IDs generated here, persisted in Redis via the graph.
- RAG context retrieved before the graph call when inside a folder.
- Pending state, tool execution, web-search fallback all handled by the graph.
"""

import uuid
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, User
from database import get_db, Folder, Note, ChatHistory
from rag.chroma_store import query_documents
from agents.graph import run_graph

router = APIRouter(tags=["chat"])


# ─────────────────────────────────────────────
# Schema
# ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    message:    str
    session_id: Optional[str] = None


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _normalize(text: str) -> str:
    return re.sub(r'\b(a|an|the)\b\s*', '', text.lower()).strip()


def _ensure_session(session_id: Optional[str]) -> str:
    return session_id or str(uuid.uuid4())


def _save_history(db: Session, user_id: int, folder_id: Optional[int],
                  session_id: str, user_msg: str, answer: str, intent: str, sources: int):
    """Persist both turns to ChatHistory table."""
    try:
        db.add(ChatHistory(
            user_id=user_id, folder_id=folder_id, session_id=session_id,
            role="user", text=user_msg, intent=intent, sources=0,
        ))
        db.add(ChatHistory(
            user_id=user_id, folder_id=folder_id, session_id=session_id,
            role="assistant", text=answer, intent=intent, sources=sources,
        ))
        db.commit()
    except Exception as e:
        print(f"[ChatHistory save error] {e}")


# ─────────────────────────────────────────────
# Folder-level chat
# ─────────────────────────────────────────────

@router.post("/folders/{folder_id}/chat/")
def folder_chat(
    folder_id: int,
    body: ChatRequest,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    session_id = _ensure_session(body.session_id)

    # Retrieve RAG context (empty string = no docs found → graph will web-search)
    chunks      = query_documents(folder_id, body.message, n_results=5)
    rag_context = "\n\n---\n\n".join(chunks) if chunks else ""

    result = run_graph(
        user_message=body.message,
        session_id=session_id,
        db=db,
        user_id=user.id,
        folder_id=folder_id,
        rag_context=rag_context,
    )

    answer  = result["final_answer"]
    intent  = result["intent"]
    sources = len(chunks)

    _save_history(db, user.id, folder_id, session_id, body.message, answer, intent, sources)

    # If the graph executed navigate_folder, bubble up the navigation payload
    agent_result = result.get("agent_result") or {}
    if isinstance(agent_result, dict) and agent_result.get("intent") == "navigate_folder":
        return {
            "answer":     answer,
            "intent":     "navigate_folder",
            "folder_id":  agent_result["folder_id"],
            "folder_name": agent_result["folder_name"],
            "session_id": session_id,
            "sources_used": sources,
        }

    return {
        "answer":      answer,
        "intent":      intent,
        "session_id":  session_id,
        "sources_used": sources,
    }


# ─────────────────────────────────────────────
# Global chat (home page — no folder context)
# ─────────────────────────────────────────────

@router.post("/chat/global/")
def global_chat(
    body: ChatRequest,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    session_id = _ensure_session(body.session_id)

    result = run_graph(
        user_message=body.message,
        session_id=session_id,
        db=db,
        user_id=user.id,
        folder_id=None,
        rag_context="",
    )

    answer = result["final_answer"]
    intent = result["intent"]

    _save_history(db, user.id, None, session_id, body.message, answer, intent, 0)

    # Bubble up navigation payload when the graph resolves navigate_folder
    agent_result = result.get("agent_result")
    if isinstance(agent_result, dict) and agent_result.get("intent") == "navigate_folder":
        return {
            "answer":      answer,
            "intent":      "navigate_folder",
            "folder_id":   agent_result["folder_id"],
            "folder_name": agent_result["folder_name"],
            "session_id":  session_id,
        }

    return {
        "answer":     answer,
        "intent":     intent,
        "session_id": session_id,
    }