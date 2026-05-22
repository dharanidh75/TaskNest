/**
 * api.js — UPGRADED
 * =================
 * Changes from original:
 *   - getOrCreateSessionId(): persists session_id per scope in sessionStorage
 *     (tab-scoped, survives page refreshes, new session on new tab = clean context)
 *   - api.chat() and api.globalChat() now auto-inject the correct session_id
 *     — callers no longer need to pass sessionId manually (backward-compatible)
 *   - All other code is unchanged
 */

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PUBLIC_PATHS = ["/auth/register", "/auth/login"];

function getToken() { return localStorage.getItem("reshub_token"); }
function getTokenExpiry() { return localStorage.getItem("reshub_token_expiry"); }
function isTokenExpired() {
  const expiry = getTokenExpiry();
  return !expiry || Date.now() > parseInt(expiry, 10);
}

export function saveAuth(token, username, userId) {
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  localStorage.setItem("reshub_token", token);
  localStorage.setItem("reshub_user", username);
  localStorage.setItem("reshub_uid", userId);
  localStorage.setItem("reshub_token_expiry", String(expiry));
}

export function clearAuth() {
  ["reshub_token", "reshub_user", "reshub_uid", "reshub_token_expiry"]
    .forEach((k) => localStorage.removeItem(k));
}

export function getUsername() { return localStorage.getItem("reshub_user"); }

export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired()) { clearAuth(); return false; }
  return true;
}

function redirectToAuth() { clearAuth(); window.location.replace("/auth"); }

async function request(method, path, body = null, isFormData = false) {
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  if (!isPublic && !isLoggedIn()) { redirectToAuth(); throw new Error("Not authenticated"); }

  const headers = {};
  const token = getToken();
  if (token && !isPublic) headers["Authorization"] = `Bearer ${token}`;
  if (body && !isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) { redirectToAuth(); throw new Error("Session expired."); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// Raw fetch for blob (file download)
async function requestBlob(path, method = "GET") {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}

// ── Session ID management (Principle 4) ──────────────────────────────────────
// sessionStorage is tab-scoped and survives page refreshes within the same tab.
// A new tab starts a fresh session (clean conversation context).
// Key format: "reshub_session_folder_<id>" or "reshub_session_global"

function getOrCreateSessionId(scopeKey) {
  const storageKey = `reshub_session_${scopeKey}`;
  let id = sessionStorage.getItem(storageKey);
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(storageKey, id);
  }
  return id;
}

// ── API surface (unchanged except chat methods) ───────────────────────────────

export const api = {
  // Auth
  register: (username, email, password) =>
    request("POST", "/auth/register", { username, email, password }),
  login: async (email, password) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const res = await fetch(BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Login failed"); }
    return res.json();
  },

  // Profile
  getProfile:    ()     => request("GET", "/auth/me"),
  updateProfile: (data) => request("PUT", "/auth/me", data),

  // Folders
  getFolders:   ()           => request("GET", "/folders/"),
  createFolder: (name, desc) => request("POST", "/folders/", { name, description: desc }),
  deleteFolder: (id)         => request("DELETE", `/folders/${id}`),
  getFolder:    (id)         => request("GET", `/folders/${id}`),

  // Resources
  getResources:   (folderId)             => request("GET", `/folders/${folderId}/resources/`),
  uploadResource: (folderId, file)       => {
    const fd = new FormData();
    fd.append("file", file);
    return request("POST", `/folders/${folderId}/resources/`, fd, true);
  },
  deleteResource: (folderId, resourceId) =>
    request("DELETE", `/folders/${folderId}/resources/${resourceId}`),

  // View resource in browser or download
  getResourceUrl: (folderId, resourceId) => `${BASE}/folders/${folderId}/resources/${resourceId}/serve/`,

  // Notes
  getNotes:   (folderId)                         => request("GET", `/folders/${folderId}/notes/`),
  createNote: (folderId, title, content)         => request("POST", `/folders/${folderId}/notes/`, { title, content }),
  updateNote: (folderId, noteId, title, content) => request("PUT", `/folders/${folderId}/notes/${noteId}`, { title, content }),
  deleteNote: (folderId, noteId)                 => request("DELETE", `/folders/${folderId}/notes/${noteId}`),

  // Tasks
  getTasks:   (folderId)                 => request("GET", `/folders/${folderId}/tasks/`),
  createTask: (folderId, text, deadline) => request("POST", `/folders/${folderId}/tasks/`, { text, deadline }),
  updateTask: (folderId, taskId, data)   => request("PUT", `/folders/${folderId}/tasks/${taskId}`, data),
  deleteTask: (folderId, taskId)         => request("DELETE", `/folders/${folderId}/tasks/${taskId}`),

  // Chat — session_id auto-injected from sessionStorage (Principle 4)
  chat: (folderId, message, sessionId) =>
    request("POST", `/folders/${folderId}/chat/`, {
      message,
      session_id: sessionId || getOrCreateSessionId(`folder_${folderId}`),
    }),
  globalChat: (message, sessionId) =>
    request("POST", "/chat/global/", {
      message,
      session_id: sessionId || getOrCreateSessionId("global"),
    }),

  // History — folder
  getFolderHistory:    (folderId)                                    => request("GET", `/folders/${folderId}/history/`),
  saveFolderMessage:   (folderId, role, text, intent, sources, sid) =>
    request("POST", `/folders/${folderId}/history/`, { role, text, intent, sources, session_id: sid }),
  deleteFolderSession: (folderId, sessionId)                         =>
    request("DELETE", `/folders/${folderId}/history/${sessionId}`),

  // History — global
  getGlobalHistory:    ()                             => request("GET", "/history/global/"),
  saveGlobalMessage:   (role, text, intent, sid)      =>
    request("POST", "/history/global/", { role, text, intent, session_id: sid }),
  deleteGlobalSession: (sessionId)                    =>
    request("DELETE", `/history/global/${sessionId}`),

  // Document generation — triggers download
  downloadDocument: async (folderId, fmt = "docx") => {
    const blob = await requestBlob(`/folders/${folderId}/generate-document/?fmt=${fmt}`, "POST");
    return blob;
  },

  // Folder stats
  getFolderStats: (folderId) => request("GET", `/folders/${folderId}/stats/`),
};