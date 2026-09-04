import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pkg from 'electron-updater';
import log from 'electron-log';
import { app, net, shell, type BrowserWindow } from 'electron';

const { autoUpdater } = pkg;

const RELEASES_URL = 'https://github.com/eirmoninfo/eirmon-crm-desktop-app/releases/latest';
const RELEASES_API_URL =
  'https://api.github.com/repos/eirmoninfo/eirmon-crm-desktop-app/releases/latest';
const MAC_MANUAL_UPDATE_MESSAGE =
  'On Mac, install updates from the GitHub DMG. In-app auto-update only works when Eirmon One is signed with an Apple Developer ID.';

let updaterInitialized = false;
let updateCheckPromise: Promise<void> | null = null;
let macCheckPromise: Promise<{
  ok: boolean;
  updateAvailable?: boolean;
  version?: string;
  downloadUrl?: string;
  error?: string;
}> | null = null;
let updaterCheckTimer: NodeJS.Timeout | null = null;
/** When true, skip noisy checking / not-available / error / available UI events. */
let quietUpdateCheck = false;
/** Avoid re-prompting the same downloaded version on periodic checks. */
let lastNotifiedDownloadedVersion: string | null = null;
let lastNotifiedMacVersion: string | null = null;

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

interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GithubRelease {
  tag_name?: string;
  published_at?: string;
  html_url?: string;
  assets?: GithubReleaseAsset[];
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

function parseVersionParts(version: string): number[] {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

function isNewerVersion(remoteVersion: string, localVersion: string): boolean {
  const remote = parseVersionParts(remoteVersion);
  const local = parseVersionParts(localVersion);
  const len = Math.max(remote.length, local.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (remote[i] || 0) - (local[i] || 0);
    if (diff > 0) return true;
    if (diff < 0) return false;
  }
  return false;
}

function preferMacDmgAsset(assets: GithubReleaseAsset[] = []): GithubReleaseAsset | null {
  const dmgs = assets.filter((asset) => /\.dmg$/i.test(asset.name || '') && asset.browser_download_url);
  if (!dmgs.length) return null;

  const wantArm = process.arch === 'arm64';
  const archMatch = dmgs.find((asset) => {
    const name = asset.name || '';
    return wantArm ? /arm64/i.test(name) : !/arm64/i.test(name);
  });
  return archMatch || dmgs[0] || null;
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url,
      redirect: 'follow',
    });
    const chunks: Buffer[] = [];

    request.setHeader('Accept', 'application/vnd.github+json');
    request.setHeader('User-Agent', 'Eirmon-One-Desktop');
    request.setHeader('X-GitHub-Api-Version', '2022-11-28');

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const status = response.statusCode || 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`GitHub releases request failed (${status}).`));
          return;
        }
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          reject(new Error('GitHub releases response was not valid JSON.'));
        }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

