import { getToken } from "./storage";
import { getApiRoot } from "../api/api.config";
import { unwrapApiBody } from "./unwrapApiBody";
import { showAppNotification } from "./appNotification";
import { pushWorkspaceNotification } from "./workspaceNotifications";

const POLL_MS = 45_000;
const SEEN_KEY = "eirmon_notif_seen_ids";
const SEEN_MAX = 200;

let pollTimer = null;
let started = false;

function apiV1Url(path) {
  const root = getApiRoot();
  if (!root) return "";
  const base = /\/api$/i.test(root) ? root : `${root}/api`;
  return `${base}/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function loadSeen() {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(set) {
  try {
    const arr = [...set].slice(-SEEN_MAX);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

function routeForNotification(n) {
  const data = n?.data || {};
  if (typeof data.desktop_route === "string" && data.desktop_route.startsWith("/")) {
    return data.desktop_route;
  }
  if (typeof n?.desktop_route === "string" && n.desktop_route.startsWith("/")) {
    return n.desktop_route;
  }
  const cat = String(n?.category || data.category || "");
  if (cat.startsWith("lead_")) return "/leads";
  if (cat.startsWith("task_")) {
    return data.task_id ? `/tasks?task=${data.task_id}` : "/tasks";
  }
  if (cat === "chat_message" && data.channel_id) {
    return `/team-chat/${data.channel_id}`;
  }
  return "/home";
}

/**
 * Show OS + in-app toast for a server notification payload.
 * Dedupes by notification id for the session.
 */
export function deliverServerNotification(raw, { source = "echo" } = {}) {
  const n = raw?.notification ?? raw;
  if (!n?.id && !n?.title) return false;
  if (n.is_silent || n.silent) return false;

  const id = n.id != null ? String(n.id) : null;
  const seen = loadSeen();
  if (id && seen.has(id)) return false;
  if (id) {
    seen.add(id);
    saveSeen(seen);
  }

  const title = String(n.title || "Eirmon CRM");
  const body = String(n.message || n.body || "");
  const route = routeForNotification(n);

  pushWorkspaceNotification({
    id: id ? `notif-${id}` : `notif-${Date.now()}`,
    title,
    body,
    route,
  });

  showAppNotification({
    title,
    body,
    toastMessage: body ? `${title} — ${body}` : title,
    toastOptions: { duration: 7000 },
    route,
    actions: [{ id: "open", text: "Open" }],
  }).catch(() => {});

  console.info(`[Notifications] Delivered (${source}):`, title);
  return true;
}

async function fetchUnreadNotifications() {
  const token = getToken();
  const url = apiV1Url("/notifications");
  if (!token || !url) return [];

  const res = await fetch(`${url}?read=false&limit=20`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  const body = unwrapApiBody(json) ?? json?.data ?? json;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

async function pollOnce() {
  try {
    const items = await fetchUnreadNotifications();
    // Only toast the newest few to avoid flooding after long offline.
    for (const item of items.slice(0, 8).reverse()) {
      deliverServerNotification(item, { source: "poll" });
    }
  } catch (e) {
    console.warn("[Notifications] Poll failed:", e?.message || e);
  }
}

export function startDesktopNotificationSync() {
  if (started) return;
  started = true;
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_MS);
}

export function stopDesktopNotificationSync() {
  started = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
