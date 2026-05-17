from fastapi import APIRouter, Depends
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from database import get_db, Base, engine, Folder
from auth import get_current_user, User

# ── Model ─────────────────────────────────────────────────────────────────────

class ChatHistory(Base):
    __tablename__ = "chat_history"
    id        = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=False)
    role      = Column(String(10), nullable=False)   # "user" | "bot"
    text      = Column(Text, nullable=False)
    intent    = Column(String(50), nullable=True)
    sources   = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

router = APIRouter(tags=["history"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class MessageIn(BaseModel):
    role:    str
    text:    str
    intent:  str | None = None
    sources: int = 0

class MessageOut(BaseModel):
    id:        int
    role:      str
    text:      str
    intent:    str | None
    sources:   int
    created_at: datetime

    class Config:
        from_attributes = True

# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/folders/{folder_id}/history/", response_model=list[MessageOut])
def get_history(
    folder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify ownership
    db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    return (
        db.query(ChatHistory)
        .filter(ChatHistory.folder_id == folder_id)
        .order_by(ChatHistory.created_at)
        .limit(100)
        .all()
    )

@router.post("/folders/{folder_id}/history/", response_model=MessageOut)
def save_message(
    folder_id: int,
    body: MessageIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    msg = ChatHistory(
        folder_id=folder_id,
        role=body.role,
        text=body.text,
        intent=body.intent,
        sources=body.sources,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg

@router.get("/folders/{folder_id}/stats/")
def get_stats(
    folder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from database import Resource, Note, Task
    total_tasks     = db.query(Task).filter(Task.folder_id == folder_id).count()
    completed_tasks = db.query(Task).filter(Task.folder_id == folder_id, Task.completed == True).count()
    total_notes     = db.query(Note).filter(Note.folder_id == folder_id).count()
    total_files     = db.query(Resource).filter(Resource.folder_id == folder_id).count()
    pct = round((completed_tasks / total_tasks) * 100) if total_tasks > 0 else 0
    return {
        "total_tasks":     total_tasks,
        "completed_tasks": completed_tasks,
        "completion_pct":  pct,
        "total_notes":     total_notes,
        "total_files":     total_files,
    }