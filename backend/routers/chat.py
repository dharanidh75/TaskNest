from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, Folder
from auth import get_current_user, User

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    message: str


# ── Folder-level RAG chat ─────────────────────────────────────────────────────

@router.post("/folders/{folder_id}/chat/")
def chat(
    folder_id: int,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    from agents.graph import agent_graph

    state = {
        "user_message": body.message,
        "folder_id": folder_id,
        "db": db,
        "user_id": user.id,
        "intent": None,
        "context_docs": [],
        "agent_result": None,
        "final_answer": None,
    }

    result = agent_graph.invoke(state)
    return {
        "answer": result["final_answer"],
        "intent": result["intent"],
        "sources_used": len(result.get("context_docs", [])),
    }


# ── Global chat (home page — no folder context) ───────────────────────────────

@router.post("/chat/global/")
def global_chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from agents.graph import agent_graph

    state = {
        "user_message": body.message,
        "folder_id": None,          # no folder context on home page
        "db": db,
        "user_id": user.id,
        "intent": None,
        "context_docs": [],
        "agent_result": None,
        "final_answer": None,
    }

    result = agent_graph.invoke(state)
    return {
        "answer": result["final_answer"],
        "intent": result["intent"],
        "sources_used": 0,
    }