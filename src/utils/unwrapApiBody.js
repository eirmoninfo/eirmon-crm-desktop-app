/**
 * Laravel-style JSON: `{ data: T }` → `T` when `data` is a non-null object.
 * Otherwise returns the original value (already flat or primitive).
 */
export function unwrapApiBody(json) {
  if (json == null || typeof json !== "object") return json;
  const { data } = json;
  if (
    data !== undefined &&
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    return data;
  }
  return json;
}

export function toBool(value, defaultTrue = true) {
  if (value === undefined || value === null) return defaultTrue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "0" || s === "false" || s === "no" || s === "off") return false;
    if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  }
  return defaultTrue;
}
