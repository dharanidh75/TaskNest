import chromadb
from chromadb.utils import embedding_functions
import os
from dotenv import load_dotenv

load_dotenv()

# Use absolute path so ChromaDB finds the same data regardless of
# which directory uvicorn is launched from.
_DEFAULT_CHROMA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "chroma_data")
CHROMA_PATH = os.path.abspath(os.getenv("CHROMA_PATH", _DEFAULT_CHROMA))

# Use sentence-transformers for local embeddings (no API cost)
_embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

_client = chromadb.PersistentClient(path=CHROMA_PATH)


def _collection_name(folder_id: int) -> str:
    return f"folder_{folder_id}"


def get_collection(folder_id: int):
    """Get or create a ChromaDB collection for a specific folder."""
    return _client.get_or_create_collection(
        name=_collection_name(folder_id),
        embedding_function=_embedding_fn,
    )


def delete_collection(folder_id: int):
    """Delete the ChromaDB collection for a folder (called on folder delete)."""
    try:
        _client.delete_collection(name=_collection_name(folder_id))
    except Exception:
        pass


def add_documents(folder_id: int, docs: list[str], metadatas: list[dict], ids: list[str]):
    """Add chunked documents to the folder's collection."""
    collection = get_collection(folder_id)
    collection.add(documents=docs, metadatas=metadatas, ids=ids)


def query_documents(folder_id: int, query: str, n_results: int = 5) -> list[str]:
    """Retrieve top-k relevant chunks from a folder's collection."""
    collection = get_collection(folder_id)
    count = collection.count()
    if count == 0:
        return []
    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, count),
    )
    return results["documents"][0] if results["documents"] else []