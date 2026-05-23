# ResHub — AI-Powered Research Workspace

> **ResHub** is an intelligent, agent-driven research workspace where you organize projects into folders, upload documents, manage tasks and notes, and chat with an AI that actually *knows* your content — powered by a multi-agent RAG pipeline.

---

## Table of Contents

- [What is ResHub?](#what-is-reshub)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Environment Variables](#environment-variables)
- [How It Works](#how-it-works)
  - [Multi-Agent System](#multi-agent-system)
  - [RAG Pipeline](#rag-pipeline)
- [API Reference](#api-reference)
- [Screenshots](#screenshots)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## What is ResHub?

ResHub turns your research projects into interactive workspaces. You create a **folder** for each project, upload your reference documents (PDFs, Word files, text files), manage your tasks and notes — and then **chat with an AI assistant** that answers questions specifically from your uploaded content.

It is not a generic chatbot. Every folder has its own isolated knowledge base. Ask it "what does the methodology section say?" and it retrieves the exact answer from your documents.

---

## Key Features

- **Project Folders** — Organize work into isolated research spaces
- **Document Upload & Indexing** — Upload PDF, DOCX, or TXT files; they get chunked and indexed automatically
- **Per-Folder RAG Chatbot** — Ask questions, get answers grounded in your actual documents
- **Global AI Assistant** — A home-page assistant that manages folders, tasks, and notes via natural language
- **Task Manager** — Create and track to-do items inside each project
- **Notes** — Rich freeform notes per project
- **Chat History** — Conversations are persisted per session
- **JWT Authentication** — Secure login and registration flow

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                    │
│         (Vite + JSX, JWT auth, Axios)               │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│              FastAPI Backend                        │
│   /auth  /folders  /tasks  /notes  /chat  /history  │
└──────┬───────────────────────────┬──────────────────┘
       │                           │
┌──────▼──────┐           ┌────────▼────────┐
│   MySQL DB  │           │  LangGraph      │
│ (SQLAlchemy)│           │  Agent System   │
│             │           │                 │
│ Users       │           │ Intent Router   │
│ Folders     │           │  ├─ folder_agent│
│ Resources   │           │  ├─ task_agent  │
│ Notes       │           │  ├─ notes_agent │
│ Tasks       │           │  ├─ resource_agent
│ ChatHistory │           │  └─ rag_agent   │
└─────────────┘           └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │   ChromaDB      │
                          │ (Per-folder     │
                          │  vector store)  │
                          │                 │
                          │ Embeddings:     │
                          │ all-MiniLM-L6   │
                          └─────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Axios |
| Backend | FastAPI, Python 3.11+ |
| Database | MySQL, SQLAlchemy ORM |
| Vector Store | ChromaDB |
| Embeddings | `all-MiniLM-L6-v2` (Sentence Transformers) |
| LLM | Groq API — `llama-3.1-8b-instant` |
| Agent Framework | LangGraph |    
| Auth | JWT (python-jose), bcrypt |
| File Parsing | PyMuPDF, python-docx, chardet |

---

## Project Structure

```
ResHub/
├── ResHub-backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── database.py              # SQLAlchemy models & DB engine
│   ├── auth.py                  # JWT auth utilities
│   ├── requirements.txt
│   ├── routers/
│   │   ├── auth.py              # /auth endpoints
│   │   ├── folders.py           # /folders endpoints
│   │   ├── resources.py         # File upload & management
│   │   ├── notes.py             # Notes CRUD
│   │   ├── tasks.py             # Task CRUD
│   │   ├── chat.py              # Chat endpoint (agent entry)
│   │   └── history.py           # Chat history endpoints
│   ├── agents/
│   │   └── graph.py             # LangGraph multi-agent graph
│   └── rag/
│       ├── chroma_store.py      # ChromaDB collection management
│       └── indexer.py           # Document chunking & indexing
│
└── ResHub-frontend/
    ├── src/
    │   ├── App.jsx              # Routing
    │   ├── auth.jsx             # Login / Register page
    │   ├── home.jsx             # Folder dashboard + global chat
    │   ├── project_folder.jsx   # Per-folder workspace
    │   ├── profile.jsx          # User profile & stats
    │   └── api.js               # Axios API client
    ├── index.html
    └── package.json
```

---

## Getting Started

### Prerequisites

Make sure you have the following installed:

- **Python 3.11+**
- **Node.js 18+** and **npm**
- **MySQL** (local or hosted, e.g. Railway, PlanetScale)
- A **Groq API key** — get one free at [console.groq.com](https://console.groq.com)

---

### Backend Setup

**1. Clone the repository**

```bash
git clone https://github.com/dharanidh75/RESHUB.git
cd reshub/backend
```

**2. Create and activate a virtual environment**

```bash
python -m venv venv

# On Linux / macOS
source venv/bin/activate

# On Windows
venv\Scripts\activate
```

**3. Install dependencie's**

```bash
pip install -r requirements.txt
```

**4. Configure environment variables**

Create a `.env` file in `ResHub-backend/`:

```env
DATABASE_URL=mysql+pymysql://username:password@localhost:3306/reshub
SECRET_KEY=your_super_secret_jwt_key
GROQ_API_KEY=your_groq_api_key
```

**5. Initialize the database**

```bash
python -c "from database import Base, engine; Base.metadata.create_all(bind=engine)"
```

**6. Start the backend server**

```bash
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

### Frontend Setup

**1. Navigate to the frontend directory**

```bash
cd ../reshub/frontend
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure the API base URL**

In `src/api.js`, confirm the base URL matches your backend:

```javascript
const API_BASE = "http://localhost:8000";
```

**4. Start the development server**

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | MySQL connection string | Yes |
| `SECRET_KEY` | Secret for JWT signing | Yes |
| `GROQ_API_KEY` | Groq API key for LLM inference | Yes |

---

## How It Works

### Multi-Agent System

When you send a message to the chat, the backend runs it through a **LangGraph agent graph**:

```
User message
     │
     ▼
Intent Classifier
(keyword fast-path → LLM fallback)
     │
     ├──► folder_agent    → create/list/delete folders
     ├──► task_agent      → create/update/list tasks
     ├──► notes_agent     → create/read notes
     ├──► resource_agent  → list uploaded files
     └──► rag_agent       → query document knowledge base
```

The intent classifier first tries fast keyword matching (e.g. "create folder", "add task") to avoid an unnecessary LLM call. If the intent is ambiguous, it calls the LLM to classify before routing.

---

### RAG Pipeline

When you upload a document to a folder:

1. The file is parsed (PDF via PyMuPDF, DOCX via python-docx, TXT via chardet)
2. The text is split into overlapping chunks
3. Each chunk is embedded using `all-MiniLM-L6-v2`
4. Embeddings are stored in a **per-folder ChromaDB collection**

When you ask a question in the folder chat:

1. Your query is embedded
2. The top-k most relevant chunks are retrieved from that folder's collection
3. The chunks + your question are sent to the LLM (Groq / llama-3.1-8b-instant)
4. The LLM synthesizes a grounded answer

This means the AI only answers from *your documents* — no hallucination from generic training data.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login, get JWT token |
| `GET` | `/folders` | List all folders |
| `POST` | `/folders` | Create a folder |
| `DELETE` | `/folders/{id}` | Delete a folder |
| `POST` | `/folders/{id}/resources` | Upload a file to a folder |
| `GET` | `/folders/{id}/resources` | List resources in a folder |
| `GET` | `/notes` | Get notes |
| `POST` | `/notes` | Create a note |
| `GET` | `/tasks` | Get tasks |
| `POST` | `/tasks` | Create a task |
| `PATCH` | `/tasks/{id}` | Update a task |
| `POST` | `/chat` | Send a message to the agent |
| `GET` | `/history` | Get chat history |

Full interactive docs available at `/docs` when the backend is running.

---

## Screenshots

> Add screenshots of your app here.

| Home — Folder Dashboard | Project Workspace | RAG Chat |
|---|---|---|
| _(screenshot)_ | _(screenshot)_ | _(screenshot)_ |

---

## Roadmap

- [ ] Streaming LLM responses (real-time token output)
- [ ] Global chat history persistence
- [ ] Async document indexing (background task queue)
- [ ] Dark mode UI
- [ ] Export chat answers as notes
- [ ] Multi-user workspace / team folders
- [ ] Web URL indexing (scrape + RAG)
- [ ] Docker Compose setup for one-command deployment

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

[MIT](LICENSE)

---

> Built by [Dharanidharan J](https://github.com/dharanidh75) and [Kamaleshwaran S N](https://github.com/WhiteDevil-007-git) · ResHub is a research-first AI workspace designed for developers and students who think in projects.
