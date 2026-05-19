from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db, Folder, Note
from auth import get_current_user, User

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


def _folder_chat(folder_id: int, message: str, db: Session, user_id: int) -> dict:
    from agents.graph import agent_graph
    state = {
        "user_message": message,
        "folder_id": folder_id,
        "db": db,
        "user_id": user_id,
        "intent": None,
        "context_docs": [],
        "agent_result": None,
        "final_answer": None,
    }
    result = agent_graph.invoke(state)
    return result


# ── Folder-level RAG chat ──────────────────────────────────────────────────────

@router.post("/folders/{folder_id}/chat/")
def chat(
    folder_id: int,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    msg_lower = body.message.lower()

    # ── Summary intent ────────────────────────────────────────────────────────
    summary_kw = ["summarize", "summary", "summarise", "make a summary", "create summary"]
    if any(k in msg_lower for k in summary_kw):
        from rag.chroma_store import query_documents
        from langchain_groq import ChatGroq
        from langchain_core.messages import SystemMessage, HumanMessage
        import os
        from datetime import datetime

        llm = ChatGroq(
            groq_api_key=os.getenv("GROQ_API_KEY"),
            model_name="llama-3.1-8b-instant",
            temperature=0.2,
        )
        chunks = query_documents(folder_id, "project summary overview", n_results=6)
        context = "\n\n".join(chunks) if chunks else "No resources uploaded yet."
        notes = db.query(Note).filter(Note.folder_id == folder_id).all()
        notes_text = "\n".join([f"- {n.title}: {(n.content or '')[:200]}" for n in notes])

        response = llm.invoke([
            SystemMessage(content="You are a concise technical project summarizer."),
            HumanMessage(content=(
                f"Summarize the project '{folder.name}' based on these resources and notes.\n\n"
                f"RESOURCES:\n{context}\n\nNOTES:\n{notes_text or 'None'}\n\n"
                "Write a clear, structured summary covering purpose, features, and key findings."
            )),
        ])
        summary_text = response.content
        date_str = datetime.utcnow().strftime("%Y-%m-%d")
        note = Note(
            title=f"Summary — {date_str}",
            content=summary_text,
            folder_id=folder_id,
        )
        db.add(note)
        db.commit()

        return {
            "answer": f"✅ Summary created and saved to your Notes as **Summary — {date_str}**.\n\n{summary_text[:400]}...",
            "intent": "summary_agent",
            "sources_used": len(chunks),
            "summary_saved": True,
        }

    # ── Document generation intent ─────────────────────────────────────────────
    doc_kw = ["generate document", "create document", "create doc", "generate doc",
              "make document", "create pdf", "generate pdf", "create docx", "generate docx",
              "make pdf", "make docx", "download document", "export document"]
    if any(k in msg_lower for k in doc_kw):
        fmt = "pdf" if "pdf" in msg_lower else ("docx" if "docx" in msg_lower or "doc" in msg_lower else None)
        return {
            "answer": f"📄 I'll generate a document for **{folder.name}**. Which format do you prefer?",
            "intent": "document_agent",
            "doc_pending": True,
            "folder_id": folder_id,
            "folder_name": folder.name,
            "fmt": fmt,
        }

    # ── Default agent graph ────────────────────────────────────────────────────
    result = _folder_chat(folder_id, body.message, db, user.id)
    return {
        "answer": result["final_answer"],
        "intent": result["intent"],
        "sources_used": len(result.get("context_docs", [])),
    }


# ── Global chat (home page) ────────────────────────────────────────────────────

@router.post("/chat/global/")
def global_chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from agents.graph import agent_graph

    # ── Folder navigation intent (professional exact match) ───────────────────
    nav_kw = ["open", "go to", "navigate to", "switch to", "take me to", "open folder"]
    msg_lower = body.message.lower()

    if any(k in msg_lower for k in nav_kw):
        folders = db.query(Folder).filter(Folder.user_id == user.id).all()
        matched = next(
            (f for f in folders if f.name.lower() in msg_lower),
            None
        )
        if matched:
            return {
                "answer": f"📁 Opening **{matched.name}**...",
                "intent": "navigate_folder",
                "folder_id": matched.id,
                "folder_name": matched.name,
            }
        else:
            folder_list = "\n".join([f"• {f.name}" for f in folders])
            return {
                "answer": f"❌ No project folder found with that name. Your folders are:\n\n{folder_list}",
                "intent": "navigate_folder_not_found",
            }

    # ── Document generation from home (by project name) ───────────────────────
    doc_kw = ["generate document", "create document", "create doc", "generate doc",
              "make pdf", "create pdf", "generate pdf", "create docx", "generate docx"]
    if any(k in msg_lower for k in doc_kw):
        folders = db.query(Folder).filter(Folder.user_id == user.id).all()
        matched = next((f for f in folders if f.name.lower() in msg_lower), None)
        if matched:
            fmt = "pdf" if "pdf" in msg_lower else ("docx" if "docx" in msg_lower or "doc" in msg_lower else None)
            return {
                "answer": f"📄 Generating document for **{matched.name}**. Which format — PDF or DOCX?",
                "intent": "document_agent",
                "doc_pending": True,
                "folder_id": matched.id,
                "folder_name": matched.name,
                "fmt": fmt,
            }
        else:
            folder_list = "\n".join([f"• {f.name}" for f in folders])
            return {
                "answer": f"Which project should I generate a document for? Your folders:\n\n{folder_list}",
                "intent": "document_pick",
            }

    state = {
        "user_message": body.message,
        "folder_id": None,
        "db": db,
        "user_id": user.id,
        "intent": None,
        "context_docs": [],
        "agent_result": None,
        "final_answer": None,
    }
    result = agent_graph.invoke(state)
    return {
        "answer": result["final_answer"],
        "intent": result["intent"],
        "sources_used": 0,
    }