import os
import uuid
from rag.chroma_store import add_documents


def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


def _extract_text(filepath: str) -> str:
    """Extract raw text from supported file types."""
    ext = os.path.splitext(filepath)[1].lower()

    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(filepath)
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    elif ext == ".docx":
        from docx import Document
        doc = Document(filepath)
        return "\n".join(p.text for p in doc.paragraphs)

    elif ext in (".txt", ".md", ".csv"):
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    else:
        raise ValueError(f"Unsupported file type: {ext}")


def index_file(filepath: str, folder_id: int, resource_id: int):
    """Extract, chunk, and embed a file into the folder's ChromaDB collection."""
    filename = os.path.basename(filepath)
    text = _extract_text(filepath)

    if not text.strip():
        print(f"[Indexer] No text extracted from {filename}")
        return

    chunks = _chunk_text(text)
    docs = chunks
    metadatas = [
        {"source": filename, "folder_id": folder_id, "resource_id": resource_id, "chunk": i}
        for i in range(len(chunks))
    ]
    ids = [f"r{resource_id}_c{i}_{uuid.uuid4().hex[:6]}" for i in range(len(chunks))]

    add_documents(folder_id, docs, metadatas, ids)
    print(f"[Indexer] Indexed {len(chunks)} chunks from {filename} into folder {folder_id}")
