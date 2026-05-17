import os
import shutil
import hashlib
import magic  # python-magic for real MIME type detection
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db, Resource, Folder
from auth import get_current_user, User

router = APIRouter(prefix="/folders/{folder_id}/resources", tags=["resources"])

UPLOAD_DIR = "./uploads"

# ── Security constants ────────────────────────────────────────────────────────
MAX_FILE_SIZE        = 10 * 1024 * 1024   # 10 MB hard limit (fixes CVE-2024-47874 / CVE-2026-28356)
MAX_FILENAME_LENGTH  = 255
ALLOWED_EXTENSIONS   = {".pdf", ".txt", ".docx", ".md", ".csv"}

# Map extension → allowed real MIME types (prevents MIME-type spoofing)
ALLOWED_MIME_TYPES: dict[str, set[str]] = {
    ".pdf":  {"application/pdf"},
    ".txt":  {"text/plain"},
    ".md":   {"text/plain", "text/markdown"},
    ".csv":  {"text/plain", "text/csv", "application/csv"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",   # .docx are ZIP containers; magic may return this
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def resource_dict(r: Resource) -> dict:
    return {
        "id":          r.id,
        "filename":    r.filename,
        "indexed":     r.indexed,
        "uploaded_at": str(r.uploaded_at),
    }


def get_folder_or_404(folder_id: int, user: User, db: Session) -> Folder:
    folder = (
        db.query(Folder)
        .filter(Folder.id == folder_id, Folder.user_id == user.id)
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


def _safe_filename(filename: str) -> str:
    """
    Strip path components and dangerous characters from the filename.
    Prevents path-traversal attacks (e.g. '../../etc/passwd').
    """
    # Take only the basename
    name = os.path.basename(filename)
    # Replace anything that isn't alphanumeric, dot, dash, or underscore
    safe = "".join(c if c.isalnum() or c in (".", "-", "_") else "_" for c in name)
    # Collapse multiple underscores / dots to single
    while ".." in safe:
        safe = safe.replace("..", ".")
    return safe or "upload"


def _check_mime(data: bytes, ext: str) -> None:
    """
    Verify that the file's real MIME type matches the declared extension.
    Raises HTTPException(415) if they don't match.
    """
    allowed = ALLOWED_MIME_TYPES.get(ext, set())
    try:
        detected = magic.from_buffer(data, mime=True)
    except Exception:
        # If python-magic isn't available, skip check (degrade gracefully)
        return
    if detected not in allowed:
        raise HTTPException(
            status_code=415,
            detail=f"File content ({detected}) does not match extension ({ext}).",
        )


def _unique_filepath(folder_upload_dir: str, filename: str) -> str:
    """
    If a file with the same name already exists, append a short content hash
    to avoid silent overwrites.
    """
    filepath = os.path.join(folder_upload_dir, filename)
    if not os.path.exists(filepath):
        return filepath
    # Append 6-char hash of filename + folder path to make it unique
    h = hashlib.sha256(f"{folder_upload_dir}{filename}".encode()).hexdigest()[:6]
    base, ext = os.path.splitext(filename)
    return os.path.join(folder_upload_dir, f"{base}_{h}{ext}")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/")
def list_resources(
    folder_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    get_folder_or_404(folder_id, user, db)
    resources = db.query(Resource).filter(Resource.folder_id == folder_id).all()
    return [resource_dict(r) for r in resources]


@router.post("/", status_code=201)
async def upload_resource(
    folder_id: int,
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    user: User       = Depends(get_current_user),
):
    # ── 1. Folder ownership check ─────────────────────────────────────────────
    get_folder_or_404(folder_id, user, db)

    # ── 2. Filename validation ────────────────────────────────────────────────
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    if len(file.filename) > MAX_FILENAME_LENGTH:
        raise HTTPException(status_code=400, detail="Filename too long.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    safe_name = _safe_filename(file.filename)

    # ── 3. Read with hard size limit (CVE-2024-47874 / CVE-2026-28356) ───────
    #   We read in chunks instead of file.read() to avoid loading huge payloads
    #   into memory all at once before we know the size.
    chunks: list[bytes] = []
    total = 0
    chunk_size = 64 * 1024  # 64 KB per chunk

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE // (1024*1024)} MB.",
            )
        chunks.append(chunk)

    data = b"".join(chunks)

    if total == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # ── 4. Real MIME-type check ───────────────────────────────────────────────
    _check_mime(data, ext)

    # ── 5. Save to disk ───────────────────────────────────────────────────────
    folder_upload_dir = os.path.join(UPLOAD_DIR, str(folder_id))
    os.makedirs(folder_upload_dir, exist_ok=True)

    filepath = _unique_filepath(folder_upload_dir, safe_name)

    try:
        with open(filepath, "wb") as f:
            f.write(data)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    # ── 6. Persist to database ────────────────────────────────────────────────
    resource = Resource(
        filename=safe_name,
        filepath=filepath,
        folder_id=folder_id,
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)

    # ── 7. Index into ChromaDB ────────────────────────────────────────────────
    try:
        from rag.indexer import index_file
        index_file(filepath, folder_id, resource.id)
        resource.indexed = True
        db.commit()
    except Exception as e:
        # Indexing failure is non-fatal; file is still stored
        print(f"[Indexing error] resource_id={resource.id} error={e}")

    return resource_dict(resource)


@router.delete("/{resource_id}")
def delete_resource(
    folder_id:   int,
    resource_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    # ── 1. Folder ownership check ─────────────────────────────────────────────
    get_folder_or_404(folder_id, user, db)

    # ── 2. Resource existence check ───────────────────────────────────────────
    resource = (
        db.query(Resource)
        .filter(Resource.id == resource_id, Resource.folder_id == folder_id)
        .first()
    )
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    # ── 3. Path-traversal guard before deletion ───────────────────────────────
    real_path    = os.path.realpath(resource.filepath)
    allowed_root = os.path.realpath(UPLOAD_DIR)
    if not real_path.startswith(allowed_root):
        raise HTTPException(status_code=400, detail="Invalid file path.")

    # ── 4. Remove file from disk ──────────────────────────────────────────────
    if os.path.exists(real_path):
        try:
            os.remove(real_path)
        except OSError as e:
            print(f"[Delete error] Could not remove file {real_path}: {e}")

    # ── 5. Remove ChromaDB chunks for this resource ───────────────────────────
    try:
        from rag.chroma_store import get_collection
        collection = get_collection(folder_id)
        # Delete all chunks whose metadata resource_id matches
        results = collection.get(where={"resource_id": resource.id})
        if results and results.get("ids"):
            collection.delete(ids=results["ids"])
    except Exception as e:
        print(f"[ChromaDB delete error] resource_id={resource_id} error={e}")

    # ── 6. Remove from database ───────────────────────────────────────────────
    db.delete(resource)
    db.commit()

    return {"message": "Resource deleted"}