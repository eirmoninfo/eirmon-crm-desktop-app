import { startIdleTracking, stopIdleTracking } from "../src/utils/idleTracker";
import {
  startAttendanceScreenshotSync,
  stopAttendanceScreenshotSync,
} from "../src/utils/attendanceScreenshotSync";
import { fetchTrackerConfig } from "../src/api/trackerConfig";
import { shouldCaptureScreenshots } from "../src/utils/permissions";
import { getStoredUser } from "../src/utils/storage";
import {
  startLiveScreenMonitoring,
  stopLiveScreenMonitoring,
} from "../src/utils/liveScreenMonitoring";
import { syncElectronBreakState } from "../src/utils/electronBreakSync";
import {
  startMotivationNotificationListener,
  stopMotivationNotificationListener,
} from "../src/utils/motivationNotifications";

let trackerStarted = false;
let offIdleBreakListener = null;
let liveMonitoringToken = null;
let bootstrapPromise = null;

async function ensureLiveScreenMonitoring(token) {
  if (!token || !window.api) return false;
  if (liveMonitoringToken === token) return true;

  const liveOk = await startLiveScreenMonitoring(token);
  if (liveOk) {
    liveMonitoringToken = token;
    console.log("[LiveScreen] Monitoring active (WebSocket and/or polling)");
  } else {
    console.warn("[LiveScreen] Monitoring not ready; waiting for Echo reconnect");
    window.addEventListener(
      "collabflow:echo-ready",
      () => {
        ensureLiveScreenMonitoring(token).catch((err) => {
          console.error("[LiveScreen] Retry failed:", err);
        });
      },
      { once: true }
    );
  }
  return liveOk;
}

function installIdleBreakListener() {
  if (typeof window.api?.onIdleBreakChanged !== "function") return () => {};
  return window.api.onIdleBreakChanged((payload) => {
    if (typeof payload?.active !== "boolean") return;
    window.dispatchEvent(
      new CustomEvent("collabflow:attendance-changed", {
        detail: { source: "idle-break", active: payload.active },
      })
    );
  });
}

/**
 * One-time setup after login (Electron): tracker config, idle/break, screenshots.
 * Live screen monitoring is retried until Echo subscribes successfully.
 */
export async function bootstrapElectron(token) {
  if (!token) {
    console.warn("[Tracker] No token; skipping bootstrap");
    return;
  }
  if (!window.api) {
    console.warn(
      "[Tracker] window.api missing — screenshots/idle only work in the Electron app."
    );
    return;
  }

  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    // Live-screen requests must not depend on tracker-config, idle, or screenshot setup.
    try {
      await ensureLiveScreenMonitoring(token);
    } catch (err) {
      console.error("[LiveScreen] Initial monitoring setup failed:", err);
    }

    try {
    startMotivationNotificationListener();
    offIdleBreakListener = installIdleBreakListener();

    if (!trackerStarted) {
      const config = await fetchTrackerConfig(token);

      startIdleTracking(config, token);

      if (shouldCaptureScreenshots(getStoredUser(), config)) {
        startAttendanceScreenshotSync(token, {
          screenshot_min_interval: config.screenshot_min_interval,
          screenshot_max_interval: config.screenshot_max_interval,
          enable_screenshots: config.enable_screenshots,
          user_screenshot_enabled: config.user_screenshot_enabled,
        });
      } else {
        console.log("[Tracker] Screenshots skipped for admin/disabled user");
      }

      trackerStarted = true;
      console.log("[Tracker] Started:", config);
    } else {
      console.log("[Tracker] Already running");
    }

    } catch (err) {
      console.error("[Tracker] Bootstrap failed (live-screen monitoring remains active):", err);
      stopIdleTracking();
      stopAttendanceScreenshotSync();
      stopMotivationNotificationListener();
      trackerStarted = false;
    }
  })();

  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

/** Call on logout so the next login can bootstrap again. */
export function resetTrackerBootstrap() {
  trackerStarted = false;
  stopAttendanceScreenshotSync();
  stopIdleTracking();
  stopLiveScreenMonitoring();
  liveMonitoringToken = null;
  bootstrapPromise = null;
  stopMotivationNotificationListener();
  if (typeof offIdleBreakListener === "function") {
    offIdleBreakListener();
    offIdleBreakListener = null;
  }
  syncElectronBreakState(false, { force: true });
}
