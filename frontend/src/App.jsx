import { useState, useEffect, useRef, useCallback } from "react";
import { Route, Routes, Link, useNavigate } from "react-router-dom";
import Profile from "./profile";
import ProjectFolder from "./project_folder";
import EditProfile from "./edit_profile";
import Auth from "./auth";
import p_logo from "./assets/profile_logo.png";
import folder_b from "./assets/folder_b.png";
import { api, isLoggedIn, getUsername, clearAuth } from "./api";
import "./App.css";
import "./loading.css";


/* ── Toast ───────────────────────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast${type === "error" ? " error" : ""}`}>{message}</div>;
}
function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, type = "success") => setToast({ message, type, key: Date.now() }), []);
  const el = toast ? <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} /> : null;
  return [el, show];
}

/* ── Modal ───────────────────────────────────────────────────────────────── */
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

/* ── ConfirmBox ───────────────────────────────────────────────────────────── */
export function ConfirmBox({ question, options, onSelect, onCancel }) {
  return (
    <div className="confirm-box">
      <p className="confirm-question">{question}</p>
      <div className="confirm-options">
        {options.map((opt) => (
          <button key={opt.value} className="confirm-option-btn" onClick={() => onSelect(opt)}>
            {opt.label}
          </button>
        ))}
      </div>
      {onCancel && <button className="confirm-cancel" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

/* ── App ──────────────────────────────────────────────────────────────────── */
function App() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/project_folder/:folderId" element={<ProtectedRoute><ProjectFolder /></ProtectedRoute>} />
      <Route path="/edit_profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
    </Routes>
  );
}

function ProtectedRoute({ children }) {
  const navigate = useNavigate();
  useEffect(() => { if (!isLoggedIn()) navigate("/auth"); }, []);
  return isLoggedIn() ? children : null;
}

/* ── Home ─────────────────────────────────────────────────────────────────── */
function Home() {
  const [folders, setFolders]       = useState([]);
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [creating, setCreating]     = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [toastEl, showToast]        = useToast();

  useEffect(() => {
    api.getFolders().then(setFolders).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleAddFolder = async () => {
    if (!folderName.trim()) return;
    setCreating(true);
    try {
      const f = await api.createFolder(folderName.trim(), folderDesc);
      setFolders((p) => [f, ...p]);
      setShowModal(false); setFolderName(""); setFolderDesc("");
      showToast("✅ Folder created!");
    } catch (e) { showToast(e.message, "error"); }
    finally { setCreating(false); }
  };

  const handleDelete = async (e, id) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Delete this folder and all its data?")) return;
    setDeletingId(id);
    try {
      await api.deleteFolder(id);
      setFolders((p) => p.filter((f) => f.id !== id));
      showToast("🗑️ Deleted");
    } catch (e) { showToast(e.message, "error"); }
    finally { setDeletingId(null); }
  };

  const filtered = folders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="app">
      {toastEl}
      <div className="nav">
        <img src="/favicon.png" alt="logo" 
        style={{ width: 50, height: 50 }}/>
        <h1 className="title">ResHub</h1>
        <span className="nav-username">👋 {getUsername()}</span>
        <Link to="/profile"><img src={p_logo} alt="Profile" className="profile_logo" /></Link>
      </div>
      <div className="main-content">
        <div className="folders">
          <div className="searchbar">
            <h1 className="folder_header">FOLDERS</h1>
            <input
              type="text"
              placeholder="Search folders..."
              className="search_bar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="folder_rack">
            {loading && [1, 2, 3, 4].map((i) => (
              <div key={i} className="folder_item_wrapper">
                <div className="skeleton skeleton-folder" />
                <div className="skeleton skeleton-text" />
              </div>
            ))}
            {!loading && filtered.length === 0 && (
              <p style={{ padding: "10px", color: "#777", marginTop: 100 }}>
                {search ? "No folders match." : "No folders yet. Click NEW to create one!"}
              </p>
            )}
            {!loading && filtered.map((folder) => (
              <div
                key={folder.id}
                className={`folder_item_wrapper${deletingId === folder.id ? " deleting" : ""}`}
              >
                <Link to={`/project_folder/${folder.id}`} className="folder_item">
                  <img src={folder_b} alt="folder" className="folder_icon_b" />
                  <p className="folder_name">{folder.name}</p>
                </Link>
                <button
                  className="folder_delete_btn"
                  onClick={(e) => handleDelete(e, folder.id)}
                  disabled={deletingId === folder.id}
                >
                  {deletingId === folder.id
                    ? <span className="btn-spinner btn-spinner--dark" style={{ width: 10, height: 10 }} />
                    : "✕"}
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setShowModal(true)} className="new_task_box">
            <div className="new_button">
              <span style={{ fontWeight: "bold" }}>NEW</span>
              <span>✏️</span>
            </div>
          </button>
        </div>

        <div className="chatbot">
          <HomeChatbot folders={folders} setFolders={setFolders} showToast={showToast} />
        </div>
      </div>

      {showModal && (
        <Modal title="Create New Folder" onClose={() => setShowModal(false)}>
          <div className="modal-body">
            <label>Folder Name *</label>
            <input
              autoFocus
              className="modal-input"
              placeholder="e.g. Finance App"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddFolder()}
            />
            <label>Description (optional)</label>
            <input
              className="modal-input"
              placeholder="Short description..."
              value={folderDesc}
              onChange={(e) => setFolderDesc(e.target.value)}
            />
          </div>
          <div className="modal-footer">
            <button className="modal-cancel" onClick={() => setShowModal(false)}>Cancel</button>
            <button
              className="modal-confirm"
              onClick={handleAddFolder}
              disabled={creating || !folderName.trim()}
            >
              {creating ? <><span className="btn-spinner" />Creating...</> : "Create Folder"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── HomeChatbot ──────────────────────────────────────────────────────────── */
function HomeChatbot({ folders, setFolders, showToast }) {
  const navigate = useNavigate();

  const [query, setQuery]             = useState("");
  const [messages, setMessages]       = useState([{ role: "bot", text: "👋 Hi! I'm your ResHub assistant. Ask me to open a folder, add tasks, generate documents, or anything else." }]);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);

  const chatEndRef  = useRef();
  const textareaRef = useRef(null);   // ← for the Claude-style input

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFolderSelectForTask = async (opt) => {
    const folderId = opt.value;
    const taskText = pendingTask;
    setPendingTask(null);
    setMessages((p) => p.filter((m) => !m.isConfirm));
    setChatLoading(true);
    try {
      await api.createTask(folderId, taskText);
      const botMsg = { role: "bot", text: `✅ Task **${taskText}** added to **${opt.label}**!` };
      setMessages((p) => [...p, botMsg]);
    } catch (err) {
      setMessages((p) => [...p, { role: "bot", text: "❌ " + err.message }]);
    } finally { setChatLoading(false); }
  };

  const sendMessage = async () => {
    const text = query.trim();
    if (!text || chatLoading) return;

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMsg = { role: "user", text };
    setMessages((p) => [...p, userMsg]);
    setQuery("");
    setChatLoading(true);

    try {
      // ── Task intent ──────────────────────────────────────────────────────
      const taskKw = ["add task", "create task", "new task", "add todo", "create todo", "add to-do", "add a task"];
      const msgLower = text.toLowerCase();

      if (taskKw.some((k) => msgLower.includes(k))) {
        let taskName = text;
        for (const k of taskKw) {
          taskName = taskName.replace(new RegExp(k, "i"), "").trim();
        }
        taskName = taskName.replace(/^(for|to|a|an|the)\s+/i, "").trim() || text;

        setPendingTask(taskName);
        const confirmMsg = {
          role: "bot",
          text: `Which project folder should I add **"${taskName}"** to?`,
          isConfirm: true,
          confirmOptions: folders.map((f) => ({ label: f.name, value: f.id })),
        };
        setMessages((p) => [...p, confirmMsg]);
        setChatLoading(false);
        return;
      }

      const res = await api.globalChat(text);

      // ── Folder navigation ────────────────────────────────────────────────
      if (res.intent === "navigate_folder" && res.folder_id) {
        setMessages((p) => [...p, { role: "bot", text: res.answer }]);
        setTimeout(() => navigate(`/project_folder/${res.folder_id}`), 800);
        setChatLoading(false);
        return;
      }

      // ── Document pending ─────────────────────────────────────────────────
      if (res.intent === "document_agent" && res.doc_pending) {
        const fmtMsg = {
          role: "bot",
          text: res.answer,
          isDocConfirm: true,
          folderId: res.folder_id,
          fmt: res.fmt,
        };
        setMessages((p) => [...p, fmtMsg]);
        setChatLoading(false);
        return;
      }

      if (res.intent === "folder_agent" || res.intent === "tool_call") {
        api.getFolders().then(setFolders).catch(() => {});
      }

      setMessages((p) => [...p, { role: "bot", text: res.answer }]);
    } catch (err) {
      setMessages((p) => [...p, { role: "bot", text: "⚠️ " + err.message }]);
    } finally { setChatLoading(false); }
  };

  const handleDocDownload = async (folderId, fmt) => {
    try {
      setMessages((p) => [...p, { role: "bot", text: `⏳ Generating ${fmt.toUpperCase()}...` }]);
      const blob = await api.downloadDocument(folderId, fmt);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `document.${fmt}`; a.click();
      URL.revokeObjectURL(url);
      setMessages((p) => [...p.slice(0, -1), { role: "bot", text: `✅ ${fmt.toUpperCase()} downloaded!` }]);
    } catch (err) {
      setMessages((p) => [...p.slice(0, -1), { role: "bot", text: "❌ " + err.message }]);
    }
  };

  return (
    <div className="chatbot-inner" style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div className="chatbot-topbar">
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 19 }}>ResHub Assistant</span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Messages + Input */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                <div className="bubble-text">{m.text}</div>

                {m.isConfirm && m.confirmOptions && (
                  <ConfirmBox
                    question="Select a folder:"
                    options={m.confirmOptions}
                    onSelect={handleFolderSelectForTask}
                    onCancel={() => {
                      setPendingTask(null);
                      setMessages((p) => p.filter((_, j) => j !== i));
                    }}
                  />
                )}

                {m.isDocConfirm && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="confirm-option-btn" onClick={() => handleDocDownload(m.folderId, "pdf")}>📄 PDF</button>
                    <button className="confirm-option-btn" onClick={() => handleDocDownload(m.folderId, "docx")}>📝 DOCX</button>
                  </div>
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

          {/* ── Claude-style input ─────────────────────────────────────────── */}
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
              <div /> {/* empty left side — no upload needed here */}
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
  );
}

export default App;