/**
 * System-wide idle → auto break (Electron main process).
 *
 * `/tracker-settings`:
 * - `enable_idle_tracking` — false disables polling.
 * - `idle_time_limit` — minutes of OS-wide inactivity before auto break (default 2).
 * - `enable_break_tracking` — false skips auto break/start calls.
 *
 * Uses `powerMonitor.getSystemIdleTime()` in the main process (macOS/Windows).
 * Linux: often unsupported; idle automation stays off until Electron adds support.
 *
 * Manual breaks stay in sync via `syncElectronBreakState` → `break-state-sync` IPC.
 */

import { API_BASE_URL } from "../api/api.config";

export function startIdleTracking(config = {}, token) {
  stopIdleTracking();

  if (!window.api?.configureIdleMonitor) {
    console.warn(
      "[Tracker] configureIdleMonitor missing — run the Electron desktop app."
    );
    return;
  }

  if (config.enable_idle_tracking === false) {
    console.log("[Tracker] Idle tracking disabled by admin");
    return;
  }

  window.api.configureIdleMonitor({
    apiBaseUrl: API_BASE_URL || "",
    token,
    ...config,
  });
}

export function stopIdleTracking() {
  if (typeof window.api?.clearIdleMonitor === "function") {
    window.api.clearIdleMonitor();
  }
}
