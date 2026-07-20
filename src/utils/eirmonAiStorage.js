const STORAGE_KEY = "eirmon_ai_conversations";
const ACTIVE_KEY = "eirmon_ai_active_id";

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function createMessage(role, content, extra = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

export function createConversation(title = "New chat") {
  return {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadConversations() {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  const list = safeParse(raw, []);
  return Array.isArray(list) ? list : [];
}

export function saveConversations(list) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getActiveConversationId() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveConversationId(id) {
  if (typeof localStorage === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function upsertConversation(conversation) {
  const list = loadConversations();
  const idx = list.findIndex((c) => c.id === conversation.id);
  const next = { ...conversation, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  saveConversations(list.slice(0, 30));
  return next;
}

export function deleteConversation(id) {
  const list = loadConversations().filter((c) => c.id !== id);
  saveConversations(list);
  if (getActiveConversationId() === id) setActiveConversationId(null);
  return list;
}

export function titleFromMessage(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}
