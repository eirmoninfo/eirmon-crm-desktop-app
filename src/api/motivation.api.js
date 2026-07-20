import { getToken } from "../utils/storage";
import { motivationGenerateUrl } from "./api.config";

/**
 * POST motivation generate. Does not log tokens or raw HR payloads.
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ kind: 'sync'; data: object } | { kind: 'queued'; data: object }>}
 */
export async function postMotivationGenerate(body) {
  const token = getToken();
  const url = motivationGenerateUrl();
  if (!url) {
    throw new Error("API base URL is not configured");
  }
  if (!token) {
    throw new Error("Not authenticated");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw { status: res.status, message: "Invalid JSON from motivation API" };
    }
  }

  if (res.status === 401) {
    throw {
      status: 401,
      message: json.message || "Unauthorized",
    };
  }
  if (res.status === 403) {
    throw {
      status: 403,
      message: json.message || "Forbidden",
    };
  }
  if (res.status === 422) {
    throw {
      status: 422,
      message: json.message || "Validation failed",
      errors: json.errors,
    };
  }
  if (!res.ok) {
    throw {
      status: res.status,
      message: json.message || "Motivation request failed",
    };
  }

  if (res.status === 202 && json.queued) {
    return { kind: "queued", data: json };
  }

  return { kind: "sync", data: json };
}
