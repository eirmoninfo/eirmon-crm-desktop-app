import toast from "react-hot-toast";
import { apiRequest } from "../api/http";
import { getToken } from "./storage";
import { unwrapApiBody } from "./unwrapApiBody";
import { refreshAttendanceScreenshots } from "./attendanceScreenshotSync";
import { syncElectronBreakState } from "./electronBreakSync";
import { resetTrackerBootstrap } from "../../electron/electronBootstrap";
import { showAppNotification } from "./appNotification";

let closeListenerInstalled = false;
let handlingClose = false;

function breakStart(b) {
  return b?.start ?? b?.break_start ?? b?.started_at ?? null;
}

function breakEnd(b) {
  return b?.end ?? b?.break_end ?? b?.ended_at ?? null;
}

function isPunchedIn(att) {
  if (!att || typeof att !== "object") return false;
  const inAt = att.check_in;
  const outAt = att.check_out;
  return inAt != null && inAt !== "" && (outAt == null || outAt === "");
}

function hasActiveBreak(att, todayRes) {
  if (todayRes?.has_active_break != null) return !!todayRes.has_active_break;
  if (att?.has_active_break != null) return !!att.has_active_break;
  return (
    Array.isArray(att?.breaks) &&
    att.breaks.some((b) => breakStart(b) && !breakEnd(b))
  );
}

async function fetchTodayAttendance() {
  const res = await apiRequest("/attendance/today");
  const att =
    unwrapApiBody(res) ??
    (res?.status === "success" ? res.data : null) ??
    res?.data ??
    null;
  return { att, todayRes: res };
}

async function endActiveBreakIfNeeded(att, todayRes) {
  if (!hasActiveBreak(att, todayRes)) return;
  try {
    await apiRequest("/attendance/break/end", { method: "POST" });
    syncElectronBreakState(false);
  } catch (err) {
    console.warn("[AppClose] break/end before checkout:", err);
  }
}

async function punchOutBeforeClose() {
  const token = getToken();
  if (!token) return false;

  const { att, todayRes } = await fetchTodayAttendance();
  if (!isPunchedIn(att)) return false;

  await endActiveBreakIfNeeded(att, todayRes);

  try {
    const res = await apiRequest("/attendance/check-out", { method: "POST" });
    refreshAttendanceScreenshots();
    syncElectronBreakState(false);

    const message =
      res?.message || "You were automatically punched out when closing the app.";

    toast.success(message, { duration: 5000 });
    void showAppNotification({
      title: "Erimon CRM",
      body: message,
    });

    return true;
  } catch (err) {
    const message =
      err?.message || "Could not punch out automatically. Please check out manually.";
    toast.error(message);
    return false;
  }
}

async function handleAppCloseRequest({ quitApp = false } = {}) {
  if (handlingClose) return;
  handlingClose = true;

  try {
    const token = getToken();
    if (!token) {
      window.api?.confirmAppClose?.({ quitApp });
      return;
    }

    let punchedIn = false;
    try {
      const { att } = await fetchTodayAttendance();
      punchedIn = isPunchedIn(att);
    } catch (err) {
      console.warn("[AppClose] attendance check failed:", err);
    }

    if (punchedIn) {
      const confirmed = window.confirm(
        "You're still punched in.\n\nClosing the app will automatically punch you out.\n\nDo you want to close?"
      );
      if (!confirmed) {
        window.api?.cancelAppClose?.();
        return;
      }

      const punchedOut = await punchOutBeforeClose();
      if (!punchedOut) {
        const forceClose = window.confirm(
          "Automatic punch out failed.\n\nClose the app anyway?"
        );
        if (!forceClose) {
          window.api?.cancelAppClose?.();
          return;
        }
      }
    }

    resetTrackerBootstrap();
    window.api?.confirmAppClose?.({ quitApp });
  } finally {
    handlingClose = false;
  }
}

/**
 * When the user closes the desktop app while punched in, warn them and auto punch out on confirm.
 */
export function startPunchOutOnAppClose() {
  if (closeListenerInstalled || typeof window === "undefined") return;
  if (!window.api?.onAppCloseRequest) return;

  const off = window.api.onAppCloseRequest((payload) => {
    void handleAppCloseRequest(payload);
  });

  closeListenerInstalled = true;

  return () => {
    if (typeof off === "function") off();
    closeListenerInstalled = false;
  };
}
