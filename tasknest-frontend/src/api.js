const BASE = "http://localhost:8000";

function getToken() {
  return localStorage.getItem("tasknest_token");
}

export function saveAuth(token, username, userId) {
  localStorage.setItem("tasknest_token", token);
  localStorage.setItem("tasknest_user", username);
  localStorage.setItem("tasknest_uid", userId);
}

export function clearAuth() {
  localStorage.removeItem("tasknest_token");
  localStorage.removeItem("tasknest_user");
  localStorage.removeItem("tasknest_uid");
}

export function getUsername() {
  return localStorage.getItem("tasknest_user");
}

export function isLoggedIn() {
  return !!getToken();
}

async function request(method, path, body = null, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body && !isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    return res.json();
  },

  // Profile
  getProfile: () => request("GET", "/auth/me"),
  updateProfile: (data) => request("PUT", "/auth/me", data),

  // Folders
  getFolders: () => request("GET", "/folders/"),
  createFolder: (name, description) => request("POST", "/folders/", { name, description }),
  deleteFolder: (id) => request("DELETE", `/folders/${id}`),
  getFolder: (id) => request("GET", `/folders/${id}`),

  // Resources
  getResources: (folderId) => request("GET", `/folders/${folderId}/resources/`),
  uploadResource: (folderId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("POST", `/folders/${folderId}/resources/`, fd, true);
  },
  deleteResource: (folderId, resourceId) =>
    request("DELETE", `/folders/${folderId}/resources/${resourceId}`),

  // Notes
  getNotes: (folderId) => request("GET", `/folders/${folderId}/notes/`),
  createNote: (folderId, title, content) =>
    request("POST", `/folders/${folderId}/notes/`, { title, content }),
  updateNote: (folderId, noteId, title, content) =>
    request("PUT", `/folders/${folderId}/notes/${noteId}`, { title, content }),
  deleteNote: (folderId, noteId) =>
    request("DELETE", `/folders/${folderId}/notes/${noteId}`),

  // Tasks
  getTasks: (folderId) => request("GET", `/folders/${folderId}/tasks/`),
  createTask: (folderId, text, deadline) =>
    request("POST", `/folders/${folderId}/tasks/`, { text, deadline }),
  updateTask: (folderId, taskId, data) =>
    request("PUT", `/folders/${folderId}/tasks/${taskId}`, data),
  deleteTask: (folderId, taskId) =>
    request("DELETE", `/folders/${folderId}/tasks/${taskId}`),

  // Chat — folder-level RAG chat
  chat: (folderId, message) =>
    request("POST", `/folders/${folderId}/chat/`, { message }),

  // Global chat — home page agentic chatbot (no folder context)
  globalChat: (message) =>
    request("POST", "/chat/global/", { message }),
};