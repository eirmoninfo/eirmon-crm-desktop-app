import { apiRequest } from "../../../api/http.js";

const base = "/v1/meetings";

export const listMeetings = () => apiRequest(base);
export const getMeeting = (uuid) => apiRequest(`${base}/${encodeURIComponent(uuid)}`);
export const createMeeting = (payload) =>
  apiRequest(base, { method: "POST", body: payload });
export const getConnectionDetails = (uuid) =>
  apiRequest(`${base}/${encodeURIComponent(uuid)}/connection-details`, {
    method: "POST",
    body: {},
  });
export const leaveMeeting = (uuid, { signal } = {}) =>
  apiRequest(`${base}/${encodeURIComponent(uuid)}/leave`, {
    method: "POST",
    body: {},
    signal,
  });
export const endMeeting = (uuid) =>
  apiRequest(`${base}/${encodeURIComponent(uuid)}/end`, {
    method: "POST",
    body: {},
  });

export async function searchEmployees(query = "") {
  const suffix = query ? `?search=${encodeURIComponent(query)}` : "";
  const response = await apiRequest(`/users/company${suffix}`);
  const data = response?.data?.data ?? response?.data ?? response?.users ?? [];
  return Array.isArray(data) ? data : [];
}

export function unwrapMeeting(response) {
  return response?.data?.data ?? response?.data ?? response;
}
