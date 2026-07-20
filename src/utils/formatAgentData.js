export function formatMinutesLabel(mins) {
  const n = Math.abs(Number(mins));
  if (!Number.isFinite(n) || n <= 0) return "0m";
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTimeValue(value) {
  if (value == null || value === "" || value === "—") return "—";
  return String(value);
}

export function detectAgentDataType(data, action) {
  if (data == null || typeof data !== "object") return null;
  if (data.type) return data.type;
  if (action === "list_attendance" || action === "attendance_report") {
    return "attendance_report";
  }
  if (action === "attendance_today" || data.check_in != null) {
    return "attendance_today";
  }
  if (action === "list_tasks" || (Array.isArray(data.items) && data.items[0]?.title)) {
    return "tasks";
  }
  if (action === "team_attendance_today" || Array.isArray(data.items)) {
    return "team_attendance";
  }
  if (data.id && (data.start || data.break_start)) return "break";
  return null;
}

export function shouldShowAgentData(data, action) {
  return Boolean(detectAgentDataType(data, action));
}
