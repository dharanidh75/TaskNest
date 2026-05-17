# TaskNest - Project Setup Guide

## Architecture

```
Frontend (React/Vite) → FastAPI Backend → MySQL (Railway) + ChromaDB (local)
                                       ↓
                              LangGraph Agent Graph
                              ├── Folder Agent
                              ├── Resource Agent
                              ├── Notes Agent
                              ├── Task Agent
                              └── RAG Agent (Groq LLM)
```

## Backend Setup

### 1. Install dependencies
```bash
cd tasknest-backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your values:
```

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `mysql+pymysql://user:pass@host:port/tasknest` |
| `SECRET_KEY` | Any long random string |
| `GROQ_API_KEY` | From https://console.groq.com |
| `CHROMA_PATH` | `./chroma_data` (local folder) |

### 3. Run the backend
```bash
uvicorn main:app --reload --port 8000
```

API docs → http://localhost:8000/docs

---

## Frontend Setup

```bash
cd tasknest-frontend
npm install
npm run dev
```

App → http://localhost:5173

---

## Features

### RAG Chatbot (per-folder brain)
- Each project folder has its own isolated ChromaDB collection
- Upload PDF, DOCX, TXT, MD, CSV files → they get chunked & embedded
- Chat answers come from YOUR project's resources only

### Agentic Commands (just type naturally)
| Command Example | Agent Triggered |
|----------------|----------------|
| `"add task Review documentation"` | Task Agent |
| `"list tasks"` | Task Agent |
| `"complete task Review documentation"` | Task Agent |
| `"create note API endpoints"` | Notes Agent |
| `"What does the architecture section say?"` | RAG Agent |
| `"list resources"` | Resource Agent |

### Copy to Notes
- Every chatbot response has a **📝 Copy to Notes** button
- Saves the AI response directly to your Notes tab for that project

### Notes Section
- Rich text notes per project folder
- Auto-saved with title editing
- Notes created via chat or manually

---

## Deployment to Railway

1. Push `tasknest-backend/` to GitHub
2. Create Railway project → Deploy from GitHub
3. Add environment variables in Railway dashboard
4. Add a Railway Volume and set `CHROMA_PATH=/data/chroma`
5. Frontend → deploy to Vercel/Netlify, update CORS origin in `main.py`
