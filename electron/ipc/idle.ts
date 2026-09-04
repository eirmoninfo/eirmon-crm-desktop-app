import { BrowserWindow, ipcMain, powerMonitor } from 'electron';
import fetch from 'node-fetch';
import { getMainWindow } from '../window.js';
import { isAllowedApiBaseUrl, isTrustedSender } from '../utils/ipcTrust.js';

const POLL_MS = 15 * 1000;
const ACTIVE_BREAK_POLL_MS = 5 * 1000;
const DEDUPE_MS = 4000;

let pollTimer: NodeJS.Timeout | null = null;
let currentPollMs = POLL_MS;
let onBreakChange: ((payload: { active: boolean; source: string }) => void) | null = null;
let trackingToken: string | null = null;
let idleLimitSec = 120;
let enableIdleTracking = true;
let enableBreakTracking = true;

let breakActive = false;
let idleInducedBreak = false;

let apiUrlFn: ((path: string) => string) | null = null;
let fetchFn: typeof fetch | null = null;

let lastStartAt = 0;
let lastEndAt = 0;
let idleStartInFlight = false;
let idleEndInFlight = false;

let resumeHooked = false;

function canUseSystemIdle(): boolean {
  return typeof powerMonitor?.getSystemIdleTime === 'function';
}

function getIdleSeconds(): number {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0;
  }
}

async function postBreakStart(): Promise<boolean> {
  if (!trackingToken || !apiUrlFn || !fetchFn) return false;
  const t = Date.now();
  if (t - lastStartAt < DEDUPE_MS) return false;

  const res = await fetchFn(apiUrlFn('/attendance/break/start'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${trackingToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 400 && /already have an active break/i.test(text)) {
      lastStartAt = Date.now();
      return true;
    }
    console.warn('[IdleMonitor] break/start failed:', res.status, text);
    return false;
  }
  lastStartAt = Date.now();
  return true;
}

async function postBreakEnd(): Promise<boolean> {
  if (!trackingToken || !apiUrlFn || !fetchFn) return false;
  const t = Date.now();
  if (t - lastEndAt < DEDUPE_MS) return false;

  const res = await fetchFn(apiUrlFn('/attendance/break/end'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${trackingToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 400 && /no active break/i.test(text)) {
      lastEndAt = Date.now();
      return true;
    }
    console.warn('[IdleMonitor] break/end failed:', res.status, text);
    return false;
  }
  lastEndAt = Date.now();
  return true;
}

function emitBreakChange(active: boolean): void {
  if (typeof onBreakChange !== 'function') return;
  try {
    onBreakChange({ active: !!active, source: 'idle' });
  } catch (e) {
    console.warn('[IdleMonitor] onBreakChange failed:', (e as Error).message);
  }
}

function refreshPollingInterval(): void {
  const nextMs = breakActive && idleInducedBreak ? ACTIVE_BREAK_POLL_MS : POLL_MS;
  if (nextMs === currentPollMs && pollTimer) return;
  currentPollMs = nextMs;
  startPolling();
}

async function tryIdleAutoStart(): Promise<void> {
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
    refreshPollingInterval();
    emitBreakChange(true);
    console.log('[IdleMonitor] Auto break started (system idle)');
  } finally {
    idleStartInFlight = false;
  }
}

async function tryIdleAutoEnd(): Promise<void> {
  if (idleEndInFlight) return;
  if (!idleInducedBreak || !breakActive) return;
  if (!trackingToken) return;

  idleEndInFlight = true;
  try {
    const ok = await postBreakEnd();
    if (!ok) return;
    breakActive = false;
    idleInducedBreak = false;
    refreshPollingInterval();
    emitBreakChange(false);
    console.log('[IdleMonitor] Auto break ended (user active system-wide)');
  } finally {
    idleEndInFlight = false;
  }
}

function tick(): void {
  if (!trackingToken || !enableIdleTracking) return;
  if (!canUseSystemIdle()) return;

  const idleSec = getIdleSeconds();

  if (idleSec >= idleLimitSec) {
    void tryIdleAutoStart();
  } else {
    void tryIdleAutoEnd();
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => tick(), currentPollMs);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function onPowerResume(): void {
  tick();
}

function attachPowerResumeOnce(): void {
  if (resumeHooked) return;
  try {
    powerMonitor.on('resume', onPowerResume);
    resumeHooked = true;
  } catch (e) {
    console.warn('[IdleMonitor] powerMonitor resume hook:', (e as Error).message);
  }
}

interface ConfigureOptions {
  apiUrl: (path: string) => string;
  fetch: typeof fetch;
  token?: string;
  onBreakChange?: (payload: { active: boolean; source: string }) => void;
  enable_idle_tracking?: boolean;
  enable_break_tracking?: boolean;
  idle_time_limit?: number;
}

function configure(opts: ConfigureOptions): void {
  const { apiUrl, fetch, token, onBreakChange: breakChangeCb, ...config } = opts;

  apiUrlFn = apiUrl;
  fetchFn = fetch;
  trackingToken = token || null;
  onBreakChange = typeof breakChangeCb === 'function' ? breakChangeCb : null;
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
      '[IdleMonitor] powerMonitor.getSystemIdleTime() unavailable — system idle disabled (common on Linux).'
    );
    return;
  }

  if (!enableIdleTracking) {
    console.log('[IdleMonitor] Disabled (enable_idle_tracking=false)');
    return;
  }

  attachPowerResumeOnce();

  console.log(
    '[IdleMonitor] System idle threshold:',
    idleLimitSec / 60,
    'min · poll every',
    POLL_MS / 1000,
    's (',
    ACTIVE_BREAK_POLL_MS / 1000,
    's while idle break active)'
  );

  tick();
  startPolling();
}

