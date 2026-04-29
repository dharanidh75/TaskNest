import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db, Resource, Folder
from auth import get_current_user, User

router = APIRouter(prefix="/folders/{folder_id}/resources", tags=["resources"])

UPLOAD_DIR = "./uploads"
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx", ".md", ".csv"}


def resource_dict(r: Resource):
    return {
        "id": r.id,
        "filename": r.filename,
        "indexed": r.indexed,
        "uploaded_at": str(r.uploaded_at),
    }


def get_folder_or_404(folder_id: int, user: User, db: Session) -> Folder:
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@router.get("/")
def list_resources(folder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    resources = db.query(Resource).filter(Resource.folder_id == folder_id).all()
    return [resource_dict(r) for r in resources]


@router.post("/", status_code=201)
async def upload_resource(
    folder_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    get_folder_or_404(folder_id, user, db)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    folder_upload_dir = os.path.join(UPLOAD_DIR, str(folder_id))
    os.makedirs(folder_upload_dir, exist_ok=True)
    filepath = os.path.join(folder_upload_dir, file.filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    resource = Resource(filename=file.filename, filepath=filepath, folder_id=folder_id)
    db.add(resource)
    db.commit()
    db.refresh(resource)

    # Index into ChromaDB asynchronously
    try:
        from rag.indexer import index_file
        index_file(filepath, folder_id, resource.id)
        resource.indexed = True
        db.commit()
    except Exception as e:
        print(f"[Indexing error] {e}")

    return resource_dict(resource)


@router.delete("/{resource_id}")
def delete_resource(
    folder_id: int,
    resource_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    get_folder_or_404(folder_id, user, db)
    resource = db.query(Resource).filter(Resource.id == resource_id, Resource.folder_id == folder_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    # Remove file from disk
    if os.path.exists(resource.filepath):
        os.remove(resource.filepath)

    db.delete(resource)
    db.commit()
    return {"message": "Resource deleted"}
