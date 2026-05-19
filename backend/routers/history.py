from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func
from pydantic import BaseModel
from typing import Optional
from database import get_db, ChatHistory, Folder
from auth import get_current_user, User
import uuid

router = APIRouter(tags=["history"])


class HistoryIn(BaseModel):
    role: str
    text: str
    intent: Optional[str] = None
    sources: Optional[int] = 0
    session_id: Optional[str] = None
    session_title: Optional[str] = None   # first user msg text sent from frontend


def msg_dict(h: ChatHistory):
    return {
        "id": h.id,
        "session_id": h.session_id,
        "role": h.role,
        "text": h.text,
        "intent": h.intent,
        "sources": h.sources,
        "created_at": str(h.created_at),
    }


def _session_index(rows) -> list[dict]:
    """
    Build a fast session list from raw rows.
    Only returns session metadata — NOT the full messages.
    One dict per session, ordered newest first.
    """
    seen = {}
    for r in rows:
        if r.session_id not in seen:
            seen[r.session_id] = {
                "session_id": r.session_id,
                "title": r.session_title or "New conversation",
                "created_at": str(r.created_at),
            }
    # newest first
    return list(reversed(list(seen.values())))


# ════════════════════════════════════════════════════════
# FOLDER HISTORY
# ════════════════════════════════════════════════════════

@router.get("/folders/{folder_id}/history/sessions/")
def get_folder_sessions(
    folder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Returns ONLY session headings (id + title + date).
    Fast — no message text loaded.
    """
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    # One row per session — just the first message
    rows = (
        db.query(ChatHistory)
        .filter(ChatHistory.folder_id == folder_id, ChatHistory.user_id == user.id)
        .order_by(ChatHistory.session_id, ChatHistory.created_at)
        .all()
    )
    return _session_index(rows)


@router.get("/folders/{folder_id}/history/sessions/{session_id}/")
def get_folder_session_messages(
    folder_id: int,
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lazy-load messages for a single session when user clicks it."""
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    rows = (
        db.query(ChatHistory)
        .filter(
            ChatHistory.folder_id == folder_id,
            ChatHistory.user_id == user.id,
            ChatHistory.session_id == session_id,
        )
        .order_by(ChatHistory.created_at)
        .all()
    )
    return [msg_dict(r) for r in rows]


@router.post("/folders/{folder_id}/history/", status_code=201)
def save_folder_message(
    folder_id: int,
    body: HistoryIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    h = ChatHistory(
        user_id=user.id,
        folder_id=folder_id,
        session_id=body.session_id or str(uuid.uuid4()),
        session_title=body.session_title,
        role=body.role,
        text=body.text,
        intent=body.intent,
        sources=body.sources or 0,
    )
    db.add(h)
    db.commit()
    return msg_dict(h)


@router.delete("/folders/{folder_id}/history/sessions/{session_id}/")
def delete_folder_session(
    folder_id: int,
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.query(ChatHistory).filter(
        ChatHistory.folder_id == folder_id,
        ChatHistory.user_id == user.id,
        ChatHistory.session_id == session_id,
    ).delete()
    db.commit()
    return {"message": "Session deleted"}


# ════════════════════════════════════════════════════════
# GLOBAL (HOME) HISTORY
# ════════════════════════════════════════════════════════

@router.get("/history/global/sessions/")
def get_global_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(ChatHistory)
        .filter(ChatHistory.folder_id == None, ChatHistory.user_id == user.id)
        .order_by(ChatHistory.session_id, ChatHistory.created_at)
        .all()
    )
    return _session_index(rows)


@router.get("/history/global/sessions/{session_id}/")
def get_global_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(ChatHistory)
        .filter(
            ChatHistory.folder_id == None,
            ChatHistory.user_id == user.id,
            ChatHistory.session_id == session_id,
        )
        .order_by(ChatHistory.created_at)
        .all()
    )
    return [msg_dict(r) for r in rows]


@router.post("/history/global/", status_code=201)
def save_global_message(
    body: HistoryIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    h = ChatHistory(
        user_id=user.id,
        folder_id=None,
        session_id=body.session_id or str(uuid.uuid4()),
        session_title=body.session_title,
        role=body.role,
        text=body.text,
        intent=body.intent,
        sources=body.sources or 0,
    )
    db.add(h)
    db.commit()
    return msg_dict(h)


@router.delete("/history/global/sessions/{session_id}/")
def delete_global_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.query(ChatHistory).filter(
        ChatHistory.folder_id == None,
        ChatHistory.user_id == user.id,
        ChatHistory.session_id == session_id,
    ).delete()
    db.commit()
    return {"message": "Session deleted"}