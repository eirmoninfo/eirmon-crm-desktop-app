import { startIdleTracking, stopIdleTracking } from "../src/utils/idleTracker";
import {
  startAttendanceScreenshotSync,
  stopAttendanceScreenshotSync,
} from "../src/utils/attendanceScreenshotSync";
import { fetchTrackerConfig } from "../src/api/trackerConfig";
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

  try {
    startMotivationNotificationListener();

    if (!trackerStarted) {
      const config = await fetchTrackerConfig(token);

      startIdleTracking(config, token);

      startAttendanceScreenshotSync(token, {
        screenshot_min_interval: config.screenshot_min_interval,
        screenshot_max_interval: config.screenshot_max_interval,
        enable_screenshots: config.enable_screenshots,
        user_screenshot_enabled: config.user_screenshot_enabled,
      });

      trackerStarted = true;
      console.log("[Tracker] Started:", config);
    } else {
      console.log("[Tracker] Already running");
    }

    const liveOk = await startLiveScreenMonitoring(token);
    if (!liveOk) {
      console.warn("[LiveScreen] Not listening yet — will retry when Echo connects");
      window.addEventListener(
        "collabflow:echo-ready",
        () => {
          startLiveScreenMonitoring(token).catch((err) => {
            console.error("[LiveScreen] Retry failed:", err);
          });
        },
        { once: true }
      );
    }
  } catch (err) {
    console.error("[Tracker] Bootstrap failed:", err);
    stopIdleTracking();
    stopAttendanceScreenshotSync();
    stopLiveScreenMonitoring();
    stopMotivationNotificationListener();
    trackerStarted = false;
  }
}

/** Call on logout so the next login can bootstrap again. */
export function resetTrackerBootstrap() {
  trackerStarted = false;
  stopAttendanceScreenshotSync();
  stopIdleTracking();
  stopLiveScreenMonitoring();
  stopMotivationNotificationListener();
  syncElectronBreakState(false);
}
