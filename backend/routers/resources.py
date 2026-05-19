import os
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db, Resource, Folder
from auth import get_current_user, User
import magic, hashlib

router = APIRouter(prefix="/folders/{folder_id}/resources", tags=["resources"])

UPLOAD_DIR        = "./uploads"
MAX_FILE_SIZE     = 10 * 1024 * 1024
MAX_FILENAME_LEN  = 255
ALLOWED_EXT       = {".pdf", ".txt", ".docx", ".md", ".csv"}
ALLOWED_MIME: dict[str, set[str]] = {
    ".pdf":  {"application/pdf"},
    ".txt":  {"text/plain"},
    ".md":   {"text/plain", "text/markdown"},
    ".csv":  {"text/plain", "text/csv", "application/csv"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"},
}


def resource_dict(r: Resource):
    return {"id": r.id, "filename": r.filename, "indexed": r.indexed, "uploaded_at": str(r.uploaded_at)}


def get_folder_or_404(folder_id: int, user: User, db: Session) -> Folder:
    f = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not f:
        raise HTTPException(404, "Folder not found")
    return f


def _safe_filename(filename: str) -> str:
    name = os.path.basename(filename)
    safe = "".join(c if c.isalnum() or c in (".", "-", "_") else "_" for c in name)
    while ".." in safe:
        safe = safe.replace("..", ".")
    return safe or "upload"


def _check_mime(data: bytes, ext: str):
    allowed = ALLOWED_MIME.get(ext, set())
    try:
        detected = magic.from_buffer(data, mime=True)
    except Exception:
        return
    if detected not in allowed:
        raise HTTPException(415, f"File content ({detected}) does not match extension ({ext})")


def _unique_filepath(folder_dir: str, filename: str) -> str:
    fp = os.path.join(folder_dir, filename)
    if not os.path.exists(fp):
        return fp
    h = hashlib.sha256(f"{folder_dir}{filename}".encode()).hexdigest()[:6]
    base, ext = os.path.splitext(filename)
    return os.path.join(folder_dir, f"{base}_{h}{ext}")


@router.get("/")
def list_resources(folder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    return [resource_dict(r) for r in db.query(Resource).filter(Resource.folder_id == folder_id).all()]


@router.post("/", status_code=201)
async def upload_resource(folder_id: int, file: UploadFile = File(...),
                           db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    if not file.filename or len(file.filename) > MAX_FILENAME_LEN:
        raise HTTPException(400, "Invalid filename")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported type '{ext}'")

    chunks, total = [], 0
    while True:
        chunk = await file.read(65536)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_FILE_SIZE:
            raise HTTPException(413, "File too large (max 10 MB)")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(400, "Empty file")

    _check_mime(data, ext)
    safe_name = _safe_filename(file.filename)
    folder_dir = os.path.join(UPLOAD_DIR, str(folder_id))
    os.makedirs(folder_dir, exist_ok=True)
    filepath = _unique_filepath(folder_dir, safe_name)

    with open(filepath, "wb") as f:
        f.write(data)

    resource = Resource(filename=safe_name, filepath=filepath, folder_id=folder_id)
    db.add(resource); db.commit(); db.refresh(resource)

    try:
        from rag.indexer import index_file
        index_file(filepath, folder_id, resource.id)
        resource.indexed = True
        db.commit()
    except Exception as e:
        print(f"[Indexing error] {e}")

    return resource_dict(resource)


@router.get("/{resource_id}/serve/")
def serve_resource(folder_id: int, resource_id: int,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Serve resource file for in-browser viewing or download."""
    get_folder_or_404(folder_id, user, db)
    resource = db.query(Resource).filter(Resource.id == resource_id, Resource.folder_id == folder_id).first()
    if not resource:
        raise HTTPException(404, "Resource not found")

    real_path = os.path.realpath(resource.filepath)
    allowed_root = os.path.realpath(UPLOAD_DIR)
    if not real_path.startswith(allowed_root):
        raise HTTPException(400, "Invalid path")
    if not os.path.exists(real_path):
        raise HTTPException(404, "File not found on disk")

    ext = os.path.splitext(resource.filename)[1].lower()
    # PDFs and text open inline; everything else triggers download
    if ext == ".pdf":
        media_type = "application/pdf"
    elif ext in (".txt", ".md", ".csv"):
        media_type = "text/plain"
    else:
        media_type = "application/octet-stream"

    return FileResponse(
        real_path,
        media_type=media_type,
        filename=resource.filename,
        headers={"Content-Disposition": "inline" if ext in (".pdf", ".txt", ".md") else f'attachment; filename="{resource.filename}"'},
    )


@router.delete("/{resource_id}")
def delete_resource(folder_id: int, resource_id: int,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_folder_or_404(folder_id, user, db)
    resource = db.query(Resource).filter(Resource.id == resource_id, Resource.folder_id == folder_id).first()
    if not resource:
        raise HTTPException(404, "Resource not found")

    real_path = os.path.realpath(resource.filepath)
    if not real_path.startswith(os.path.realpath(UPLOAD_DIR)):
        raise HTTPException(400, "Invalid path")
    if os.path.exists(real_path):
        os.remove(real_path)

    try:
        from rag.chroma_store import get_collection
        col = get_collection(folder_id)
        results = col.get(where={"resource_id": resource.id})
        if results and results.get("ids"):
            col.delete(ids=results["ids"])
    except Exception as e:
        print(f"[ChromaDB delete] {e}")

    db.delete(resource); db.commit()
    return {"message": "Resource deleted"}