import { Link, useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api";
import { ConfirmBox } from "./App";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import "./project_folder.css";
import "./loading.css";
import p_logo from "./assets/profile_logo.png";

/* ── Toast ────────────────────────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast${type === "error" ? " error" : ""}`}>{message}</div>;
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((m, t = "success") => setToast({ message: m, type: t, key: Date.now() }), []);
  const el = toast ? <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} /> : null;
  return [el, show];
}

function SkeletonRows({ count = 3 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── File icon by extension ───────────────────────────────────────────────── */
function fileIcon(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "📄";
  if (ext === "docx" || ext === "doc") return "📝";
  if (ext === "csv") return "📊";
  if (ext === "md") return "📋";
  return "📃";
}

function fileBg(filename) {
  return "#e8f0fd"; // all cards blue
}

/* ── ProjectFolder ────────────────────────────────────────────────────────── */
function ProjectFolder() {
  const { folderId } = useParams();
  const navigate = useNavigate();

  const [folder, setFolder]         = useState(null);
  const [allFolders, setAllFolders] = useState([]);
  const [activeTab, setActiveTab]   = useState("resources");
  const [toastEl, showToast]        = useToast();

  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingNotes, setLoadingNotes]         = useState(true);
  const [loadingTasks, setLoadingTasks]         = useState(true);

  // Resources
  const [resources, setResources]     = useState([]);
  const [uploading, setUploading]     = useState(false);
  const [deletingRes, setDeletingRes] = useState(null);
  const [loadingRes, setLoadingRes]   = useState(null); // resource id currently loading
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const fileInputRef  = useRef();
  const chatFileRef   = useRef();
  const textareaRef   = useRef(null);

  // Notes
  const [notes, setNotes]               = useState([]);
  const [activeNote, setActiveNote]     = useState(null);
  const [noteTitle, setNoteTitle]       = useState("");
  const [noteContent, setNoteContent]   = useState("");
  const [savingNote, setSavingNote]     = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);

  // Tasks
  const [tasks, setTasks]                   = useState([]);
  const [taskInput, setTaskInput]           = useState("");
  const [addingTask, setAddingTask]         = useState(false);
  const [showTaskModal, setShowTaskModal]   = useState(false);
  const [togglingTask, setTogglingTask]     = useState(null);
  const [deletingTask, setDeletingTask]     = useState(null);

  // Chat
  const [messages, setMessages]       = useState([{ role: "bot", text: "👋 Hello! Ask me to summarize this project, generate a document, add tasks, or ask anything about your resources." }]);
  const [query, setQuery]             = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId]     = useState(uuidv4());
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions]       = useState([]);
  const chatEndRef = useRef();

  // Load everything in parallel on mount
  useEffect(() => {
    if (!folderId) return;
    Promise.all([
      api.getFolder(folderId),
      api.getFolders(),
    ]).then(([f, all]) => { setFolder(f); setAllFolders(all); }).catch(console.error);

    api.getResources(folderId).then(setResources).catch(console.error).finally(() => setLoadingResources(false));
    api.getNotes(folderId).then(setNotes).catch(console.error).finally(() => setLoadingNotes(false));
    api.getTasks(folderId).then(setTasks).catch(console.error).finally(() => setLoadingTasks(false));
  }, [folderId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Ctrl+B
  useEffect(() => {
    const h = (e) => { if (e.ctrlKey && e.key === "b") { e.preventDefault(); toggleHistory(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showHistory]);

  const toggleHistory = async () => {
    if (!showHistory) {
      const data = await api.getFolderHistory(folderId).catch(() => []);
      setSessions(data);
    }
    setShowHistory((p) => !p);
  };

  const newConversation = () => {
    setSessionId(uuidv4());
    setMessages([{ role: "bot", text: "👋 New conversation! How can I help with this project?" }]);
  };

  const loadSession = (s) => {
    setSessionId(s.session_id);
    setMessages(s.messages.map((m) => ({ role: m.role, text: m.text })));
    setShowHistory(false);
  };

  const deleteSession = async (e, sid) => {
    e.stopPropagation();
    await api.deleteFolderSession(folderId, sid).catch(() => {});
    setSessions((p) => p.filter((s) => s.session_id !== sid));
  };

  /* ── Resource handlers ──────────────────────────────────────────────────── */
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadResource(folderId, file);
      setResources((p) => [...p, res]);
      showToast("✅ File uploaded and indexed!");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (chatFileRef.current) chatFileRef.current.value = "";
    }
  };

  // Fetch resource with auth and return a blob URL
  const fetchResourceBlob = async (resource) => {
    const token = localStorage.getItem("tasknest_token");
    const url   = api.getResourceUrl(folderId, resource.id);
    const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Failed to load file");
    return await res.blob();
  };

  // Click on card → open in new tab (PDF/TXT/MD) or download (DOCX/CSV)
  const handleViewResource = async (resource) => {
    const ext = resource.filename.split(".").pop()?.toLowerCase();
    setLoadingRes(resource.id);
    try {
      const blob   = await fetchResourceBlob(resource);
      const objUrl = URL.createObjectURL(blob);
      if (ext === "pdf") {
        window.open(objUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
      } else {
        const a = document.createElement("a");
        a.href = objUrl; a.download = resource.filename; a.click();
        setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
        showToast("📥 Downloaded!");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoadingRes(null);
    }
  };

  // Download button on card → always force-download
  const handleDownloadResource = async (e, resource) => {
    e.stopPropagation();
    setLoadingRes(resource.id);
    try {
      const blob   = await fetchResourceBlob(resource);
      const objUrl = URL.createObjectURL(blob);
      const a      = document.createElement("a");
      a.href = objUrl; a.download = resource.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
      showToast("📥 Downloaded!");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoadingRes(null);
    }
  };

  const handleDeleteResource = async (id) => {
    if (!confirm("Delete this resource?")) return;
    setDeletingRes(id);
    try {
      await api.deleteResource(folderId, id);
      setResources((p) => p.filter((r) => r.id !== id));
      showToast("🗑️ Deleted");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeletingRes(null);
    }
  };

  // Generate document and auto-download
  const handleGenerateDoc = async (fmt) => {
    setGeneratingDoc(fmt);
    try {
      const blob   = await api.downloadDocument(folderId, fmt);
      const objUrl = URL.createObjectURL(blob);
      const a      = document.createElement("a");
      a.href = objUrl; a.download = `${folder?.name || "document"}.${fmt}`; a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
      showToast(`✅ ${fmt.toUpperCase()} downloaded!`);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setGeneratingDoc(false);
    }
  };

  /* ── Note handlers ──────────────────────────────────────────────────────── */
  const handleNewNote = async () => {
    setCreatingNote(true);
    try {
      const note = await api.createNote(folderId, "Untitled Note", "");
      setNotes((p) => [note, ...p]);
      setActiveNote(note); setNoteTitle(note.title); setNoteContent("");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setCreatingNote(false);
    }
  };

  const handleSaveNote = async () => {
    if (!activeNote) return;
    setSavingNote(true);
    try {
      const updated = await api.updateNote(folderId, activeNote.id, noteTitle, noteContent);
      setNotes((p) => p.map((n) => (n.id === updated.id ? updated : n)));
      setActiveNote(updated);
      showToast("✅ Saved");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm("Delete?")) return;
    await api.deleteNote(folderId, noteId).catch(console.error);
    setNotes((p) => p.filter((n) => n.id !== noteId));
    if (activeNote?.id === noteId) {
      setActiveNote(null); setNoteTitle(""); setNoteContent("");
    }
  };

  /* ── Task handlers ──────────────────────────────────────────────────────── */
  const handleAddTask = async () => {
    if (!taskInput.trim()) return;
    setAddingTask(true);
    try {
      const t = await api.createTask(folderId, taskInput.trim());
      setTasks((p) => [...p, t]);
      setTaskInput(""); setShowTaskModal(false);
      showToast("✅ Task added");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAddingTask(false);
    }
  };

  const toggleTask = async (task) => {
    setTogglingTask(task.id);
    try {
      const updated = await api.updateTask(folderId, task.id, { completed: !task.completed });
      setTasks((p) => p.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setTogglingTask(null);
    }
  };

  const handleDeleteTask = async (id) => {
    setDeletingTask(id);
    try {
      await api.deleteTask(folderId, id);
      setTasks((p) => p.filter((t) => t.id !== id));
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setDeletingTask(null);
    }
  };

  /* ── Chat ───────────────────────────────────────────────────────────────── */
  const handleDocDownload = async (targetFolderId, fmt) => {
    setMessages((p) => [...p, { role: "bot", text: `⏳ Generating ${fmt.toUpperCase()}...` }]);
    try {
      const blob = await api.downloadDocument(targetFolderId, fmt);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `document.${fmt}`; a.click();
      URL.revokeObjectURL(url);
      setMessages((p) => [...p.slice(0, -1), { role: "bot", text: `✅ ${fmt.toUpperCase()} downloaded!` }]);
    } catch (err) {
      setMessages((p) => [...p.slice(0, -1), { role: "bot", text: "❌ " + err.message }]);
    }
  };

  const sendMessage = async () => {
  const text = query.trim();
  if (!text || chatLoading) return;

  if (textareaRef.current) {
    textareaRef.current.style.height = "auto";
  }

  setMessages((p) => [...p, { role: "user", text }]);
  setQuery("");
  setChatLoading(true);

  try {
    const navKw = ["open", "go to", "navigate to", "switch to", "take me to"];
    const msgLower = text.toLowerCase();

    if (navKw.some((k) => msgLower.includes(k))) {
      const matched = allFolders.find(
        (f) => f.id !== parseInt(folderId) &&
          f.name.toLowerCase() === msgLower
            .replace(/open|go to|navigate to|switch to|take me to/gi, "").trim()
      );
      if (matched) {
        const botMsg = { role: "bot", text: `📁 Navigating to **${matched.name}**...` };
        setMessages((p) => [...p, botMsg]);
        setTimeout(() => navigate(`/project_folder/${matched.id}`), 700);
        setChatLoading(false);
        return;
      } else if (navKw.some((k) => msgLower.includes(k))) {
        const otherFolders = allFolders.filter((f) => f.id !== parseInt(folderId));
        if (otherFolders.length > 0) {
          const list = otherFolders.map((f) => `• ${f.name}`).join("\n");
          const botMsg = { role: "bot", text: `❌ No folder found with that name. Your other projects:\n\n${list}` };
          setMessages((p) => [...p, botMsg]);
          setChatLoading(false);
          return;
        }
      }
    }

    const res = await api.chat(folderId, text, sessionId);

    if (res.summary_saved) {
      api.getNotes(folderId).then(setNotes).catch(console.error);
    }

    if (res.intent === "document_agent" && res.doc_pending) {
      const botMsg = {
        role: "bot",
        text: res.answer,
        isDocConfirm: true,
        folderId: res.folder_id || parseInt(folderId),
        fmt: res.fmt,
      };
      setMessages((p) => [...p, botMsg]);
      setChatLoading(false);
      return;
    }

    if (res.intent === "task_agent") api.getTasks(folderId).then(setTasks).catch(console.error);
    if (res.intent === "notes_agent") api.getNotes(folderId).then(setNotes).catch(console.error);

    const botMsg = { role: "bot", text: res.answer, showCopy: true };
    setMessages((p) => [...p, botMsg]);

  } catch (err) {
    setMessages((p) => [...p, { role: "bot", text: "⚠️ " + err.message }]);
  } finally {
    setChatLoading(false);
  }
};

  return (
    <div className="app">
      {toastEl}

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <div className="nav">
        <img src="/favicon.png" alt="ResHub logo" 
        style={{height: "50px", width: "50px"}}/>
        <Link to="/" className="link"><h1 className="title">ResHub</h1></Link>
        {folder && <span className="folder-breadcrumb">/ {folder.name}</span>}
        <Link to="/profile" style={{ marginLeft: "auto" }}>
          <img src={p_logo} alt="Profile" className="profile_logo" />
        </Link>
      </div>

      <div className="main-content">

        {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
        <div className="folders">
          <div className="tabs">
            {["resources", "notes", "todo"].map((tab) => (
              <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "resources" ? "📁 Resources" : tab === "notes" ? "📝 Notes" : "✅ To Do"}
              </button>
            ))}
          </div>

          {/* ── Resources ─────────────────────────────────────────────────── */}
          {activeTab === "resources" && (
            <div className="resources-section">
              <div className="section-header">
                <h2>Resources</h2>
                <div className="resource-header-actions">
                  <button
                    className="gen-doc-btn"
                    onClick={() => handleGenerateDoc("pdf")}
                    disabled={!!generatingDoc}
                    title="Generate PDF of this project"
                  >
                    {generatingDoc === "pdf" ? <><span className="btn-spinner" />...</> : "⬇ PDF"}
                  </button>
                  <button
                    className="gen-doc-btn"
                    onClick={() => handleGenerateDoc("docx")}
                    disabled={!!generatingDoc}
                    title="Generate DOCX of this project"
                  >
                    {generatingDoc === "docx" ? <><span className="btn-spinner" />...</> : "⬇ DOCX"}
                  </button>
                  <button
                    className="upload-btn"
                    onClick={() => fileInputRef.current.click()}
                    disabled={uploading}
                  >
                    {uploading ? <><span className="btn-spinner" />Uploading...</> : "Upload"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    accept=".pdf,.txt,.docx,.md,.csv"
                    onChange={handleUpload}
                  />
                </div>
              </div>
              {uploading && (
                <div className="upload-progress-wrap">
                  <div className="upload-progress-bar" />
                </div>
              )}
              <div className="file-manager-grid">
                {loadingResources ? (
                  <SkeletonRows count={3} />
                ) : resources.length === 0 ? (
                  <p className="empty-msg">No files uploaded yet. Upload PDF, DOCX, TXT, MD, or CSV files.</p>
                ) : resources.map((r) => (
                  <div
                    key={r.id}
                    className={`file-card${deletingRes === r.id ? " deleting" : ""}${loadingRes === r.id ? " loading" : ""}`}
                    style={{ background: fileBg(r.filename) }}
                    onClick={() => loadingRes === r.id ? null : handleViewResource(r)}
                    title={`Click to open ${r.filename}`}
                  >
                    {loadingRes === r.id && (
                      <div className="file-card-loading-overlay">
                        <span className="btn-spinner btn-spinner--dark" style={{ width: 22, height: 22 }} />
                      </div>
                    )}
                    <div className="file-card-icon">{fileIcon(r.filename)}</div>
                    <div className="file-card-info">
                      <span className="file-card-name">{r.filename}</span>
                      <span className={`resource-badge ${r.indexed ? "indexed" : "pending"}`}>
                        {r.indexed ? "✓ Indexed" : "Indexing..."}
                      </span>
                    </div>
                    <div className="file-card-actions">
                      <button
                        className="file-card-action-btn download"
                        onClick={(e) => handleDownloadResource(e, r)}
                        disabled={loadingRes === r.id}
                        title="Download"
                      >{loadingRes === r.id ? <span className="btn-spinner btn-spinner--dark" style={{ width: 10, height: 10 }} /> : "⬇"}</button>
                      <button
                        className="file-card-action-btn delete"
                        onClick={(e) => { e.stopPropagation(); handleDeleteResource(r.id); }}
                        disabled={deletingRes === r.id || loadingRes === r.id}
                        title="Delete"
                      >
                        {deletingRes === r.id
                          ? <span className="btn-spinner btn-spinner--dark" style={{ width: 10, height: 10 }} />
                          : "✕"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Notes ─────────────────────────────────────────────────────── */}
          {activeTab === "notes" && (
            <div className="notes-section">
              <div className="notes-sidebar">
                <div className="section-header">
                  <h2>Notes</h2>
                  <button className="add_button" onClick={handleNewNote} disabled={creatingNote}>
                    {creatingNote
                      ? <span className="btn-spinner" style={{ width: 12, height: 12 }} />
                      : "+"}
                  </button>
                </div>
                <div className="notes-list">
                  {loadingNotes ? (
                    <SkeletonRows count={4} />
                  ) : notes.length === 0 ? (
                    <p className="empty-msg">No notes yet.</p>
                  ) : notes.map((n) => (
                    <div
                      key={n.id}
                      className={`note-item ${activeNote?.id === n.id ? "active" : ""}`}
                      onClick={() => { setActiveNote(n); setNoteTitle(n.title); setNoteContent(n.content || ""); }}
                    >
                      <span className="note-item-title">{n.title || "Untitled"}</span>
                      <button
                        className="resource-delete-btn"
                        onClick={(e) => { e.stopPropagation(); handleDeleteNote(n.id); }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="note-editor">
                {activeNote ? (
                  <>
                    <input
                      className="note-title-input"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="Note title..."
                    />
                    <textarea
                      className="note-content-input"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Start writing..."
                    />
                    <button className="upload-btn" onClick={handleSaveNote} disabled={savingNote}>
                      {savingNote ? <><span className="btn-spinner" />Saving...</> : "Save Note"}
                    </button>
                  </>
                ) : (
                  <div className="note-placeholder">
                    <p>Select a note or create a new one</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Todo ──────────────────────────────────────────────────────── */}
          {activeTab === "todo" && (
            <div className="todo-section">
              <div className="add_task">
                <h2>To Do List</h2>
                <button className="add_button" onClick={() => setShowTaskModal(true)}>+</button>
              </div>
              <ul className="todo-list">
                {loadingTasks ? (
                  <SkeletonRows count={3} />
                ) : tasks.length === 0 ? (
                  <li className="empty-msg">No tasks yet.</li>
                ) : tasks.map((task) => (
                  <li
                    key={task.id}
                    className={`task-item${togglingTask === task.id ? " toggling" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      disabled={togglingTask === task.id}
                      onChange={() => toggleTask(task)}
                    />
                    <span
                      className="task-md"
                      style={{
                        textDecoration: task.completed ? "line-through" : "none",
                        flex: 1,
                        opacity: task.completed ? 0.5 : 1,
                      }}
                    >
                      <ReactMarkdown>{task.text}</ReactMarkdown>
                    </span>
                    {task.deadline && (
                      <span className="task-deadline">📅 {task.deadline.slice(0, 10)}</span>
                    )}
                    <button
                      className="resource-delete-btn"
                      onClick={() => handleDeleteTask(task.id)}
                      disabled={deletingTask === task.id}
                    >
                      {deletingTask === task.id
                        ? <span className="btn-spinner btn-spinner--dark" style={{ width: 10, height: 10 }} />
                        : "✕"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── CHATBOT ──────────────────────────────────────────────────────── */}
        <div className="chatbot">
          <div className="chatbot-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {folder && (
                <span className="chatbot-folder-tag">{folder.name}</span>
              )}
            </div>
            <span style={{ fontWeight: 500, fontSize: 19 }}>ResHub Assistant</span>
          </div>

          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* History sidebar */}
            {showHistory && (
              <div className="history-sidebar">
                <div className="history-newchat">
                  <p className="history-label">History</p>
                  <button className="chatbot-icon-btn" onClick={newConversation} title="New conversation">✦</button>
                </div>
                {sessions.length === 0 && (
                  <p className="history-empty">No conversations yet.</p>
                )}
                {sessions.map((s) => (
                  <div
                    key={s.session_id}
                    className="history-item"
                    onClick={() => loadSession(s)}
                  >
                    <span className="history-item-text">
                      {s.messages[0]?.text?.slice(0, 36) || "Conversation"}...
                    </span>
                    <button
                      className="history-delete-btn"
                      onClick={(e) => deleteSession(e, s.session_id)}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Messages */}
              <div className="chat-messages">
                {messages.map((m, i) => (
                  <div key={i} className={`chat-bubble ${m.role}`}>
                    <div className="bubble-text">
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                    {m.isDocConfirm && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="confirm-option-btn" onClick={() => handleDocDownload(m.folderId, "pdf")}>📄 PDF</button>
                        <button className="confirm-option-btn" onClick={() => handleDocDownload(m.folderId, "docx")}>📝 DOCX</button>
                      </div>
                    )}
                    {m.showCopy && (
                      <button
                        className="copy-to-notes-btn"
                        onClick={async () => {
                          try {
                            const n = await api.createNote(folderId, m.text.slice(0, 60), m.text);
                            setNotes((p) => [n, ...p]);
                            showToast("📝 Saved to Notes!");
                          } catch (err) { showToast(err.message, "error"); }
                        }}
                      >📝 Copy to Notes</button>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-bubble bot">
                    <div className="bubble-text">
                      <div className="typing-dots"><span /><span /><span /></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* ── Chat Input ─────────────────────────────────────────────── */}
              <div className="chat_input_wrapper">
                <textarea
                  ref={textareaRef}
                  className="query_box"
                  placeholder="Open a folder, add tasks, generate documents..."
                  value={query}
                  rows={1}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <div className="chat_toolbar">
                  <button
                    className="plus_btn"
                    onClick={() => chatFileRef.current.click()}
                    title="Upload file"
                  >+</button>
                  <input
                    type="file"
                    ref={chatFileRef}
                    style={{ display: "none" }}
                    accept=".pdf,.txt,.docx,.md,.csv"
                    onChange={handleUpload}
                  />
                  <button
                    className="send_btnf"
                    onClick={sendMessage}
                    disabled={chatLoading || !query.trim()}
                  >
                    {chatLoading ? "..." : ""}
                    {!chatLoading && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5" />
                        <polyline points="5 12 12 5 19 12" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── Task Modal ────────────────────────────────────────────────────── */}
      {showTaskModal && (
        <Modal title="Add Task" onClose={() => setShowTaskModal(false)}>
          <div className="modal-body">
            <label>Task Name *</label>
            <input
              autoFocus
              className="modal-input"
              placeholder="e.g. Write unit tests"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
            />
          </div>
          <div className="modal-footer">
            <button className="modal-cancel" onClick={() => setShowTaskModal(false)}>Cancel</button>
            <button
              className="modal-confirm"
              onClick={handleAddTask}
              disabled={addingTask || !taskInput.trim()}
            >
              {addingTask ? <><span className="btn-spinner" />Adding...</> : "Add Task"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ProjectFolder;