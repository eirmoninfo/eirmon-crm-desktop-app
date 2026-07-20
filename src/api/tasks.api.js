import { getToken } from "../utils/storage";
import { API_BASE_URL } from "./api.config";
import { apiRequest } from "./http";

/** Normalize paginated / bare task list responses from the API. */
export function unwrapTasksList(res) {
  if (!res) return { list: [], meta: null };

  if (Array.isArray(res.data) && res.meta && typeof res.meta === "object") {
    const m = res.meta;
    return {
      list: res.data,
      meta: {
        current_page: m.current_page ?? 1,
        last_page: m.last_page ?? 1,
        total: m.total ?? res.data.length,
      },
    };
  }

  const ok =
    res.status === true ||
    res.status === "success" ||
    res.success === true ||
    res.data != null;

  if (!ok && !res.data && !Array.isArray(res)) {
    return { list: [], meta: null };
  }

  const d = res.data;

  if (d && Array.isArray(d.data)) {
    return {
      list: d.data,
      meta: {
        current_page: d.current_page ?? 1,
        last_page: d.last_page ?? 1,
        total: d.total ?? d.data.length,
      },
    };
  }

  if (Array.isArray(d)) {
    return {
      list: d,
      meta: { current_page: 1, last_page: 1, total: d.length },
    };
  }

  if (d?.tasks && Array.isArray(d.tasks)) {
    return {
      list: d.tasks,
      meta: {
        current_page: d.current_page ?? 1,
        last_page: d.last_page ?? 1,
        total: d.total ?? d.tasks.length,
      },
    };
  }

  return { list: [], meta: null };
}

/** GET /tasks — paginated task list. */
export async function fetchTasksPage(page = 1, perPage = 20) {
  const res = await apiRequest(`/tasks?page=${page}&per_page=${perPage}`);
  return unwrapTasksList(res);
}

/**
 * GET /tasks/create-data — projects, users, teams, etc. (if provided by API).
 * TaskCreate falls back to /users/company when this route is missing.
 */
export async function fetchTaskCreateData() {
  return apiRequest("/tasks/create-data");
}

/**
 * POST /tasks — create task (desktop / parity with admin create form).
 */
export async function createTask(body) {
  return apiRequest("/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * GET /tasks/{id} — full task with comments, attachments, subtasks.
 */
export async function fetchTaskDetail(id) {
  return apiRequest(`/tasks/${id}`);
}

/**
 * PATCH /tasks/{id} — partial update (task or subtask by id).
 */
export async function patchTask(id, body) {
  return apiRequest(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * POST /tasks/{id}/comments
 */
export async function postTaskComment(taskId, body) {
  return apiRequest(`/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/**
 * POST /tasks/{id}/subtasks
 */
export async function createSubtask(taskId, body) {
  return apiRequest(`/tasks/${taskId}/subtasks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * POST /tasks/{id}/attachments — multipart field name `file`, max 15MB.
 * @param {function(number): void} [onProgress] 0–100
 */
export function uploadTaskAttachment(taskId, file, onProgress) {
  const token = getToken();
  const url = `${API_BASE_URL}/tasks/${taskId}/attachments`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === "function") {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      const text = xhr.responseText || "";
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        reject({ status: xhr.status, message: "Invalid JSON response" });
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(json);
        return;
      }
      reject({
        status: xhr.status,
        message: json.message || "Upload failed",
        errors: json.errors,
      });
    };

    xhr.onerror = () =>
      reject({ status: xhr.status, message: "Network error" });
    xhr.send(fd);
  });
}

/** Resolve attachment URL for opening in a new tab. */
export function resolveAttachmentUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (API_BASE_URL || "").replace(/\/$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}
