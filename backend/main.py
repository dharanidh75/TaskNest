from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import create_tables
from routers import auth_router, folders, resources, notes, tasks, chat, history
from routers import document

app = FastAPI(title="DevNest API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    create_tables()
    print("✅ DB tables ready")

    print("⏳ Loading embedding model...")
    from rag.chroma_store import _embedding_fn
    _embedding_fn(["warmup"])
    print("✅ Embedding model ready")

    print("⏳ Connecting ChromaDB...")
    from rag.chroma_store import _client
    _client.heartbeat()
    print("✅ ChromaDB ready")

    print("⏳ Compiling agent graph...")
    from agents.graph import agent_graph  # noqa
    print("✅ Agent graph ready")

    print("🚀 DevNest API fully warmed up!")


app.include_router(auth_router.router)
app.include_router(folders.router)
app.include_router(resources.router)
app.include_router(notes.router)
app.include_router(tasks.router)
app.include_router(chat.router)
app.include_router(history.router)
app.include_router(document.router)


@app.get("/")
def root():
    return {"message": "DevNest API running 🚀"}