from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db, Task, Folder
from auth import get_current_user, User

router = APIRouter(prefix="/folders/{folder_id}/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    text: str
    deadline: Optional[datetime] = None


class TaskUpdate(BaseModel):
    text: Optional[str] = None
    completed: Optional[bool] = None
    deadline: Optional[datetime] = None


def task_dict(t: Task):
    return {
        "id": t.id,
        "text": t.text,
        "completed": t.completed,
        "deadline": str(t.deadline) if t.deadline else None,
        "created_at": str(t.created_at),
    }


def get_folder_or_404(folder_id: int, user: User, db: Session) -> Folder:
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@router.get("/")
def list_tasks(folder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    tasks = db.query(Task).filter(Task.folder_id == folder_id).order_by(Task.created_at).all()
    return [task_dict(t) for t in tasks]


@router.post("/", status_code=201)
def create_task(folder_id: int, body: TaskCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    task = Task(text=body.text, deadline=body.deadline, folder_id=folder_id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task_dict(task)


@router.put("/{task_id}")
def update_task(folder_id: int, task_id: int, body: TaskUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    task = db.query(Task).filter(Task.id == task_id, Task.folder_id == folder_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.text is not None:
        task.text = body.text
    if body.completed is not None:
        task.completed = body.completed
    if body.deadline is not None:
        task.deadline = body.deadline
    db.commit()
    return task_dict(task)


@router.delete("/{task_id}")
def delete_task(folder_id: int, task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    task = db.query(Task).filter(Task.id == task_id, Task.folder_id == folder_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"message": "Task deleted"}
