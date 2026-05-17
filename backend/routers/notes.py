from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db, Note, Folder
from auth import get_current_user, User

router = APIRouter(prefix="/folders/{folder_id}/notes", tags=["notes"])


class NoteCreate(BaseModel):
    title: Optional[str] = "Untitled Note"
    content: Optional[str] = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


def note_dict(n: Note):
    return {
        "id": n.id,
        "title": n.title,
        "content": n.content,
        "created_at": str(n.created_at),
        "updated_at": str(n.updated_at),
    }


def get_folder_or_404(folder_id: int, user: User, db: Session) -> Folder:
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@router.get("/")
def list_notes(folder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    notes = db.query(Note).filter(Note.folder_id == folder_id).order_by(Note.updated_at.desc()).all()
    return [note_dict(n) for n in notes]


@router.post("/", status_code=201)
def create_note(folder_id: int, body: NoteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    note = Note(title=body.title, content=body.content, folder_id=folder_id)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note_dict(note)


@router.get("/{note_id}")
def get_note(folder_id: int, note_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    note = db.query(Note).filter(Note.id == note_id, Note.folder_id == folder_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_dict(note)


@router.put("/{note_id}")
def update_note(folder_id: int, note_id: int, body: NoteUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    note = db.query(Note).filter(Note.id == note_id, Note.folder_id == folder_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.content = body.content
    db.commit()
    return note_dict(note)


@router.delete("/{note_id}")
def delete_note(folder_id: int, note_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    note = db.query(Note).filter(Note.id == note_id, Note.folder_id == folder_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}
