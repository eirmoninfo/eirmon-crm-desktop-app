import { apiRequest } from "./http";

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  if (params.page != null) search.set("page", String(params.page));
  if (params.per_page != null) search.set("per_page", String(params.per_page));
  if (params.status) search.set("status", params.status);
  if (params.month) search.set("month", params.month);
  if (params.user_id != null && params.user_id !== "") {
    search.set("user_id", String(params.user_id));
  }
  const q = search.toString();
  return q ? `?${q}` : "";
}

/**
 * GET /leave-requests — paginated list.
 * @param {{ page?: number, per_page?: number, status?: string, month?: string, user_id?: string|number }} params
 */
export function listLeaveRequests(params = {}) {
  return apiRequest(`/leave-requests${buildQuery(params)}`);
}

/** GET /leave-requests/{id} */
export function getLeaveRequest(id) {
  return apiRequest(`/leave-requests/${id}`);
}

/**
 * POST /leave-requests
 * @param {{
 *   user_id?: number|string,
 *   from_date: string,
 *   to_date: string,
 *   leave_type: string,
 *   half_type?: string|null,
 *   short_type?: string|null,
 *   reason: string
 * }} body
 */
export function createLeaveRequest(body) {
  return apiRequest("/leave-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * PATCH /leave-requests/{id} — approve / reject (pending only).
 * @param {{ status: 'approved'|'rejected', action_reason: string }} body
 */
export function patchLeaveRequest(id, body) {
  return apiRequest(`/leave-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