function stop(): void {
  stopPolling();
  currentPollMs = POLL_MS;
  onBreakChange = null;
  trackingToken = null;
  enableIdleTracking = true;
  enableBreakTracking = true;
  breakActive = false;
  idleInducedBreak = false;
  apiUrlFn = null;
  fetchFn = null;
}

function syncFromRenderer(active: boolean, force = false): void {
  if (!active && idleInducedBreak && breakActive && !force) {
    return;
  }

  breakActive = !!active;
  if (!active) {
    idleInducedBreak = false;
    refreshPollingInterval();
  } else if (!idleInducedBreak) {
    // manual break
  }
}

function normalizeBearerToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  return trimmed;
}

async function handleBreakStartIPC(token: string): Promise<void> {
  const safe = normalizeBearerToken(token);
  if (!safe || breakActive) return;
  trackingToken = trackingToken || safe;

  const ok = await postBreakStart();
  if (!ok) return;

  breakActive = true;
  idleInducedBreak = false;
}

async function handleBreakEndIPC(token: string): Promise<void> {
  const safe = normalizeBearerToken(token);
  if (!safe || !breakActive) return;

  const ok = await postBreakEnd();
  if (!ok) return;

  breakActive = false;
  idleInducedBreak = false;
}

attachPowerResumeOnce();

export const idleMonitor = {
  configure,
  stop,
  syncFromRenderer,
  handleBreakStartIPC,
  handleBreakEndIPC,
};

export function registerIdleIpc(): void {
  ipcMain.on('idle-monitor-config', (event, payload: unknown) => {
    if (!isTrustedSender(event, getMainWindow())) return;
    if (!payload || typeof payload !== 'object') return;
    const { apiBaseUrl, token, ...rest } = payload as Record<string, unknown>;
    if (!isAllowedApiBaseUrl(apiBaseUrl)) {
      console.warn('[IdleMonitor] Rejected idle-monitor-config: invalid apiBaseUrl');
      return;
    }
    const base = String(apiBaseUrl).replace(/\/$/, '');
    const resolveUrl = (p: string) => `${base}${p.startsWith('/') ? p : `/${p}`}`;
    const safeToken = normalizeBearerToken(token);
    idleMonitor.configure({
      apiUrl: resolveUrl,
      fetch,
      token: safeToken || undefined,
      onBreakChange: (breakChange) => {
        const mainWindow = getMainWindow() || BrowserWindow.getAllWindows()[0];
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('idle-break:changed', breakChange);
        }
      },
      ...rest,
    } as ConfigureOptions);
  });

  ipcMain.on('idle-monitor-stop', (event) => {
    if (!isTrustedSender(event, getMainWindow())) return;
    idleMonitor.stop();
  });

  ipcMain.on('break-state-sync', (event, payload: unknown) => {
    if (!isTrustedSender(event, getMainWindow())) return;
    if (typeof payload === 'boolean') {
      idleMonitor.syncFromRenderer(!!payload);
      return;
    }
    const active = !!((payload as Record<string, unknown>)?.active);
    const force = (payload as Record<string, unknown>)?.force === true;
    idleMonitor.syncFromRenderer(active, force);
  });

  ipcMain.on('break-start', (event, token: string) => {
    if (!isTrustedSender(event, getMainWindow())) return;
    void idleMonitor.handleBreakStartIPC(token);
  });

  ipcMain.on('break-end', (event, token: string) => {
    if (!isTrustedSender(event, getMainWindow())) return;
    void idleMonitor.handleBreakEndIPC(token);
  });
}
