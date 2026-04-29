import { useState, useEffect, useRef } from "react";
import { Route, Routes, Link, useNavigate } from "react-router-dom";
import Profile from "./profile";
import ProjectFolder from "./project_folder";
import EditProfile from "./edit_profile";
import Auth from "./auth";
import p_logo from "./assets/profile_logo.png";
import folder_b from "./assets/folder_b.png";
import { api, isLoggedIn, getUsername, clearAuth } from "./api";
import "./App.css";

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
  useEffect(() => {
    if (!isLoggedIn()) navigate("/auth");
  }, []);
  return isLoggedIn() ? children : null;
}

function Home() {
  const [folders, setFolders] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getFolders()
      .then(setFolders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAddFolder = async () => {
    const folderName = prompt("Enter Folder Name:");
    if (!folderName?.trim()) return;
    const desc = prompt("Enter a short description (optional):") || "";
    try {
      const newFolder = await api.createFolder(folderName.trim(), desc);
      setFolders([newFolder, ...folders]);
    } catch (e) {
      alert("Error creating folder: " + e.message);
    }
  };

  const handleDeleteFolder = async (e, folderId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this folder and all its data?")) return;
    try {
      await api.deleteFolder(folderId);
      setFolders(folders.filter((f) => f.id !== folderId));
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app">
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
            {loading && <p style={{ padding: "10px", color: "#555" }}>Loading...</p>}
            {!loading && filtered.length === 0 && (
              <p style={{ padding: "10px", color: "#777" }}>
                {search ? "No folders match your search." : "No folders yet. Click NEW to create one!"}
              </p>
            )}
            {filtered.map((folder) => (
              <div key={folder.id} className="folder_item_wrapper">
                <Link to={`/project_folder/${folder.id}`} className="folder_item">
                  <img src={folder_b} alt="folder" className="folder_icon_b" />
                  <p className="folder_name">{folder.name}</p>
                </Link>
                <button
                  className="folder_delete_btn"
                  onClick={(e) => handleDeleteFolder(e, folder.id)}
                  title="Delete folder"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button onClick={handleAddFolder} className="new_task_box">
            <div className="new_button">
              <span style={{ fontWeight: "bold" }}>NEW</span>
              <span>✏️</span>
            </div>
          </button>
        </div>

        <div className="chatbot">
          <HomeChatbot folders={folders} setFolders={setFolders} />
        </div>
      </div>
    </div>
  );
}

function HomeChatbot({ folders, setFolders }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "👋 Hi! I'm your TaskNest assistant. You can ask me to:\n• Create or delete folders\n• List your folders\n• Answer general questions\n\nOpen a specific project folder to chat with its resources.",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef();

  // Scroll chat to bottom when messages update
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
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: res.answer, intent: res.intent },
      ]);

      // If the agent created or deleted a folder, refresh the folder list
      if (res.intent === "folder_agent") {
        api.getFolders()
          .then(setFolders)
          .catch(() => {});
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "⚠️ Error: " + err.message },
      ]);
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
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {chatLoading && (
          <div className="chat-bubble bot">
            <span>Thinking...</span>
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
        <button
          className="send_btn"
          onClick={sendMessage}
          disabled={chatLoading}
        >
          {chatLoading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

export default App;