import os
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db, Folder, Note, Resource
from auth import get_current_user, User
from rag.chroma_store import query_documents

router = APIRouter(tags=["document"])


def _build_summary_text(folder: Folder, notes: list, rag_summary: str) -> str:
    lines = [
        f"PROJECT: {folder.name}",
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC",
        "",
        "=" * 60,
        "PROJECT SUMMARY",
        "=" * 60,
        rag_summary,
        "",
    ]
    if notes:
        lines += ["=" * 60, "NOTES", "=" * 60]
        for n in notes:
            lines += [f"\n[ {n.title} ]", n.content or "", ""]
    return "\n".join(lines)


def _make_docx(folder: Folder, notes: list, rag_summary: str) -> io.BytesIO:
    from docx import Document
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()

    # Title
    title = doc.add_heading(folder.name, level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    sub = doc.add_paragraph(f"Generated on {datetime.utcnow().strftime('%B %d, %Y')}")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.runs[0].font.color.rgb = RGBColor(0x6B, 0x8F, 0xA3)

    doc.add_heading("Project Summary", level=1)
    doc.add_paragraph(rag_summary)

    if notes:
        doc.add_heading("Notes", level=1)
        for n in notes:
            doc.add_heading(n.title or "Untitled", level=2)
            doc.add_paragraph(n.content or "")

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


def _make_pdf(folder: Folder, notes: list, rag_summary: str) -> io.BytesIO:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.colors import HexColor

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=2*cm, rightMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        accent = HexColor("#2b6777")

        title_style = ParagraphStyle("title", parent=styles["Title"],
                                     textColor=accent, fontSize=22, spaceAfter=6)
        h1_style = ParagraphStyle("h1", parent=styles["Heading1"],
                                  textColor=accent, fontSize=14, spaceAfter=4)
        h2_style = ParagraphStyle("h2", parent=styles["Heading2"],
                                  textColor=HexColor("#1a4f5c"), fontSize=12, spaceAfter=4)
        body_style = ParagraphStyle("body", parent=styles["Normal"],
                                    fontSize=10, leading=16, spaceAfter=8)

        story = [
            Paragraph(folder.name, title_style),
            Paragraph(f"Generated {datetime.utcnow().strftime('%B %d, %Y')}", styles["Normal"]),
            Spacer(1, 0.5*cm),
            Paragraph("Project Summary", h1_style),
            Spacer(1, 0.2*cm),
        ]

        for para in rag_summary.split("\n\n"):
            story.append(Paragraph(para.replace("\n", "<br/>"), body_style))

        if notes:
            story += [Spacer(1, 0.5*cm), Paragraph("Notes", h1_style)]
            for n in notes:
                story.append(Paragraph(n.title or "Untitled", h2_style))
                story.append(Paragraph((n.content or "").replace("\n", "<br/>"), body_style))
                story.append(Spacer(1, 0.3*cm))

        doc.build(story)
        buf.seek(0)
        return buf

    except ImportError:
        raise HTTPException(500, "reportlab not installed. Run: uv add reportlab")


@router.post("/folders/{folder_id}/generate-document/")
def generate_document(
    folder_id: int,
    fmt: str = Query("docx", regex="^(docx|pdf)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = db.query(Folder).filter(Folder.id == folder_id, Folder.user_id == user.id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")

    notes = db.query(Note).filter(Note.folder_id == folder_id).all()

    # Use RAG to generate a full project summary
    from langchain_groq import ChatGroq
    from langchain_core.messages import SystemMessage, HumanMessage

    llm = ChatGroq(
        groq_api_key=os.getenv("GROQ_API_KEY"),
        model_name="llama-3.1-8b-instant",
        temperature=0.2,
    )

    # Pull relevant chunks from ChromaDB
    chunks = query_documents(folder_id, "project overview summary goals features", n_results=8)
    context = "\n\n".join(chunks) if chunks else "No uploaded resources found."

    notes_text = "\n".join([f"- {n.title}: {(n.content or '')[:300]}" for n in notes])

    prompt = (
        f"You are writing a professional project documentation for '{folder.name}'.\n"
        f"Use the following uploaded resource content and notes to write a comprehensive summary.\n\n"
        f"RESOURCE CONTENT:\n{context}\n\n"
        f"NOTES:\n{notes_text or 'No notes.'}\n\n"
        "Write a detailed, structured project summary covering: purpose, key features, technical details, "
        "current status, and any important findings from the resources. Be thorough and professional."
    )

    response = llm.invoke([
        SystemMessage(content="You are a professional technical writer."),
        HumanMessage(content=prompt),
    ])
    rag_summary = response.content

    safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in folder.name)

    if fmt == "pdf":
        buf = _make_pdf(folder, notes, rag_summary)
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}_document.pdf"'},
        )
    else:
        buf = _make_docx(folder, notes, rag_summary)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}_document.docx"'},
        )