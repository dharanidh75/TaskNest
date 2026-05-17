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

/* ── Toast ──────────────────────────────────────────────────────────────── */
function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={`toast${type === "error" ? " error" : ""}`}>{message}</div>;
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, type = "success") => {
    setToast({ message, type, key: Date.now() });
  }, []);
  const el = toast ? (
    <Toast key={toast.key} message={toast.message} type={toast.type} onDone={() => setToast(null)} />
  ) : null;
  return [el, show];
}

/* ── Modal ──────────────────────────────────────────────────────────────── */
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

/* ── App ─────────────────────────────────────────────────────────────────── */
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

/* ── Home ────────────────────────────────────────────────────────────────── */
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
  const navigate = useNavigate();

  useEffect(() => {
    api.getFolders()
      .then(setFolders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAddFolder = async () => {
    if (!folderName.trim()) return;
    setCreating(true);
    try {
      const newFolder = await api.createFolder(folderName.trim(), folderDesc);
      setFolders((prev) => [newFolder, ...prev]);
      setShowModal(false);
      setFolderName("");
      setFolderDesc("");
      showToast("✅ Folder created!");
    } catch (e) {
      showToast("Error: " + e.message, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteFolder = async (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this folder and all its data?")) return;
    setDeletingId(folderId);
    try {
      await api.deleteFolder(folderId);
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      showToast("🗑️ Folder deleted");
    } catch (e) {
      showToast("Error: " + e.message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app">
      {toastEl}

      <div className="nav">
        <h1 className="title">TaskNest</h1>
        <span className="nav-username">👋 {getUsername()}</span>
        <Link to="/profile" className="profile_logo">
          <img src={p_logo} alt="Profile" className="profile_logo" />
        </Link>
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
            {/* Skeleton loading state */}
            {loading && [1, 2, 3, 4].map((i) => (
              <div key={i} className="folder_item_wrapper" style={{ top: 100 }}>
                <div className="skeleton skeleton-folder" />
                <div className="skeleton skeleton-text" />
              </div>
            ))}

            {!loading && filtered.length === 0 && (
              <p style={{ padding: "10px", color: "#777", marginTop: 100 }}>
                {search ? "No folders match your search." : "No folders yet. Click NEW to create one!"}
              </p>
            )}

            {!loading && filtered.map((folder) => (
              <div key={folder.id} className={`folder_item_wrapper${deletingId === folder.id ? " deleting" : ""}`}>
                <Link to={`/project_folder/${folder.id}`} className="folder_item">
                  <img src={folder_b} alt="folder" className="folder_icon_b" />
                  <p className="folder_name">{folder.name}</p>
                </Link>
                <button
                  className="folder_delete_btn"
                  onClick={(e) => handleDeleteFolder(e, folder.id)}
                  title="Delete folder"
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

      {/* Create Folder Modal */}
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

/* ── HomeChatbot ─────────────────────────────────────────────────────────── */
function HomeChatbot({ folders, setFolders, showToast }) {
  const [query, setQuery]     = useState("");
  const navigate = useNavigate(); 
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "👋 Hi! I'm your TaskNest assistant. You can ask me to:\n• Create or delete folders\n• List your folders\n• Answer general questions\n\nOpen a specific project folder to chat with its resources.",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = query.trim();
    if (!text || chatLoading) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setQuery("");
    setChatLoading(true);
    try {
      const res = await api.globalChat(text);
      setMessages((prev) => [...prev, { role: "bot", text: res.answer, intent: res.intent }]);
      if (res.intent === "folder_agent") {
        api.getFolders().then(setFolders).catch(() => {});
      }
      const openKw = ["open", "go to", "navigate to", "switch to", "take me to"];
      const msgLower = text.toLowerCase();
      if (openKw.some((k) => msgLower.includes(k))) {
        const matched = folders.find((f) =>
          msgLower.includes(f.name.toLowerCase())
        );
        if (matched) {
          setMessages((prev) => [...prev, {
            role: "bot",
            text: `📁 Opening **${matched.name}**...`,
          }]);
          setTimeout(() => navigate(`/project_folder/${matched.id}`), 800);
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "bot", text: "⚠️ Error: " + err.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="chatbot-inner">
      <h1 style={{ padding: "20px 20px 10px", textAlign: "center", fontSize: "20px" }}>
        TaskNest Assistant
      </h1>
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>{m.text}</div>
        ))}
        {chatLoading && (
          <div className="chat-bubble bot">
            <div className="typing-dots"><span/><span/><span/></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="chat_input_container">
        <input
          type="text"
          className="query_box"
          placeholder="Ask me to create a folder, list folders, or anything else..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button className="send_btn" onClick={sendMessage} disabled={chatLoading}>
          {chatLoading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

export default App;