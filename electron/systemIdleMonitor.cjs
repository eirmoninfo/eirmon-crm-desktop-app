/**
 * System-wide idle detection via powerMonitor.getSystemIdleTime() (macOS/Windows).
 * Linux: getSystemIdleTime is usually unavailable — monitor does not run (log once).
 *
 * idleInducedBreak: current break was started by this monitor (system idle threshold).
 * manualBreak: break from UI sync / IPC — never auto-ended when user becomes active.
 */

const { powerMonitor } = require("electron");

const POLL_MS = 15 * 1000;
const ACTIVE_BREAK_POLL_MS = 5 * 1000;
const DEDUPE_MS = 4000;

let pollTimer = null;
let currentPollMs = POLL_MS;
let onBreakChange = null;
let trackingToken = null;
let idleLimitSec = 120;
let enableIdleTracking = true;
let enableBreakTracking = true;

let breakActive = false;
let idleInducedBreak = false;
let manualBreak = false;

let apiUrlFn = null;
let fetchFn = null;

let lastStartAt = 0;
let lastEndAt = 0;
let idleStartInFlight = false;
let idleEndInFlight = false;

let resumeHooked = false;

function canUseSystemIdle() {
  return typeof powerMonitor?.getSystemIdleTime === "function";
}

function getIdleSeconds() {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0;
  }
}

async function postBreakStart() {
  if (!trackingToken || !apiUrlFn || !fetchFn) return false;
  const t = Date.now();
  if (t - lastStartAt < DEDUPE_MS) return false;

  const res = await fetchFn(apiUrlFn("/attendance/break/start"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trackingToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[IdleMonitor] break/start failed:", res.status, text);
    return false;
  }
  lastStartAt = Date.now();
  return true;
}

async function postBreakEnd() {
  if (!trackingToken || !apiUrlFn || !fetchFn) return false;
  const t = Date.now();
  if (t - lastEndAt < DEDUPE_MS) return false;

  const res = await fetchFn(apiUrlFn("/attendance/break/end"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trackingToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[IdleMonitor] break/end failed:", res.status, text);
    return false;
  }
  lastEndAt = Date.now();
  return true;
}

function emitBreakChange(active) {
  if (typeof onBreakChange !== "function") return;
  try {
    onBreakChange({ active: !!active, source: "idle" });
  } catch (e) {
    console.warn("[IdleMonitor] onBreakChange failed:", e.message);
  }
}

function refreshPollingInterval() {
  const nextMs =
    breakActive && idleInducedBreak ? ACTIVE_BREAK_POLL_MS : POLL_MS;
  if (nextMs === currentPollMs && pollTimer) return;
  currentPollMs = nextMs;
  startPolling();
}

async function tryIdleAutoStart() {
  if (idleStartInFlight) return;
  if (!enableIdleTracking || !enableBreakTracking) return;
  if (!trackingToken) return;
  if (breakActive) return;

  idleStartInFlight = true;
  try {
    const ok = await postBreakStart();
    if (!ok) return;
    breakActive = true;
    idleInducedBreak = true;
    manualBreak = false;
    refreshPollingInterval();
    emitBreakChange(true);
    console.log("[IdleMonitor] Auto break started (system idle)");
  } finally {
    idleStartInFlight = false;
  }
}

async function tryIdleAutoEnd() {
  if (idleEndInFlight) return;
  if (!idleInducedBreak || !breakActive) return;
  if (!trackingToken) return;

  idleEndInFlight = true;
  try {
    const ok = await postBreakEnd();
    if (!ok) return;
    breakActive = false;
    idleInducedBreak = false;
    manualBreak = false;
    refreshPollingInterval();
    emitBreakChange(false);
    console.log("[IdleMonitor] Auto break ended (user active system-wide)");
  } finally {
    idleEndInFlight = false;
  }
}

function tick() {
  if (!trackingToken || !enableIdleTracking) return;
  if (!canUseSystemIdle()) return;

  const idleSec = getIdleSeconds();

  if (idleSec >= idleLimitSec) {
    void tryIdleAutoStart();
  } else {
    void tryIdleAutoEnd();
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => tick(), currentPollMs);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function onPowerResume() {
  tick();
}

function attachPowerResumeOnce() {
  if (resumeHooked) return;
  try {
    powerMonitor.on("resume", onPowerResume);
    resumeHooked = true;
  } catch (e) {
    console.warn("[IdleMonitor] powerMonitor resume hook:", e.message);
  }
}

/**
 * @param {object} opts
 * @param {(p: string) => string} opts.apiUrl
 * @param {typeof fetch} opts.fetch
 * @param {string} [opts.token]
 * @param {object} [opts] rest — tracker config (idle_time_limit, enable_idle_tracking, …)
 */
function configure(opts) {
  const { apiUrl, fetch, token, onBreakChange: breakChangeCb, ...config } =
    opts;

  apiUrlFn = apiUrl;
  fetchFn = fetch;
  trackingToken = token || null;
  onBreakChange =
    typeof breakChangeCb === "function" ? breakChangeCb : null;
  currentPollMs = POLL_MS;

  enableIdleTracking = config.enable_idle_tracking !== false;
  enableBreakTracking = config.enable_break_tracking !== false;

  const minutes = Number(config.idle_time_limit);
  idleLimitSec = Math.max(
    15,
    (Number.isFinite(minutes) && minutes > 0 ? minutes : 2) * 60
  );

  stopPolling();

  if (!canUseSystemIdle()) {
    console.warn(
      "[IdleMonitor] powerMonitor.getSystemIdleTime() unavailable — system idle disabled (common on Linux)."
    );
    return;
  }

  if (!enableIdleTracking) {
    console.log("[IdleMonitor] Disabled (enable_idle_tracking=false)");
    return;
  }

  attachPowerResumeOnce();

  console.log(
    "[IdleMonitor] System idle threshold:",
    idleLimitSec / 60,
    "min · poll every",
    POLL_MS / 1000,
    "s (",
    ACTIVE_BREAK_POLL_MS / 1000,
    "s while idle break active)"
  );

  tick();
  startPolling();
}

function stop() {
  stopPolling();
  currentPollMs = POLL_MS;
  onBreakChange = null;
  trackingToken = null;
  enableIdleTracking = true;
  enableBreakTracking = true;
  breakActive = false;
  idleInducedBreak = false;
  manualBreak = false;
  apiUrlFn = null;
  fetchFn = null;
}

function syncFromRenderer(active, force = false) {
  if (!active && idleInducedBreak && breakActive && !force) {
    // Renderer may be stale (page mounted before attendance loaded).
    return;
  }

  breakActive = !!active;
  if (!active) {
    idleInducedBreak = false;
    manualBreak = false;
    refreshPollingInterval();
  } else if (!idleInducedBreak) {
    manualBreak = true;
  }
}

async function handleBreakStartIPC(token) {
  if (!token || breakActive) return;
  trackingToken = trackingToken || token;

  const ok = await postBreakStart();
  if (!ok) return;

  breakActive = true;
  manualBreak = true;
  idleInducedBreak = false;
}

async function handleBreakEndIPC(token) {
  if (!token || !breakActive) return;

  const ok = await postBreakEnd();
  if (!ok) return;

  breakActive = false;
  idleInducedBreak = false;
  manualBreak = false;
}

attachPowerResumeOnce();

module.exports = {
  configure,
  stop,
  syncFromRenderer,
  handleBreakStartIPC,
  handleBreakEndIPC,
};
