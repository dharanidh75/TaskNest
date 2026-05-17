import newrelic.agent
newrelic.agent.initialize('newrelic.ini')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import create_tables
from routers import auth_router, folders, resources, notes, tasks, chat, history

app = FastAPI(title="ResHub API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    # ── 1. Create DB tables ───────────────────────────────────────────────────
    create_tables()
    print("✅ Database tables created")

    # ── 2. Warm up sentence-transformers embedding model ──────────────────────
    # This is the biggest cold-start culprit (~2-4s on first request).
    # Loading it here means users never wait for it.
    print("⏳ Loading embedding model...")
    from rag.chroma_store import _embedding_fn
    # Trigger actual model load by running a dummy encode
    _embedding_fn(["warmup"])
    print("✅ Embedding model ready")

    # ── 3. Warm up ChromaDB client ────────────────────────────────────────────
    print("⏳ Connecting to ChromaDB...")
    from rag.chroma_store import _client
    _client.heartbeat()
    print("✅ ChromaDB connected")

    # ── 4. Warm up LangGraph agent graph + Groq LLM connection ───────────────
    # Importing agents.graph builds the graph and instantiates ChatGroq.
    # Groq client itself is fast, but LangGraph graph compilation takes ~0.5s.
    print("⏳ Compiling agent graph...")
    from agents.graph import agent_graph  # noqa: F401 — import triggers compilation
    print("✅ Agent graph compiled")

    print("🚀 ResHub API fully warmed up — all systems ready")


app.include_router(auth_router.router)
app.include_router(folders.router)
app.include_router(resources.router)
app.include_router(notes.router)
app.include_router(tasks.router)
app.include_router(chat.router)
app.include_router(history.router)


@app.get("/")
def root():
    return {"message": "ResHub API running 🚀"}