from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db, Folder
from auth import get_current_user, User

router = APIRouter(prefix="/folders", tags=["folders"])


class FolderCreate(BaseModel):
    name: str
    description: Optional[str] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


def folder_dict(f: Folder):
    return {
        "id": f.id,
        "name": f.name,
        "description": f.description,
        "created_at": str(f.created_at),
    }


@router.get("/")
def list_folders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    folders = db.query(Folder).filter(Folder.user_id == user.id).order_by(Folder.created_at.desc()).all()
    return [folder_dict(f) for f in folders]


@router.post("/", status_code=201)
def create_folder(body: FolderCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    folder = Folder(name=body.name, description=body.description, user_id=user.id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder_dict(folder)


@router.get("/{folder_id}")
def get_folder(folder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder_dict(folder)


@router.put("/{folder_id}")
def update_folder(folder_id: int, body: FolderUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if body.name:
        folder.name = body.name
    if body.description is not None:
        folder.description = body.description
    db.commit()
    return folder_dict(folder)


@router.delete("/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    # Delete chroma collection for this folder
    try:
        from rag.chroma_store import delete_collection
        delete_collection(folder_id)
    except Exception:
        pass
    db.delete(folder)
    db.commit()
    return {"message": "Folder deleted"}


@router.get("/{folder_id}/stats/")
def get_folder_stats(folder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Returns resource, note, task, and chat counts for a folder.
    Used by the frontend profile page and any stats widgets.
    """
    from database import Resource, Note, Task, ChatHistory
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    resource_count  = db.query(Resource).filter(Resource.folder_id == folder_id).count()
    note_count      = db.query(Note).filter(Note.folder_id == folder_id).count()
    task_count      = db.query(Task).filter(Task.folder_id == folder_id).count()
    tasks_done      = db.query(Task).filter(Task.folder_id == folder_id, Task.completed == True).count()
    chat_count      = db.query(ChatHistory).filter(ChatHistory.folder_id == folder_id).count()

    return {
        "folder_id":        folder_id,
        "folder_name":      folder.name,
        "resources":        resource_count,
        "notes":            note_count,
        "tasks_total":      task_count,
        "tasks_completed":  tasks_done,
        "tasks_pending":    task_count - tasks_done,
        "chat_messages":    chat_count,
    }
