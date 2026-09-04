import { getToken } from "../utils/storage";
import { getApiRoot } from "./api.config";
import { apiRequest } from "./http";

/** Authenticated file download when message payload has no public URL. */
export function teamChatMessageFileUrl(messageId) {
  if (messageId == null) return "";
  const root = getApiRoot();
  return root ? `${root}/team-chat/messages/${messageId}/file` : "";
}

export async function fetchTeamChatMessageFile(messageId) {
  const url = teamChatMessageFileUrl(messageId);
  const token = getToken();
  if (!url || !token) return null;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") search.set(key, String(value));
  });
  const q = search.toString();
  return q ? `?${q}` : "";
}

const PREFIX = "/team-chat";

/** GET /team-chat/bootstrap — channels + users */
export function teamChatBootstrap() {
  return apiRequest(`${PREFIX}/bootstrap`);
}

/** POST /team-chat/channels */
export function createTeamChatChannel(body) {
  return apiRequest(`${PREFIX}/channels`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** POST /team-chat/direct/{userId} */
export function startTeamChatDirect(userId) {
  return apiRequest(`${PREFIX}/direct/${userId}`, { method: "POST" });
}

/** GET /team-chat/channels/{id} */
export function getTeamChatChannel(id) {
  return apiRequest(`${PREFIX}/channels/${id}`);
}

/**
 * GET /team-chat/channels/{id}/messages
 * @param {{ before_id?: number|string, limit?: number }} params
 */
export function listTeamChatMessages(channelId, params = {}) {
  return apiRequest(
    `${PREFIX}/channels/${channelId}/messages${buildQuery(params)}`
  );
}

/**
 * POST /team-chat/channels/{id}/messages — JSON or multipart + file
 */
export function sendTeamChatMessage(
  channelId,
  { body = "", file = null, replyToId = null, forwardedFromId = null } = {}
) {
  if (file) {
    const fd = new FormData();
    if (body) fd.append("body", body);
    fd.append("file", file);
    if (replyToId != null) fd.append("reply_to_id", String(replyToId));
    if (forwardedFromId != null) {
      fd.append("forwarded_from_id", String(forwardedFromId));
    }
    return apiRequest(`${PREFIX}/channels/${channelId}/messages`, {
      method: "POST",
      body: fd,
    });
  }
  return apiRequest(`${PREFIX}/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body,
      ...(replyToId != null ? { reply_to_id: replyToId } : {}),
      ...(forwardedFromId != null ? { forwarded_from_id: forwardedFromId } : {}),
    }),
  });
}

/** Forward a message to another channel (dedicated endpoint with send fallback). */
export async function forwardTeamChatMessage(message, channelId) {
  if (!message?.id || !channelId) {
    throw new Error("Message and channel are required");
  }

  try {
    return await apiRequest(`${PREFIX}/messages/${message.id}/forward`, {
      method: "POST",
      body: JSON.stringify({ channel_id: channelId }),
    });
  } catch (error) {
    const status = error?.status;
    if (status && status !== 404 && status !== 405 && status !== 422) {
      throw error;
    }
  }

  const body = String(message._displayBody ?? message.body ?? "").trim();
  const hasAttachment =
    Array.isArray(message._attachments) && message._attachments.length > 0;

  if (!body && hasAttachment) {
    throw new Error(
      "This attachment cannot be forwarded from the desktop app yet. Ask your admin to enable server-side forwarding."
    );
  }

  return sendTeamChatMessage(channelId, {
    body,
    forwardedFromId: message.id,
  });
}

/** GET /team-chat/channels/{id}/members */
export function listTeamChatMembers(channelId) {
  return apiRequest(`${PREFIX}/channels/${channelId}/members`);
}

/** PUT /team-chat/channels/{id} */
export function updateTeamChatChannel(channelId, body) {
  return apiRequest(`${PREFIX}/channels/${channelId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** POST /team-chat/channels/{id}/read */
export function markTeamChatChannelRead(channelId, messageId = null) {
  return apiRequest(`${PREFIX}/channels/${channelId}/read`, {
    method: "POST",
    body: JSON.stringify(messageId != null ? { message_id: messageId } : {}),
  });
}

/** POST /team-chat/channels/{channelId}/messages/{messageId}/delivered */
export function markTeamChatMessageDelivered(channelId, messageId) {
  return apiRequest(
    `${PREFIX}/channels/${channelId}/messages/${messageId}/delivered`,
    { method: "POST" }
  );
}

/** POST /team-chat/messages/{id}/reactions — server toggles this user's emoji. */
export function toggleTeamChatMessageReaction(messageId, emoji) {
  return apiRequest(`${PREFIX}/messages/${messageId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

/** POST /team-chat/channels/{id}/call — start LiveKit call + ring participants */
export function startTeamChatCall(channelId, mode = "video") {
  return apiRequest(`${PREFIX}/channels/${channelId}/call`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

/** GET /team-chat/search?q=... */
export function searchTeamChat(q) {
  return apiRequest(`${PREFIX}/search${buildQuery({ q })}`);
}
