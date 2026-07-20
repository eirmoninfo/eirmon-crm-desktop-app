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
export function sendTeamChatMessage(channelId, { body = "", file = null } = {}) {
  if (file) {
    const fd = new FormData();
    if (body) fd.append("body", body);
    fd.append("file", file);
    return apiRequest(`${PREFIX}/channels/${channelId}/messages`, {
      method: "POST",
      body: fd,
    });
  }
  return apiRequest(`${PREFIX}/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
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
export function markTeamChatChannelRead(channelId) {
  return apiRequest(`${PREFIX}/channels/${channelId}/read`, {
    method: "POST",
  });
}

/** GET /team-chat/search?q=... */
export function searchTeamChat(q) {
  return apiRequest(`${PREFIX}/search${buildQuery({ q })}`);
}
