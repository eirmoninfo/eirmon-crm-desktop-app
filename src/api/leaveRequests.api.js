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
  if (params.leave_type) search.set("leave_type", params.leave_type);
  if (params.from_date) search.set("from_date", params.from_date);
  if (params.to_date) search.set("to_date", params.to_date);
  if (params.total_days != null) search.set("total_days", String(params.total_days));
  if (params.half_type) search.set("half_type", params.half_type);
  if (params.short_type) search.set("short_type", params.short_type);
  if (params.short_hours != null) search.set("short_hours", String(params.short_hours));
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

/**
 * Pull paid-leave fields out of any API wrapper shape.
 */
export function unwrapLeaveBalance(res) {
  if (!res || typeof res !== "object") return null;
  const candidates = [
    res.balance,
    res.leave_balance,
    res.data?.balance,
    res.data?.leave_balance,
    res.meta?.balance,
    res.data,
    res,
  ];
  for (const c of candidates) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    if ("available_paid_days" in c || "used_paid_days" in c) {
      return c;
    }
  }
  return null;
}

/**
 * GET paid leave balance. Tries dedicated routes, then leave-settings.
 */
export async function getLeaveBalance(params = {}) {
  const q = buildQuery(params);
  const urls = [`/leave-balance${q}`, `/leave-requests/balance${q}`];
  let lastErr;
  for (const url of urls) {
    try {
      const res = await apiRequest(url);
      if (unwrapLeaveBalance(res)) return res;
    } catch (e) {
      lastErr = e;
      if (e?.status === 403 && params.user_id != null) {
        const { user_id: _omit, ...rest } = params;
        try {
          const retry = await apiRequest(
            `${url.split("?")[0]}${buildQuery(rest)}`
          );
          if (unwrapLeaveBalance(retry)) return retry;
        } catch (e2) {
          lastErr = e2;
        }
      }
    }
  }

  try {
    const settings = await apiRequest("/leave-settings");
    if (unwrapLeaveBalance(settings)) return settings;
  } catch (e) {
    lastErr = lastErr || e;
  }

  throw lastErr || { message: "Could not load leave balance" };
}
