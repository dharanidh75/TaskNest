import { Link, useParams } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api";
import "./project_folder.css";
import "./loading.css";
import p_logo from "./assets/profile_logo.png";

/* ── Toast ───────────────────────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast${type === "error" ? " error" : ""}`}>{message}</div>;
}
function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, type = "success") => {
    setToast({ message, type, key: Date.now() });
  }, []);
  const el = toast
    ? <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} />
    : null;
  return [el, show];
}

/* ── Skeleton rows ────────────────────────────────────────────────────────── */
function SkeletonRows({ count = 3 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────────── */
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const close = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
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

/* ── ProjectFolder ────────────────────────────────────────────────────────── */
function ProjectFolder() {
  const { folderId } = useParams();
  const [folder, setFolder]       = useState(null);
  const [activeTab, setActiveTab] = useState("resources");
  const [toastEl, showToast]      = useToast();

  // Loading states per section
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingNotes, setLoadingNotes]         = useState(true);
  const [loadingTasks, setLoadingTasks]         = useState(true);

  // Resources
  const [resources, setResources]   = useState([]);
  const [uploading, setUploading]   = useState(false);
  const [deletingRes, setDeletingRes] = useState(null);
  const fileInputRef = useRef();

  // Notes
  const [notes, setNotes]           = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [noteTitle, setNoteTitle]   = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);

  // Tasks
  const [tasks, setTasks]           = useState([]);
  const [addingTask, setAddingTask] = useState(false);
  const [taskInput, setTaskInput]   = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [togglingTask, setTogglingTask]   = useState(null);
  const [deletingTask, setDeletingTask]   = useState(null);

  // Chat
  const [messages, setMessages] = useState([
    { role: "bot", text: "👋 Hello! Ask me anything about your project resources. I can also add tasks, create notes, and more!" }
  ]);
  const [query, setQuery]         = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef();

  // Load all data in parallel
  useEffect(() => {
    if (!folderId) return;
    api.getFolder(folderId).then(setFolder).catch(console.error);

    api.getResources(folderId)
      .then(setResources).catch(console.error)
      .finally(() => setLoadingResources(false));

    api.getNotes(folderId)
      .then(setNotes).catch(console.error)
      .finally(() => setLoadingNotes(false));

    api.getTasks(folderId)
      .then(setTasks).catch(console.error)
      .finally(() => setLoadingTasks(false));
  }, [folderId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Resources ───────────────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadResource(folderId, file);
      setResources((prev) => [...prev, res]);
      showToast("✅ File uploaded and indexed!");
    } catch (err) {
      showToast("Upload error: " + err.message, "error");
    } finally {
      setUploading(false);
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (!confirm("Delete this resource?")) return;
    setDeletingRes(resourceId);
    try {
      await api.deleteResource(folderId, resourceId);
      setResources((prev) => prev.filter((r) => r.id !== resourceId));
      showToast("🗑️ Resource deleted");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setDeletingRes(null);
    }
  };

  // ── Notes ───────────────────────────────────────────────────────────────────
  const handleNewNote = async () => {
    setCreatingNote(true);
    try {
      const note = await api.createNote(folderId, "Untitled Note", "");
      setNotes((prev) => [note, ...prev]);
      openNote(note);
      showToast("📝 Note created");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setCreatingNote(false);
    }
  };

  const openNote = (note) => {
    setActiveNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content || "");
  };

  const handleSaveNote = async () => {
    if (!activeNote) return;
    setSavingNote(true);
    try {
      const updated = await api.updateNote(folderId, activeNote.id, noteTitle, noteContent);
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setActiveNote(updated);
      showToast("✅ Note saved");
    } catch (err) {
      showToast("Error saving: " + err.message, "error");
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm("Delete this note?")) return;
    try {
      await api.deleteNote(folderId, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (activeNote?.id === noteId) { setActiveNote(null); setNoteTitle(""); setNoteContent(""); }
      showToast("🗑️ Note deleted");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  };

  const copyToNotes = async (text) => {
    try {
      const note = await api.createNote(folderId, text.slice(0, 60) + "...", text);
      setNotes((prev) => [note, ...prev]);
      showToast("📝 Copied to notes!");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  };

  // ── Tasks ───────────────────────────────────────────────────────────────────
  const handleAddTask = async () => {
    if (!taskInput.trim()) return;
    setAddingTask(true);
    try {
      const task = await api.createTask(folderId, taskInput.trim());
      setTasks((prev) => [...prev, task]);
      setTaskInput("");
      setShowTaskModal(false);
      showToast("✅ Task added");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setAddingTask(false);
    }
  };

  const toggleTask = async (task) => {
    setTogglingTask(task.id);
    try {
      const updated = await api.updateTask(folderId, task.id, { completed: !task.completed });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setTogglingTask(null);
    }
  };

  const handleDeleteTask = async (taskId) => {
    setDeletingTask(taskId);
    try {
      await api.deleteTask(folderId, taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast("🗑️ Task deleted");
    } catch (err) {
      showToast("Error: " + err.message, "error");
    } finally {
      setDeletingTask(null);
    }
  };

  // ── Chat ────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = query.trim();
    if (!text || chatLoading) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setQuery("");
    setChatLoading(true);
    try {
      const res = await api.chat(folderId, text);
      setMessages((prev) => [...prev, { role: "bot", text: res.answer, intent: res.intent, showCopy: true }]);
      if (res.intent === "task_agent") api.getTasks(folderId).then(setTasks).catch(console.error);
      if (res.intent === "notes_agent") api.getNotes(folderId).then(setNotes).catch(console.error);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", text: "⚠️ Error: " + err.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="app">
      {toastEl}

      <div className="nav">
        <Link to="/" className="link"><h1 className="title">TaskNest</h1></Link>
        {folder && <span className="folder-breadcrumb">/ {folder.name}</span>}
        <Link to="/profile" className="profile_logo" style={{ marginLeft: "auto" }}>
          <img src={p_logo} alt="Profile" className="profile_logo" />
        </Link>
      </div>

      <div className="main-content">
        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
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

          {/* Resources Tab */}
          {activeTab === "resources" && (
            <div className="resources-section">
              <div className="section-header">
                <h2>Resources</h2>
                <button
                  className="upload-btn"
                  onClick={() => fileInputRef.current.click()}
                  disabled={uploading}
                >
                  {uploading
                    ? <><span className="btn-spinner" />Uploading...</>
                    : "Upload"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  accept=".pdf,.txt,.docx,.md,.csv"
                  onChange={handleUpload}
                />
              </div>

              {uploading && (
                <div className="upload-progress-wrap">
                  <div className="upload-progress-bar" />
                </div>
              )}

              <div className="resource-list">
                {loadingResources
                  ? <SkeletonRows count={3} />
                  : resources.length === 0
                    ? <p className="empty-msg">No files uploaded. Upload PDF, DOCX, TXT files to power the chatbot.</p>
                    : resources.map((r) => (
                        <div key={r.id} className={`resource-item${deletingRes === r.id ? " deleting" : ""}`}>
                          <span className="resource-icon">
                            {r.filename.endsWith(".pdf") ? "📄" : r.filename.endsWith(".docx") ? "📝" : "📃"}
                          </span>
                          <span className="resource-name">{r.filename}</span>
                          <span className={`resource-badge ${r.indexed ? "indexed" : "pending"}`}>
                            {r.indexed ? "✓ Indexed" : "Indexing..."}
                          </span>
                          <button
                            className="resource-delete-btn"
                            onClick={() => handleDeleteResource(r.id)}
                            disabled={deletingRes === r.id}
                            title="Delete"
                          >
                            {deletingRes === r.id
                              ? <span className="btn-spinner btn-spinner--dark" style={{ width: 10, height: 10 }} />
                              : "✕"}
                          </button>
                        </div>
                      ))
                }
              </div>
            </div>
          )}

          {/* Notes Tab */}
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
                  {loadingNotes
                    ? <SkeletonRows count={4} />
                    : notes.length === 0
                      ? <p className="empty-msg">No notes yet. Create one or use "Copy to Notes" in chat.</p>
                      : notes.map((n) => (
                          <div
                            key={n.id}
                            className={`note-item ${activeNote?.id === n.id ? "active" : ""}`}
                            onClick={() => openNote(n)}
                          >
                            <span className="note-item-title">{n.title || "Untitled"}</span>
                            <button
                              className="resource-delete-btn"
                              onClick={(e) => { e.stopPropagation(); handleDeleteNote(n.id); }}
                            >✕</button>
                          </div>
                        ))
                  }
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
                    <p>Select a note or create a new one →</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Todo Tab */}
          {activeTab === "todo" && (
            <div className="todo-section">
              <div className="add_task">
                <h2>To Do List</h2>
                <button className="add_button" onClick={() => setShowTaskModal(true)}>+</button>
              </div>

              <ul className="todo-list">
                {loadingTasks
                  ? <SkeletonRows count={3} />
                  : tasks.length === 0
                    ? <li className="empty-msg">No tasks yet. Add one or ask the chatbot to add tasks for you.</li>
                    : tasks.map((task) => (
                        <li key={task.id} className={`task-item${togglingTask === task.id ? " toggling" : ""}`}>
                          <input
                            type="checkbox"
                            checked={task.completed}
                            disabled={togglingTask === task.id}
                            onChange={() => toggleTask(task)}
                          />
                          <span style={{ textDecoration: task.completed ? "line-through" : "none", flex: 1, color: task.completed ? "#aaa" : "inherit" }}>
                            {task.text}
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
                      ))
                }
              </ul>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL — Chatbot ─────────────────────────────────────── */}
        <div className="chatbot">
          <h2 className="chatbot-header">
            🤖 RAG Assistant
            {folder && <span className="chatbot-folder-tag">{folder.name}</span>}
          </h2>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                <div className="bubble-text">{m.text}</div>
                {m.showCopy && (
                  <button className="copy-to-notes-btn" onClick={() => copyToNotes(m.text)} title="Save to Notes">
                    📝 Copy to Notes
                  </button>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-bubble bot">
                <div className="bubble-text" style={{ background: "#e0ecf1" }}>
                  <div className="typing-dots"><span/><span/><span/></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat_input_container" style={{ margin: "10px 20px 20px" }}>
            <input
              type="text"
              className="query_box"
              placeholder="Ask about your resources, add tasks, create notes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button className="send_btn" onClick={sendMessage} disabled={chatLoading}>
              {chatLoading ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>

      {/* Add Task Modal */}
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
            <button className="modal-confirm" onClick={handleAddTask} disabled={addingTask || !taskInput.trim()}>
              {addingTask ? <><span className="btn-spinner" />Adding...</> : "Add Task"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ProjectFolder;