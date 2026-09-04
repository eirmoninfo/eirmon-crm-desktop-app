import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pkg from 'electron-updater';
import log from 'electron-log';
import { app, shell, type BrowserWindow } from 'electron';

const { autoUpdater } = pkg;

const RELEASES_URL = 'https://github.com/eirmoninfo/eirmon-crm-desktop-app/releases/latest';
const MAC_MANUAL_UPDATE_MESSAGE =
  'On Mac, install updates from the GitHub DMG. In-app auto-update only works when Eirmon One is signed with an Apple Developer ID.';

let updaterInitialized = false;
let updateCheckPromise: Promise<void> | null = null;
let updaterCheckTimer: NodeJS.Timeout | null = null;
/** When true, skip noisy checking / not-available / error / available UI events. */
let quietUpdateCheck = false;
/** Avoid re-prompting the same downloaded version on periodic checks. */
let lastNotifiedDownloadedVersion: string | null = null;

interface UpdaterEventPayload {
  type: 'checking' | 'available' | 'not-available' | 'download-progress' | 'downloaded' | 'error' | 'disabled';
  version?: string;
  releaseDate?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
  downloadUrl?: string;
}

export function clearMacShipItCache(): void {
  if (process.platform !== 'darwin') return;
  const cacheDir = path.join(os.homedir(), 'Library/Caches/com.eirmon.crm.ShipIt');
  try {
    rmSync(cacheDir, { recursive: true, force: true });
    log.info('[autoUpdater] Cleared ShipIt cache', cacheDir);
  } catch (err) {
    log.warn('[autoUpdater] Could not clear ShipIt cache', err);
  }
}

function sendUpdaterEvent(mainWindow: BrowserWindow | null, payload: UpdaterEventPayload): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('app-updater:event', payload);
}

function isMacSignatureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /code signature|code requirement|did not pass validation|ShipIt/i.test(message);
}

function isMacManifestMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /latest-mac\.yml|Cannot find latest-mac\.yml/i.test(message);
}

