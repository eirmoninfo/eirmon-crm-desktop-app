import { getToken } from "./storage";
import { apiRequest } from "../api/http";
import { startScreenshotLoop, stopScreenshotLoop } from "./startScreenshotLoop";
import { unwrapApiBody } from "./unwrapApiBody";

let pollTimer = null;
let authToken = null;
let screenshotCfg = {};
/** True while the random-interval screenshot loop is supposed to be running */
let loopActive = false;
let listenersAttached = false;

/** How often we re-check punch state so screenshots start soon after check-in */
const POLL_MS = 15_000;

function isPunchedIn(att) {
  if (!att || typeof att !== "object") return false;
  const inAt = att.check_in;
  const outAt = att.check_out;
  return inAt != null && inAt !== "" && (outAt == null || outAt === "");
}

async function tick() {
  const token = authToken || getToken();
  if (!token || typeof window === "undefined" || !window.api?.takeScreenshot) {
    return;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    stopCapture("offline");
    return;
  }

  try {
    const res = await apiRequest("/attendance/today");
    const att = unwrapApiBody(res);

    const punched = isPunchedIn(att);
    if (!punched) {
      stopCapture("punched out or not clocked in");
      return;
    }

    const heartbeat = await apiRequest("/attendance/heartbeat", {
      method: "POST",
      body: { desktop_state: "active" },
    });
    const heartbeatData = unwrapApiBody(heartbeat) ?? {};
    const enable =
      att.screenshot_capture_enabled !== false &&
      heartbeatData.screenshot_capture_enabled !== false;

    if (enable) {
      if (!loopActive) {
        startScreenshotLoop(token, {
          ...screenshotCfg,
          enable_screenshots: true,
        });
        loopActive = true;
        console.log("[Tracker] Screenshots active (online and punched in)");
      }
    } else {
      stopCapture("disabled by admin");
    }
  } catch (e) {
    console.warn("[Tracker] attendance screenshot sync:", e);
    stopCapture("server unavailable or attendance session closed");
  }
}

function stopCapture(reason) {
  if (!loopActive) return;
  stopScreenshotLoop();
  loopActive = false;
  console.log(`[Tracker] Screenshots stopped (${reason})`);
}

function handleOffline() {
  stopCapture("offline");
}

function handleOnline() {
  tick();
}

/**
 * Poll attendance and only run the screenshot upload loop while user is punched in.
 * Call from Electron bootstrap after login (replaces starting screenshots unconditionally).
 */
export function startAttendanceScreenshotSync(token, config = {}) {
  stopAttendanceScreenshotSync();
  authToken = token;
  screenshotCfg = { ...config };

  if (!listenersAttached && typeof window !== "undefined") {
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    listenersAttached = true;
  }

  tick();
  pollTimer = setInterval(tick, POLL_MS);
}

export function stopAttendanceScreenshotSync() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  stopScreenshotLoop();
  loopActive = false;
  authToken = null;

  if (listenersAttached && typeof window !== "undefined") {
    window.removeEventListener("offline", handleOffline);
    window.removeEventListener("online", handleOnline);
    listenersAttached = false;
  }
}

/**
 * Run after check-in / check-out so screenshots start or stop without waiting for the poll.
 */
export function refreshAttendanceScreenshots() {
  return tick();
}
