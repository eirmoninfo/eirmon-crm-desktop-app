import { getToken } from "../utils/storage";
import { API_BASE_URL } from "./api.config";



export async function apiRequest(endpoint, options = {}) {
  const token = getToken();

  const isFormData = options?.body instanceof FormData;
  const isStringBody = typeof options?.body === "string";

  // ✅ Build headers safely
  const headers = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // ✅ If NOT FormData, send JSON (auto stringify object)
  let body = options.body;

  if (body != null && !isFormData) {
    // if body is plain object, convert to JSON
    if (!isStringBody && typeof body === "object") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    } else if (isStringBody) {
      // if user passed string body, assume it's JSON string unless they override content-type
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
  }

  // ✅ If FormData, NEVER set Content-Type (browser sets boundary)
  if (isFormData) {
    delete headers["Content-Type"];
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    body,
  });

  // ✅ handle empty response
  const text = await res.text();

  if (!text) {
    if (!res.ok) {
      throw { status: res.status, message: "Empty response from server" };
    }
    return { status: "success" }; // optional fallback
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // Sometimes backend may return HTML error
    throw {
      status: res.status,
      message: "Invalid JSON response",
      raw: text,
    };
  }

  if (!res.ok) {
    throw {
      status: res.status,
      message: json.message || "Request failed",
      errors: json.errors,
    };
  }

  return json;
}

