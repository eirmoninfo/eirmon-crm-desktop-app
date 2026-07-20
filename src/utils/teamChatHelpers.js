import { getApiRoot, resolveMediaUrl } from "../api/api.config";
import { unwrapApiBody } from "./unwrapApiBody";

/** Laravel download route when list payload only has filename in body. */
export function teamChatMessageFileUrl(messageId) {
  if (messageId == null) return "";
  const root = getApiRoot();
  return root ? `${root}/team-chat/messages/${messageId}/file` : "";
}

export function messagePreview(msg) {
  if (!msg) return "";
  const att = getMessageAttachments(msg);
  if (att.some((a) => a.isImage)) return "📷 Photo";
  if (att.length) return "📎 Attachment";
  const body = String(msg.body ?? "").trim();
  if (IMAGE_EXT.test(body)) return "📷 Photo";
  return body;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

export function parseBootstrap(res) {
  const raw = unwrapApiBody(res) ?? res;
  const channels = raw?.channels ?? raw?.data?.channels ?? [];
  const users = raw?.users ?? raw?.data?.users ?? [];
  const me =
    raw?.me ??
    raw?.current_user ??
    raw?.user ??
    null;
  return {
    channels: Array.isArray(channels) ? channels : [],
    users: Array.isArray(users) ? users : [],
    me,
  };
}

export function parseMessages(res) {
  const raw = unwrapApiBody(res) ?? res;
  if (Array.isArray(raw)) return raw.map(normalizeMessage);
  if (Array.isArray(raw?.messages)) return raw.messages.map(normalizeMessage);
  if (Array.isArray(raw?.data)) return raw.data.map(normalizeMessage);
  return [];
}

/** Extract message object from HTTP or WebSocket payload. */
export function extractChatMessage(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.message,
    payload.data?.message,
    payload.data,
    payload,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object" && (c.id != null || c.body != null)) {
      return normalizeMessage(c);
    }
  }
  return null;
}

function attachmentFromObject(att) {
  if (!att || typeof att !== "object") return null;
  const url =
    att.url ??
    att.full_url ??
    att.file_url ??
    att.attachment_url ??
    (att.path ? resolveMediaUrl(att.path) : null) ??
    (att.file_path ? resolveMediaUrl(att.file_path) : null);
  if (!url) return null;
  const name =
    att.name ??
    att.file_name ??
    att.original_name ??
    att.filename ??
    "Attachment";
  const mime = att.mime_type ?? att.mime ?? att.content_type ?? "";
  return {
    url: resolveMediaUrl(url),
    name,
    mime,
    isImage: isImageAttachment(name, mime, url),
  };
}

export function isImageAttachment(name, mime, url) {
  if (mime && String(mime).startsWith("image/")) return true;
  const n = name || url || "";
  return IMAGE_EXT.test(n);
}

