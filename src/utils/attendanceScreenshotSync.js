import { getStoredUser, getToken } from "./storage";
import { apiRequest } from "../api/http";
import { startScreenshotLoop, stopScreenshotLoop } from "./startScreenshotLoop";
import { shouldCaptureScreenshots } from "./permissions";
import { unwrapApiBody } from "./unwrapApiBody";
import { fetchWorkSessionState } from "./workSessionGate";

let pollTimer = null;
let authToken = null;
let screenshotCfg = {};
/** True while the random-interval screenshot loop is supposed to be running */
let loopActive = false;
let listenersAttached = false;

/** How often we re-check punch/break state so screenshots start/stop quickly */
const POLL_MS = 15_000;

async function tick() {
  const token = authToken || getToken();
  if (!token || typeof window === "undefined" || !window.api?.takeScreenshot) {
    return;
  }

  if (!shouldCaptureScreenshots(getStoredUser(), screenshotCfg)) {
    stopCapture("admin or screenshot capture disabled");
    return;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    stopCapture("offline");
    return;
  }

  try {
    const session = await fetchWorkSessionState();

    if (!session.punchedIn) {
      stopCapture("punched out or not clocked in");
      return;
    }

    if (session.onBreak) {
      stopCapture("on break");
      return;
    }

    const heartbeat = await apiRequest("/attendance/heartbeat", {
      method: "POST",
      body: { desktop_state: "active" },
    });
    const heartbeatData = unwrapApiBody(heartbeat) ?? {};
    const enable =
      session.attendance?.screenshot_capture_enabled !== false &&
      heartbeatData.screenshot_capture_enabled !== false;

    if (enable) {
      if (!loopActive) {
        startScreenshotLoop(token, {
          ...screenshotCfg,
          enable_screenshots: true,
        });
        loopActive = true;
        console.log("[Tracker] Screenshots active (online, punched in, not on break)");
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

function handleAttendanceChanged() {
  tick();
}

/**
 * Poll attendance and only run the screenshot upload loop while punched in and not on break.
 */
export function startAttendanceScreenshotSync(token, config = {}) {
  stopAttendanceScreenshotSync();
  authToken = token;
  screenshotCfg = { ...config };

  if (!listenersAttached && typeof window !== "undefined") {
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("collabflow:attendance-changed", handleAttendanceChanged);
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
    window.removeEventListener(
      "collabflow:attendance-changed",
      handleAttendanceChanged
    );
    listenersAttached = false;
  }
}

/**
 * Run after check-in / check-out / break so screenshots start or stop without waiting for the poll.
 */
export function refreshAttendanceScreenshots() {
  return tick();
}
