import chromadb
from chromadb.utils import embedding_functions
import os
from dotenv import load_dotenv

load_dotenv()

_embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

_client = None

def _get_client():
    global _client
    if _client is not None:
        return _client

    api_key  = os.getenv("CHROMA_API_KEY")
    tenant   = os.getenv("CHROMA_TENANT")
    database = os.getenv("CHROMA_DATABASE")

    if api_key:
        _client = chromadb.HttpClient(
            ssl=True,
            host="api.trychroma.com",
            tenant=tenant,
            database=database,
            headers={"x-chroma-token": api_key},
        )
        print("[ChromaDB] Using Chroma Cloud")
    else:
        default_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "chroma_data")
        chroma_path = os.path.abspath(os.getenv("CHROMA_PATH", default_path))
        _client = chromadb.PersistentClient(path=chroma_path)
        print(f"[ChromaDB] Using local store at {chroma_path}")

    return _client


def _collection_name(folder_id: int) -> str:
    return f"folder_{folder_id}"


def get_collection(folder_id: int):
    name = _collection_name(folder_id)
    try:
        return _get_client().get_or_create_collection(
            name=name,
            embedding_function=_embedding_fn,
        )
    except Exception as e:
        print(f"[ChromaDB] get_or_create with embedding_fn failed ({e}), retrying without it")
        return _get_client().get_or_create_collection(name=name)


def delete_collection(folder_id: int):
    try:
        _get_client().delete_collection(name=_collection_name(folder_id))
    except Exception:
        pass


def add_documents(folder_id: int, docs: list[str], metadatas: list[dict], ids: list[str]):
    collection = get_collection(folder_id)
    collection.add(documents=docs, metadatas=metadatas, ids=ids)
    print(f"[ChromaDB] Added {len(docs)} chunks to {_collection_name(folder_id)}")


def query_documents(folder_id: int, query: str, n_results: int = 5) -> list[str]:
    try:
        collection = get_collection(folder_id)
        count = collection.count()
        print(f"[ChromaDB] folder_{folder_id} has {count} docs, querying: '{query[:60]}'")
        if count == 0:
            return []
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