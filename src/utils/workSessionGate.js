import { apiRequest } from "../api/http";
import { unwrapApiBody } from "./unwrapApiBody";
import { breakStart, breakEnd } from "./breakTime";

/** True when checked in and not checked out. */
export function isPunchedIn(att) {
  if (!att || typeof att !== "object") return false;
  const inAt = att.check_in;
  const outAt = att.check_out;
  return inAt != null && inAt !== "" && (outAt == null || outAt === "");
}

/** True when there is an open break on today's attendance. */
export function isOnBreak(att, todayRes = null) {
  if (todayRes?.has_active_break === true) return true;
  if (!att || !Array.isArray(att.breaks)) return false;
  return att.breaks.some((b) => breakStart(b) && !breakEnd(b));
}

/**
 * Screenshots + live screen share are allowed only while punched in and not on break.
 * @returns {Promise<{ punchedIn: boolean, onBreak: boolean, canMonitor: boolean, attendance: object|null, raw: object|null }>}
 */
export async function fetchWorkSessionState() {
  try {
    const res = await apiRequest("/attendance/today");
    const att = unwrapApiBody(res);
    if (!att || typeof att !== "object") {
      return {
        punchedIn: false,
        onBreak: false,
        canMonitor: false,
        attendance: null,
        raw: res ?? null,
      };
    }
    const punchedIn = isPunchedIn(att);
    const onBreak = isOnBreak(att, res);
    return {
      punchedIn,
      onBreak,
      canMonitor: punchedIn && !onBreak,
      attendance: att,
      raw: res,
    };
  } catch (e) {
    if (e?.status === 404 || e?.status === 409) {
      return {
        punchedIn: false,
        onBreak: false,
        canMonitor: false,
        attendance: null,
        raw: null,
      };
    }
    throw e;
  }
}