/** Collect attachments from various API shapes. */
export function getMessageAttachments(msg) {
  if (!msg || typeof msg !== "object") return [];

  const found = [];
  const push = (item) => {
    const a = attachmentFromObject(item);
    if (a && !found.some((x) => x.url === a.url)) found.push(a);
  };

  if (Array.isArray(msg.attachments)) msg.attachments.forEach(push);
  if (Array.isArray(msg.files)) msg.files.forEach(push);
  if (msg.attachment) push(msg.attachment);
  if (typeof msg.file === "string" && msg.file.trim()) {
    push({ path: msg.file, name: msg.file.split("/").pop() });
  } else if (msg.file && typeof msg.file === "object") {
    push(msg.file);
  }
  if (msg.media && typeof msg.media === "object") push(msg.media);

  const directUrl =
    msg.attachment_url ??
    msg.file_url ??
    msg.media_url ??
    msg.url ??
    (msg.file_path ? resolveMediaUrl(msg.file_path) : null) ??
    (msg.attachment_path ? resolveMediaUrl(msg.attachment_path) : null);

  if (directUrl) {
    const name =
      msg.file_name ??
      msg.attachment_name ??
      msg.original_filename ??
      String(directUrl).split("/").pop() ??
      "Attachment";
    const mime = msg.mime_type ?? msg.content_type ?? "";
    const url = resolveMediaUrl(directUrl);
    if (!found.some((x) => x.url === url)) {
      found.push({
        url,
        name,
        mime,
        isImage: isImageAttachment(name, mime, url),
      });
    }
  }

  const body = String(msg.body ?? "").trim();
  const looksLikeFile =
    msg.has_file ||
    msg.has_attachment ||
    msg.is_file ||
    msg.message_type === "file" ||
    msg.type === "file" ||
    msg.type === "image" ||
    msg.type === "attachment";

  if (!found.length && msg.id != null && (looksLikeFile || IMAGE_EXT.test(body))) {
    const name =
      msg.file_name ??
      msg.attachment_name ??
      (IMAGE_EXT.test(body) ? body : "Attachment");
    const mime = msg.mime_type ?? msg.content_type ?? "";
    const apiUrl = teamChatMessageFileUrl(msg.id);
    if (apiUrl) {
      found.push({
        url: apiUrl,
        name,
        mime,
        isImage: isImageAttachment(name, mime, body),
        needsAuth: true,
      });
    }
  }

  if (!found.length && IMAGE_EXT.test(body)) {
    const storageCandidates = [
      `/storage/team-chat/${body}`,
      `/storage/chat/${body}`,
      `/storage/chat-attachments/${body}`,
      `/storage/${body}`,
    ];
    for (const path of storageCandidates) {
      const url = resolveMediaUrl(path);
      found.push({
        url,
        name: body,
        mime: "",
        isImage: true,
      });
      break;
    }
  }

  return found;
}

export function normalizeMessage(msg) {
  if (!msg || typeof msg !== "object") return msg;
  const attachments = getMessageAttachments(msg);
  const body = String(msg.body ?? "").trim();
  const bodyIsFilenameOnly =
    attachments.length > 0 &&
    body &&
    (body === attachments[0].name ||
      IMAGE_EXT.test(body) ||
      body.endsWith(attachments[0].name));

  return {
    ...msg,
    _attachments: attachments,
    _displayBody: bodyIsFilenameOnly ? "" : body,
  };
}

export function mergeMessagesById(existing, incoming) {
  const map = new Map();
  for (const m of existing) {
    if (m?.id != null) map.set(m.id, m);
  }
  for (const m of incoming) {
    const n = normalizeMessage(m);
    if (n?.id != null) map.set(n.id, n);
  }
  return [...map.values()].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
}

export function parseChannel(res) {
  return unwrapApiBody(res) ?? res?.channel ?? res;
}

export function channelLabel(ch, usersById = new Map()) {
  if (!ch) return "Chat";
  if (ch.name) return ch.name;
  if (ch.display_name) return ch.display_name;
  if (ch.type === "direct" || ch.is_direct) {
    const otherId = ch.other_user_id ?? ch.dm_user_id;
    const other = ch.other_user ?? usersById.get(otherId);
    if (other?.name) return other.name;
    return "Direct message";
  }
  return `Channel #${ch.id ?? ""}`;
}

export function messageAuthor(msg) {
  return (
    msg?.user?.name ??
    msg?.sender?.name ??
    msg?.author_name ??
    msg?.user_name ??
    "User"
  );
}

export function getStoredUserId() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.id ?? u?.user_id ?? u?.user?.id ?? null;
  } catch {
    return null;
  }
}

export function initialsFromName(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export function formatDaySeparator(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** @param {Array<{ id?: unknown, created_at?: string }>} messages */
export function groupMessagesByDate(messages) {
  const items = [];
  let lastDay = "";
  for (const msg of messages) {
    const day = msg.created_at
      ? new Date(msg.created_at).toDateString()
      : "";
    if (day && day !== lastDay) {
      items.push({
        kind: "date",
        key: `d-${day}`,
        label: formatDaySeparator(msg.created_at),
      });
      lastDay = day;
    }
    items.push({ kind: "message", key: `m-${msg.id}`, msg });
  }
  return items;
}

export function isDirectChannel(ch) {
  return ch?.type === "direct" || ch?.is_direct === true;
}

export function formatMessageTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}
