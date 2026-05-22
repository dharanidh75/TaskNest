import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import create_tables
from routers import auth_router, folders, resources, notes, tasks, chat
from routers import document

app = FastAPI(title="ResHub API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    create_tables()
    print("✅ DB tables ready")

    # Safe migration: add bio column if missing
    try:
        from database import engine
        with engine.connect() as conn:
            conn.execute(
                __import__("sqlalchemy").text("ALTER TABLE users ADD COLUMN bio TEXT")
            )
            conn.commit()
        print("✅ Migrated: users.bio column added")
    except Exception:
        pass

    # Verify Redis connection
    try:
        import redis as _redis
        import os
        r = _redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=0,
        )
        r.ping()
        print("✅ Redis connected")
    except Exception as e:
        print(f"⚠️  Redis not reachable: {e} — session persistence disabled until Redis is up")

    print("⏳ Loading embedding model...")
    from rag.chroma_store import _embedding_fn
    _embedding_fn(["warmup"])
    print("✅ Embedding model ready")

    print("⏳ Connecting ChromaDB...")
    from rag.chroma_store import _get_client
    _get_client.heartbeat()
    print("✅ ChromaDB ready")

    print("⏳ Compiling agent graph...")
    from agents.graph import agent_graph  # noqa — triggers build_graph() via lru_cache
    print("✅ Agent graph ready")

    print("🚀 ResHub API fully warmed up!")


app.include_router(auth_router.router)
app.include_router(folders.router)
app.include_router(resources.router)
app.include_router(notes.router)
app.include_router(tasks.router)
app.include_router(chat.router)
app.include_router(document.router)


@app.get("/")
def root():
    return {"message": "ResHub API running 🚀"}