function userFacingUpdaterError(error: unknown): string {
  if (isMacSignatureError(error) || isMacManifestMissingError(error)) {
    return MAC_MANUAL_UPDATE_MESSAGE;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not check for updates.';
}

function sendMacManualUpdate(mainWindow: BrowserWindow | null, version = ''): void {
  sendUpdaterEvent(mainWindow, {
    type: 'error',
    version,
    message: MAC_MANUAL_UPDATE_MESSAGE,
    downloadUrl: RELEASES_URL,
  });
}

function initAutoUpdater(mainWindow: BrowserWindow | null): void {
  if (updaterInitialized) return;
  updaterInitialized = true;

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  log.info('[autoUpdater] Checking GitHub releases: eirmoninfo/eirmon-crm-desktop-app');

  autoUpdater.on('checking-for-update', () => {
    log.info('[autoUpdater] Checking for updates', { quiet: quietUpdateCheck });
    if (!quietUpdateCheck) {
      sendUpdaterEvent(mainWindow, { type: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info: { version?: string; releaseDate?: string }) => {
    log.info('[autoUpdater] Update available', info?.version);
    if (quietUpdateCheck) return;
    sendUpdaterEvent(mainWindow, {
      type: 'available',
      version: info?.version || '',
      releaseDate: info?.releaseDate || '',
    });
  });

  autoUpdater.on('update-not-available', (info: { version?: string }) => {
    log.info('[autoUpdater] No update available', info?.version);
    if (!quietUpdateCheck) {
      sendUpdaterEvent(mainWindow, {
        type: 'not-available',
        version: info?.version || '',
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj: { percent?: number; transferred?: number; total?: number; bytesPerSecond?: number }) => {
    if (quietUpdateCheck) return;
    const percent = Number.isFinite(progressObj?.percent ?? 0)
      ? Number((progressObj.percent ?? 0).toFixed(1))
      : 0;
    sendUpdaterEvent(mainWindow, {
      type: 'download-progress',
      percent,
      transferred: progressObj?.transferred || 0,
      total: progressObj?.total || 0,
      bytesPerSecond: progressObj?.bytesPerSecond || 0,
    });
  });

  autoUpdater.on('update-downloaded', (info: { version?: string }) => {
    const version = info?.version || '';
    if (quietUpdateCheck && version && version === lastNotifiedDownloadedVersion) {
      log.info('[autoUpdater] Skipping duplicate downloaded prompt', version);
      return;
    }
    lastNotifiedDownloadedVersion = version || lastNotifiedDownloadedVersion;
    log.info('[autoUpdater] Update downloaded', version);
    sendUpdaterEvent(mainWindow, {
      type: 'downloaded',
      version,
      message: 'Update downloaded. Install it now or after you finish working.',
    });
  });

  autoUpdater.on('error', (error: Error) => {
    log.error('[autoUpdater] error', error);
    if (isMacSignatureError(error)) clearMacShipItCache();
    if (!quietUpdateCheck) {
      sendUpdaterEvent(mainWindow, {
        type: 'error',
        message: userFacingUpdaterError(error),
        downloadUrl: isMacSignatureError(error) || isMacManifestMissingError(error) ? RELEASES_URL : undefined,
      });
    }
  });
}

function clearUpdaterTimer(): void {
  if (updaterCheckTimer) {
    clearInterval(updaterCheckTimer);
    updaterCheckTimer = null;
  }
}

function checkForUpdatesSafe(
  mainWindow: BrowserWindow | null,
  options: { quiet?: boolean } = {}
): Promise<void> {
  if (updateCheckPromise) return updateCheckPromise;
  quietUpdateCheck = options.quiet === true;
  updateCheckPromise = autoUpdater
    .checkForUpdates()
    .then(() => {})
    .catch((err) => {
      log.error('[autoUpdater] checkForUpdates failed', err);
      if (isMacSignatureError(err)) clearMacShipItCache();
      if (!quietUpdateCheck) {
        sendUpdaterEvent(mainWindow, {
          type: 'error',
          message: userFacingUpdaterError(err),
          downloadUrl: isMacSignatureError(err) || isMacManifestMissingError(err) ? RELEASES_URL : undefined,
        });
      }
      throw err;
    })
    .finally(() => {
      updateCheckPromise = null;
      quietUpdateCheck = false;
    });
  return updateCheckPromise;
}

function schedulePeriodicUpdateChecks(mainWindow: BrowserWindow | null): void {
  clearUpdaterTimer();
  const EVERY_30_MIN_MS = 30 * 60 * 1000;
  updaterCheckTimer = setInterval(() => {
    checkForUpdatesSafe(mainWindow, { quiet: true }).catch(() => {
      /* already logged in checkForUpdatesSafe */
    });
  }, EVERY_30_MIN_MS);
}

export function setupUpdater(mainWindow: BrowserWindow | null): void {
  clearMacShipItCache();

  if (!app.isPackaged) {
    return;
  }

  // Unsigned/ad-hoc Mac builds cannot be swapped by ShipIt. Never start Squirrel.
  if (process.platform === 'darwin') {
    log.info('[autoUpdater] Mac in-app auto-install disabled until Developer ID signing is configured');
    return;
  }

  mainWindow?.webContents.once('did-finish-load', () => {
    initAutoUpdater(mainWindow);
    checkForUpdatesSafe(mainWindow, { quiet: true }).catch(() => {
      /* already logged in checkForUpdatesSafe */
    });
    schedulePeriodicUpdateChecks(mainWindow);
  });
}

export function handleCheckForUpdates(mainWindow: BrowserWindow | null): Promise<{ ok: boolean; disabled?: boolean; error?: string; downloadUrl?: string }> {
  if (!app.isPackaged) {
    sendUpdaterEvent(mainWindow, {
      type: 'disabled',
      message: 'Auto-update checks run only in packaged builds.',
    });
    return Promise.resolve({ ok: false, disabled: true });
  }

  if (process.platform === 'darwin') {
    clearMacShipItCache();
    sendMacManualUpdate(mainWindow, app.getVersion());
    return Promise.resolve({
      ok: false,
      error: MAC_MANUAL_UPDATE_MESSAGE,
      downloadUrl: RELEASES_URL,
    });
  }

  initAutoUpdater(mainWindow);
  return checkForUpdatesSafe(mainWindow, { quiet: false })
    .then(() => ({ ok: true }))
    .catch((err) => ({
      ok: false,
      error: userFacingUpdaterError(err),
      downloadUrl: isMacSignatureError(err) ? RELEASES_URL : undefined,
    }));
}

export function handleInstallUpdate(): { ok: boolean; disabled?: boolean; error?: string } {
  if (!app.isPackaged) {
    return { ok: false, disabled: true };
  }
  if (process.platform === 'darwin') {
    return { ok: false, error: MAC_MANUAL_UPDATE_MESSAGE };
  }
  try {
    log.info('[autoUpdater] User selected Install Now');
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    const error = err as Error;
    return { ok: false, error: error.message || 'Install failed.' };
  }
}

export async function handleOpenLatestRelease(): Promise<{ ok: boolean; error?: string }> {
  try {
    await shell.openExternal(RELEASES_URL);
    return { ok: true };
  } catch (err) {
    const error = err as Error;
    return { ok: false, error: error.message || 'Could not open the download page.' };
  }
}

export function cleanupUpdater(): void {
  clearUpdaterTimer();
}
