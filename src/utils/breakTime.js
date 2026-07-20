/** Normalize API break record field names */
export function breakStart(b) {
  if (!b || typeof b !== "object") return null;
  return b.start ?? b.started_at ?? b.break_start ?? null;
}

export function breakEnd(b) {
  if (!b || typeof b !== "object") return null;
  return b.end ?? b.ended_at ?? b.break_end ?? null;
}

function parseMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Sum duration of all breaks in seconds. Open break counts until `nowMs`.
 */
export function computeBreakSeconds(breaks, nowMs = Date.now()) {
  if (!Array.isArray(breaks) || breaks.length === 0) return 0;
  let total = 0;
  for (const b of breaks) {
    const s = parseMs(breakStart(b));
    if (s == null) continue;
    const endRaw = breakEnd(b);
    const e = endRaw ? parseMs(endRaw) : nowMs;
    if (e != null && e > s) total += Math.floor((e - s) / 1000);
  }
  return total;
}

/** Duration of the active (unended) break only, in seconds */
export function currentBreakSeconds(breaks, nowMs = Date.now()) {
  if (!Array.isArray(breaks)) return 0;
  const active = breaks.find((b) => breakStart(b) && !breakEnd(b));
  if (!active) return 0;
  const s = parseMs(breakStart(active));
  if (s == null) return 0;
  return Math.max(0, Math.floor((nowMs - s) / 1000));
}

/** Formats seconds as H:MM:SS or Mm Ss when under 1h */
export function formatDurationHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  }
  if (m > 0) {
    return `${m}m ${sec}s`;
  }
  return `${sec}s`;
}

export function formatTimeShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}
