const BASE = "http://localhost:8000";

// ── Public routes — never need a token ───────────────────────────────────────
const PUBLIC_PATHS = ["/auth/register", "/auth/login"];

// ── Token helpers ─────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem("ResHub_token");
}

function getTokenExpiry() {
  return localStorage.getItem("ResHub_token_expiry");
}

function isTokenExpired() {
  const expiry = getTokenExpiry();
  if (!expiry) return true;
  return Date.now() > parseInt(expiry, 10);
}

export function saveAuth(token, username, userId) {
  // Store token with a 7-day expiry timestamp
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  localStorage.setItem("ResHub_token", token);
  localStorage.setItem("ResHub_user", username);
  localStorage.setItem("ResHub_uid", userId);
  localStorage.setItem("ResHub_token_expiry", String(expiry));
}

export function clearAuth() {
  ["ResHub_token", "ResHub_user", "ResHub_uid", "ResHub_token_expiry"].forEach(
    (k) => localStorage.removeItem(k)
  );
}

export function getUsername() {
  return localStorage.getItem("ResHub_user");
}

// ── Auth check — used by ProtectedRoute and request() ────────────────────────

export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired()) {
    clearAuth();
    return false;
  }
  return true;
}

// ── Redirect helper ───────────────────────────────────────────────────────────

function redirectToAuth() {
  clearAuth();
  window.location.replace("/auth");
}

// ── Core request function ─────────────────────────────────────────────────────

async function request(method, path, body = null, isFormData = false) {
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Block any protected request if the user is not authenticated
  if (!isPublic && !isLoggedIn()) {
    redirectToAuth();
    throw new Error("Not authenticated");
  }

  const headers = {};
  const token = getToken();
  if (token && !isPublic) headers["Authorization"] = `Bearer ${token}`;
  if (body && !isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  // 401 from backend → token rejected (tampered/revoked) → force logout
  if (res.status === 401) {
    redirectToAuth();
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }

  return res.json();
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  // Auth (public)
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
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

  // Notes
  getNotes:   (folderId)                        => request("GET", `/folders/${folderId}/notes/`),
  createNote: (folderId, title, content)        => request("POST", `/folders/${folderId}/notes/`, { title, content }),
  updateNote: (folderId, noteId, title, content)=> request("PUT", `/folders/${folderId}/notes/${noteId}`, { title, content }),
  deleteNote: (folderId, noteId)                => request("DELETE", `/folders/${folderId}/notes/${noteId}`),

  // Tasks
  getTasks:   (folderId)               => request("GET", `/folders/${folderId}/tasks/`),
  createTask: (folderId, text, deadline)=> request("POST", `/folders/${folderId}/tasks/`, { text, deadline }),
  updateTask: (folderId, taskId, data) => request("PUT", `/folders/${folderId}/tasks/${taskId}`, data),
  deleteTask: (folderId, taskId)       => request("DELETE", `/folders/${folderId}/tasks/${taskId}`),

  // Chat
  chat:       (folderId, message) => request("POST", `/folders/${folderId}/chat/`, { message }),
  globalChat: (message)           => request("POST", "/chat/global/", { message }),

  // Chat History
  getChatHistory:  (folderId)                                    => request("GET", `/folders/${folderId}/history/`),
  saveChatMessage: (folderId, role, text, intent = null, sources = 0) =>
    request("POST", `/folders/${folderId}/history/`, { role, text, intent, sources }),

  // Folder Stats
  getFolderStats: (folderId) => request("GET", `/folders/${folderId}/stats/`),
};