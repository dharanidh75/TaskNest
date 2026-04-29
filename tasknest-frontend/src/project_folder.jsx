import { Link, useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { api } from "./api";
import "./project_folder.css";
import p_logo from "./assets/profile_logo.png";

function ProjectFolder() {
  const { folderId } = useParams();
  const [folder, setFolder] = useState(null);
  const [activeTab, setActiveTab] = useState("resources"); // resources | notes | todo

  // Resources
  const [resources, setResources] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef();

  // Notes
  const [notes, setNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState([]);

  // Chat
  const [messages, setMessages] = useState([
    { role: "bot", text: "👋 Hello! Ask me anything about your project resources. I can also add tasks, create notes, and more!" }
  ]);
  const [query, setQuery] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef();

  // Load folder data
  useEffect(() => {
    if (!folderId) return;
    api.getFolder(folderId).then(setFolder).catch(console.error);
    api.getResources(folderId).then(setResources).catch(console.error);
    api.getNotes(folderId).then(setNotes).catch(console.error);
    api.getTasks(folderId).then(setTasks).catch(console.error);
  }, [folderId]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Resources ──────────────────────────────────────────────────────────────

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadResource(folderId, file);
      setResources([...resources, res]);
    } catch (err) {
      alert("Upload error: " + err.message);
    } finally {
      setUploading(false);
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (!confirm("Delete this resource?")) return;
    try {
      await api.deleteResource(folderId, resourceId);
      setResources(resources.filter((r) => r.id !== resourceId));
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // ── Notes ──────────────────────────────────────────────────────────────────

  const handleNewNote = async () => {
    try {
      const note = await api.createNote(folderId, "Untitled Note", "");
      setNotes([note, ...notes]);
      openNote(note);
    } catch (err) {
      alert("Error: " + err.message);
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
      setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
      setActiveNote(updated);
    } catch (err) {
      alert("Error saving: " + err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm("Delete this note?")) return;
    try {
      await api.deleteNote(folderId, noteId);
      setNotes(notes.filter((n) => n.id !== noteId));
      if (activeNote?.id === noteId) {
        setActiveNote(null);
        setNoteTitle("");
        setNoteContent("");
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const copyToNotes = async (text) => {
    try {
      const note = await api.createNote(folderId, text.slice(0, 60) + "...", text);
      setNotes([note, ...notes]);
      alert("✅ Copied to notes!");
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // ── Tasks ──────────────────────────────────────────────────────────────────

  const handleAddTask = async () => {
    const text = prompt("Enter Task Name:");
    if (!text?.trim()) return;
    try {
      const task = await api.createTask(folderId, text.trim());
      setTasks([...tasks, task]);
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const toggleTask = async (task) => {
    try {
      const updated = await api.updateTask(folderId, task.id, { completed: !task.completed });
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await api.deleteTask(folderId, taskId);
      setTasks(tasks.filter((t) => t.id !== taskId));
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // ── Chat ───────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = query.trim();
    if (!text || chatLoading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setQuery("");
    setChatLoading(true);

    try {
      const res = await api.chat(folderId, text);
      setMessages((prev) => [...prev, {
        role: "bot",
        text: res.answer,
        intent: res.intent,
        showCopy: true,
      }]);
      // If agent performed a task/note action, refresh
      if (res.intent === "task_agent") {
        api.getTasks(folderId).then(setTasks).catch(console.error);
      }
      if (res.intent === "notes_agent") {
        api.getNotes(folderId).then(setNotes).catch(console.error);
      }
      if (res.intent === "folder_agent") {
        // Refresh handled by re-navigation if needed
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", text: "⚠️ Error: " + err.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="nav">
        <Link to="/" className="link">
          <h1 className="title">TaskNest</h1>
        </Link>
        {folder && <span className="folder-breadcrumb">/ {folder.name}</span>}
        <Link to="/profile" className="profile_logo" style={{ marginLeft: "auto" }}>
          <img src={p_logo} alt="Profile" className="profile_logo" />
        </Link>
      </div>

      <div className="main-content">
        {/* LEFT PANEL */}
        <div className="folders">
          {/* Tabs */}
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
                  {uploading ? "Uploading..." : "Upload"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  accept=".pdf,.txt,.docx,.md,.csv"
                  onChange={handleUpload}
                />
              </div>
              <div className="resource-list">
                {resources.length === 0 ? (
                  <p className="empty-msg">No files uploaded. Upload PDF, DOCX, TXT files to power the chatbot.</p>
                ) : (
                  resources.map((r) => (
                    <div key={r.id} className="resource-item">
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
                        title="Delete"
                      >✕</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === "notes" && (
            <div className="notes-section">
              <div className="notes-sidebar">
                <div className="section-header">
                  <h2>Notes</h2>
                  <button className="add_button" onClick={handleNewNote}>+</button>
                </div>
                <div className="notes-list">
                  {notes.length === 0 && (
                    <p className="empty-msg">No notes yet. Create one or use "Copy to Notes" in chat.</p>
                  )}
                  {notes.map((n) => (
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
                      {savingNote ? "Saving..." : "Save Note"}
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
                <button className="add_button" onClick={handleAddTask}>+</button>
              </div>
              <ul className="todo-list">
                {tasks.length === 0 && (
                  <li className="empty-msg">No tasks yet. Add one or ask the chatbot to add tasks for you.</li>
                )}
                {tasks.map((task) => (
                  <li key={task.id} className="task-item">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task)}
                    />
                    <span style={{ textDecoration: task.completed ? "line-through" : "none", flex: 1 }}>
                      {task.text}
                    </span>
                    {task.deadline && (
                      <span className="task-deadline">📅 {task.deadline.slice(0, 10)}</span>
                    )}
                    <button
                      className="resource-delete-btn"
                      onClick={() => handleDeleteTask(task.id)}
                    >✕</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* RIGHT PANEL - Chatbot */}
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
                  <button
                    className="copy-to-notes-btn"
                    onClick={() => copyToNotes(m.text)}
                    title="Save this response to Notes"
                  >
                    📝 Copy to Notes
                  </button>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-bubble bot">
                <span className="typing">Thinking...</span>
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
    </div>
  );
}

export default ProjectFolder;
