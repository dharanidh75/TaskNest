import chromadb
from chromadb.utils import embedding_functions
import os
from dotenv import load_dotenv

load_dotenv()

# Absolute path — works regardless of which directory uvicorn is launched from
_DEFAULT_CHROMA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "chroma_data")
CHROMA_PATH = os.path.abspath(os.getenv("CHROMA_PATH", _DEFAULT_CHROMA))

# Sentence-transformers for local embeddings (no API cost, no key needed)
_embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

_client = chromadb.PersistentClient(path=CHROMA_PATH)


def _collection_name(folder_id: int) -> str:
    return f"folder_{folder_id}"


def get_collection(folder_id: int):
    """
    Get or create a ChromaDB collection for this folder.
    Falls back to opening without embedding_function for legacy collections
    that were created before the embedding config was persisted.
    """
    name = _collection_name(folder_id)
    try:
        return _client.get_or_create_collection(
            name=name,
            embedding_function=_embedding_fn,
        )
    except Exception as e:
        print(f"[ChromaDB] get_or_create with embedding_fn failed ({e}), retrying without it")
        return _client.get_or_create_collection(name=name)


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
    print(f"[ChromaDB] Added {len(docs)} chunks to {_collection_name(folder_id)}")


def query_documents(folder_id: int, query: str, n_results: int = 5) -> list[str]:
    """
    Retrieve top-k relevant chunks from a folder's collection.

    Uses query_embeddings (raw vectors) instead of query_texts so this works
    for ALL collection types — both new (embedding config stored) and legacy
    (no config). Embedding manually with _embedding_fn bypasses ChromaDB's
    internal embedding lookup which fails on config-less collections.
    """
    try:
        collection = get_collection(folder_id)
        count = collection.count()
        print(f"[ChromaDB] folder_{folder_id} has {count} docs, querying: '{query[:60]}'")

        if count == 0:
            return []

        # Embed the query ourselves — works for every collection type
        query_embedding = _embedding_fn([query])[0]

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, count),
        )
        docs = results["documents"][0] if results["documents"] else []
        print(f"[ChromaDB] Returned {len(docs)} chunks")
        return docs

    except Exception as e:
        print(f"[ChromaDB] query_documents failed for folder_{folder_id}: {e}")
        return []
