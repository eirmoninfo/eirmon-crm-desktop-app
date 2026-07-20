export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/** Trailing slash stripped; empty if unset. */
export function getApiRoot() {
  return String(API_BASE_URL || "").replace(/\/$/, "");
}

/**
 * POST …/api/notifications/motivation/generate — if env already ends with `/api`, do not duplicate.
 */
export function motivationGenerateUrl() {
  const root = getApiRoot();
  if (!root) return "";
  return /\/api$/i.test(root)
    ? `${root}/notifications/motivation/generate`
    : `${root}/api/notifications/motivation/generate`;
}

/**
 * Echo private-channel auth: POST …/api/broadcasting/auth (Sanctum Bearer).
 */
export function broadcastingAuthUrl() {
  const root = getApiRoot();
  if (!root) return "";
  return /\/api$/i.test(root)
    ? `${root}/broadcasting/auth`
    : `${root}/api/broadcasting/auth`;
}

/** App origin without `/api` — for `/storage/...` asset URLs. */
export function getAppOrigin() {
  const root = getApiRoot();
  if (!root) return "";
  return root.replace(/\/api\/?$/i, "");
}

export function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `${window.location.protocol}${trimmed}`;
  const origin = getAppOrigin();
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${origin}${path}`;
}

export function isReverbConfigured() {
  return Boolean(
    import.meta.env.VITE_REVERB_APP_KEY && import.meta.env.VITE_REVERB_HOST
  );
}
