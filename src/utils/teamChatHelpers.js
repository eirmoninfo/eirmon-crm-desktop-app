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
  let list = [];
  if (Array.isArray(raw)) list = raw.map(normalizeMessage);
  else if (Array.isArray(raw?.messages)) list = raw.messages.map(normalizeMessage);
  else if (Array.isArray(raw?.data)) list = raw.data.map(normalizeMessage);
  return sortMessagesChronologically(list);
}

export function getMessageTimestamp(msg) {
  if (!msg || typeof msg !== "object") return 0;
  const candidates = [
    msg.created_at,
    msg.timestamp,
    msg.sent_at,
    msg.updated_at,
  ];
  for (const value of candidates) {
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

export function compareMessagesChronologically(a, b) {
  const timeDiff = getMessageTimestamp(a) - getMessageTimestamp(b);
  if (timeDiff !== 0) return timeDiff;

  const idA = Number(a?.id);
  const idB = Number(b?.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idA - idB;
  }

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), undefined, {
    numeric: true,
  });
}

/** Oldest message first (top), newest last (bottom) — WhatsApp-style. */
export function sortMessagesChronologically(messages = []) {
  return [...messages].sort(compareMessagesChronologically);
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

export function messageIdKey(id) {
  if (id == null || id === "") return null;
  return String(id);
}

export function mergeMessagesById(existing, incoming) {
  const map = new Map();
  for (const m of existing) {
    const key = messageIdKey(m?.id);
    if (key != null) map.set(key, m);
  }
  for (const m of incoming) {
    const n = normalizeMessage(m);
    const key = messageIdKey(n?.id);
    if (key != null) map.set(key, n);
  }
  return sortMessagesChronologically([...map.values()]);
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

export function getForwardedContext(msg) {
  if (!msg || typeof msg !== "object") return null;

  const nested =
    msg.forwarded_from ??
    msg.forwarded_from_message ??
    msg.forwarded_message ??
    null;

  if (nested && typeof nested === "object") {
    return {
      author: messageAuthor(nested),
      preview: messagePreview(nested),
    };
  }

  if (msg.forwarded_from_id || msg.is_forwarded) {
    return {
      author: msg.forwarded_author_name ?? msg.forwarded_from_name ?? "User",
      preview: null,
    };
  }

  return null;
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

export function readReceiptLabel(receipt) {
  if (!receipt) return "Sent";
  const status = receipt.status || "sent";
  const total = Number(receipt.total_recipients || 0);
  const readCount = Number(receipt.read_count || 0);
  if (total > 1 && readCount > 0) {
    return `Read by ${readCount}/${total}`;
  }
  if (status === "read") return "Read";
  if (status === "delivered") return "Delivered";
  return "Sent";
}

export function computeReceiptStatus(receipt) {
  const total = Number(receipt.total_recipients || 1);
  const readCount = Number(receipt.read_count || 0);
  const deliveredCount = Number(receipt.delivered_count || 0);
  if (readCount >= total) return "read";
  if (deliveredCount >= total || deliveredCount > 0) return "delivered";
  return receipt.status || "sent";
}

export function mergeReadReceipt(current, patch) {
  const base = current || {
    status: "sent",
    read_count: 0,
    delivered_count: 0,
    total_recipients: 1,
  };
  return { ...base, ...patch };
}

/** Normalize Laravel Echo payload for read/delivery events. */
export function unwrapEchoReceiptPayload(payload) {
  const raw = payload?.channel_id != null ? payload : payload?.data ?? payload;
  return raw && typeof raw === "object" ? raw : {};
}

export function defaultReadReceipt(receipt) {
  return (
    receipt ?? {
      status: "sent",
      read_count: 0,
      delivered_count: 0,
      total_recipients: 1,
    }
  );
}

export function applyMessageReadEvent(messages, event, myId) {
  const data = unwrapEchoReceiptPayload(event);
  const userId = Number(data?.user_id);
  const lastId = Number(data?.last_read_message_id);
  if (!lastId || userId === Number(myId)) return messages;

  return messages.map((msg) => {
    if (Number(msg.user_id ?? msg.user?.id) !== Number(myId)) return msg;
    if (Number(msg.id) > lastId) return msg;

    const readBy = msg._readBy || new Set();
    if (readBy.has(userId)) return msg;
    readBy.add(userId);

    const r = msg.read_receipt || {};
    const total = Number(r.total_recipients || 1);
    const readCount = Math.min(total, (r.read_count || 0) + 1);
    const deliveredCount = Math.max(r.delivered_count || 0, readCount);
    const next = mergeReadReceipt(r, { read_count: readCount, delivered_count: deliveredCount });
    next.status = computeReceiptStatus(next);

    return { ...msg, _readBy: readBy, read_receipt: next };
  });
}

export function applyMessageDeliveredEvent(messages, event, myId) {
  const data = unwrapEchoReceiptPayload(event);
  const userId = Number(data?.user_id);
  const messageId = Number(data?.message_id);
  if (!messageId || userId === Number(myId)) return messages;

  return messages.map((msg) => {
    if (String(msg.id) !== String(messageId)) return msg;
    if (Number(msg.user_id ?? msg.user?.id) !== Number(myId)) return msg;

    const deliveredTo = msg._deliveredTo || new Set();
    if (deliveredTo.has(userId)) return msg;
    deliveredTo.add(userId);

    const r = msg.read_receipt || {};
    const next = mergeReadReceipt(r, {
      delivered_count: (r.delivered_count || 0) + 1,
    });
    next.status = computeReceiptStatus(next);

    return { ...msg, _deliveredTo: deliveredTo, read_receipt: next };
  });
}