async function checkMacUpdateViaGithub(
  mainWindow: BrowserWindow | null,
  options: { quiet?: boolean } = {}
): Promise<{
  ok: boolean;
  updateAvailable?: boolean;
  version?: string;
  downloadUrl?: string;
  error?: string;
}> {
  if (macCheckPromise) return macCheckPromise;

  const quiet = options.quiet === true;
  macCheckPromise = (async () => {
    clearMacShipItCache();
    if (!quiet) {
      sendUpdaterEvent(mainWindow, { type: 'checking' });
    }

    try {
      const release = await fetchJson<GithubRelease>(RELEASES_API_URL);
      const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
      const currentVersion = app.getVersion();
      const dmg = preferMacDmgAsset(release.assets || []);
      const downloadUrl = dmg?.browser_download_url || release.html_url || RELEASES_URL;

      if (!latestVersion) {
        throw new Error('Latest Mac release version was missing.');
      }

      if (!isNewerVersion(latestVersion, currentVersion)) {
        log.info('[autoUpdater] Mac GitHub check: up to date', {
          currentVersion,
          latestVersion,
        });
        if (!quiet) {
          sendUpdaterEvent(mainWindow, {
            type: 'not-available',
            version: currentVersion,
          });
        }
        return { ok: true, updateAvailable: false, version: currentVersion, downloadUrl };
      }

      log.info('[autoUpdater] Mac GitHub check: update available', {
        currentVersion,
        latestVersion,
        downloadUrl,
      });

      if (!quiet || latestVersion !== lastNotifiedMacVersion) {
        lastNotifiedMacVersion = latestVersion;
        sendUpdaterEvent(mainWindow, {
          type: 'available',
          version: latestVersion,
          releaseDate: release.published_at || '',
          downloadUrl,
          message: `Version ${latestVersion} is available. Download the Mac DMG to install it.`,
        });
      }

      return {
        ok: true,
        updateAvailable: true,
        version: latestVersion,
        downloadUrl,
      };
    } catch (err) {
      log.error('[autoUpdater] Mac GitHub check failed', err);
      if (!quiet) {
        sendUpdaterEvent(mainWindow, {
          type: 'error',
          message: MAC_MANUAL_UPDATE_MESSAGE,
          downloadUrl: RELEASES_URL,
        });
      }
      return {
        ok: false,
        error: MAC_MANUAL_UPDATE_MESSAGE,
        downloadUrl: RELEASES_URL,
      };
    } finally {
      macCheckPromise = null;
    }
  })();

  return macCheckPromise;
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
    // Never surface latest-mac.yml / ShipIt noise as a hard failure on quiet checks.
    if (isMacManifestMissingError(error) || isMacSignatureError(error)) {
      clearMacShipItCache();
      if (!quietUpdateCheck) {
        sendUpdaterEvent(mainWindow, {
          type: 'error',
          message: MAC_MANUAL_UPDATE_MESSAGE,
          downloadUrl: RELEASES_URL,
        });
      }
      return;
    }
    if (!quietUpdateCheck) {
      sendUpdaterEvent(mainWindow, {
        type: 'error',
        message: userFacingUpdaterError(error),
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
      if (isMacSignatureError(err) || isMacManifestMissingError(err)) {
        clearMacShipItCache();
        if (!quietUpdateCheck) {
          sendUpdaterEvent(mainWindow, {
            type: 'error',
            message: MAC_MANUAL_UPDATE_MESSAGE,
            downloadUrl: RELEASES_URL,
          });
        }
        return;
      }
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
    if (process.platform === 'darwin') {
      void checkMacUpdateViaGithub(mainWindow, { quiet: true });
      return;
    }
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

  // Unsigned/ad-hoc Mac builds cannot be swapped by ShipIt. Never call electron-updater
  // (it requires latest-mac.yml and fails with 404 / signature errors). Use GitHub DMG checks.
  if (process.platform === 'darwin') {
    log.info('[autoUpdater] Mac uses GitHub DMG update checks (no latest-mac.yml / ShipIt)');
    mainWindow?.webContents.once('did-finish-load', () => {
      void checkMacUpdateViaGithub(mainWindow, { quiet: true });
      schedulePeriodicUpdateChecks(mainWindow);
    });
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

export function handleCheckForUpdates(mainWindow: BrowserWindow | null): Promise<{ ok: boolean; disabled?: boolean; error?: string; downloadUrl?: string; version?: string }> {
  if (!app.isPackaged) {
    sendUpdaterEvent(mainWindow, {
      type: 'disabled',
      message: 'Auto-update checks run only in packaged builds.',
    });
    return Promise.resolve({ ok: false, disabled: true });
  }

  if (process.platform === 'darwin') {
    return checkMacUpdateViaGithub(mainWindow, { quiet: false }).then((result) => ({
      ok: result.ok,
      error: result.error,
      downloadUrl: result.downloadUrl,
      version: result.version,
    }));
  }

  initAutoUpdater(mainWindow);
  return checkForUpdatesSafe(mainWindow, { quiet: false })
    .then(() => ({ ok: true }))
    .catch((err) => ({
      ok: false,
      error: userFacingUpdaterError(err),
      downloadUrl: isMacSignatureError(err) || isMacManifestMissingError(err) ? RELEASES_URL : undefined,
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

export async function handleOpenLatestRelease(downloadUrl?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await shell.openExternal(downloadUrl || RELEASES_URL);
    return { ok: true };
  } catch (err) {
    const error = err as Error;
    return { ok: false, error: error.message || 'Could not open the download page.' };
  }
}

export function cleanupUpdater(): void {
  clearUpdaterTimer();
}
