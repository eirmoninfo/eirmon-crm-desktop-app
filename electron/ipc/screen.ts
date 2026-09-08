import {
  app,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  session,
  shell,
  systemPreferences,
  type BrowserWindow,
} from 'electron';
import log from 'electron-log';
import { isTrustedSender } from '../utils/ipcTrust.js';

function macScreenPermissionStatus(): string {
  if (
    process.platform !== 'darwin' ||
    typeof systemPreferences?.getMediaAccessStatus !== 'function'
  ) {
    return 'granted';
  }
  try {
    return systemPreferences.getMediaAccessStatus('screen') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function macScreenPermissionHint(): string {
  const appLabel = app.isPackaged
    ? 'Eirmon One'
    : 'Electron (or your terminal / Cursor if you launch from there)';
  return (
    `Enable Screen Recording for ${appLabel} in System Settings → Privacy & Security → Screen Recording, ` +
    'then fully quit and restart this app. Without that, macOS only allows capturing this window — not the full desktop.'
  );
}

async function openMacScreenRecordingSettings(): Promise<void> {
  if (process.platform !== 'darwin') return;
  try {
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    );
  } catch (err) {
    log.warn('[take-screenshot] Could not open Screen Recording settings:', err);
  }
}

function pickPrimaryScreenSource(
  sources: Electron.DesktopCapturerSource[]
): Electron.DesktopCapturerSource | null {
  if (!sources.length) return null;

  const withThumb = sources.filter((s) => s.thumbnail && !s.thumbnail.isEmpty());
  const pool = withThumb.length ? withThumb : sources;

  try {
    const primaryId = String(screen.getPrimaryDisplay().id);
    const byDisplay = pool.find((s) => String(s.display_id) === primaryId);
    if (byDisplay) return byDisplay;
  } catch {
    /* ignore */
  }

  return (
    pool.find((s) => /entire screen|screen 1|display 1|built-in/i.test(s.name)) ||
    pool[0] ||
    null
  );
}

export function registerScreenCaptureIpc(mainWindow: BrowserWindow | null): void {
  let selectedLiveScreenSourceId: string | null = null;
  let liveScreenConsentGranted = false;
  const isTrusted = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean =>
    isTrustedSender(event, mainWindow);

  const focusMainWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (process.platform === 'darwin') mainWindow.moveTop();
  };

  // Full-desktop screenshot for attendance (never fall back to app-window only).
  const handleScreenshot = async (): Promise<string> => {
    const permission = macScreenPermissionStatus();
    log.info('[take-screenshot] screen permission:', permission);

    if (process.platform === 'darwin' && permission === 'denied') {
      void openMacScreenRecordingSettings();
      throw new Error(macScreenPermissionHint());
    }

    const thumbnailSizes = [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 800, height: 600 },
    ];
    let lastErr: Error | null = null;
    let sawEmptyThumbs = false;

    for (const thumbnailSize of thumbnailSizes) {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize,
          fetchWindowIcons: false,
        });

        if (!sources.length) {
          lastErr = new Error('No display sources from desktopCapturer.');
          continue;
        }

        const emptyCount = sources.filter((s) => !s.thumbnail || s.thumbnail.isEmpty()).length;
        if (emptyCount === sources.length) {
          sawEmptyThumbs = true;
          log.warn(
            `[take-screenshot] ${sources.length} screen source(s) but empty thumbnails (permission likely missing)`
          );
          continue;
        }

        const source = pickPrimaryScreenSource(sources);
        if (source?.thumbnail && !source.thumbnail.isEmpty()) {
          log.info(
            `[take-screenshot] Captured display: ${source.name} (${thumbnailSize.width}x${thumbnailSize.height})`
          );
          return source.thumbnail.toPNG().toString('base64');
        }
      } catch (e) {
        lastErr = e as Error;
        log.warn('[take-screenshot] getSources failed:', lastErr.message);
      }
    }

    // Do NOT fall back to webContents.capturePage() — that only captures the Eirmon
    // window and looks like "screenshots of the app only" on macOS.

    if (process.platform === 'darwin' && (sawEmptyThumbs || permission !== 'granted')) {
      void openMacScreenRecordingSettings();
      throw new Error(macScreenPermissionHint());
    }

    const hint =
      process.platform === 'darwin'
        ? macScreenPermissionHint()
        : 'Check OS screen / display capture permissions, then restart the app.';
    throw new Error(
      [lastErr?.message || 'Full-screen capture failed.', hint].filter(Boolean).join(' ')
    );
  };

  // Desktop sources handler
  const handleDesktopSources = async (): Promise<Array<{ id: string; name: string }>> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 150, height: 150 },
      fetchWindowIcons: false,
    });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  };

  ipcMain.handle('live-screen:prompt', async (event) => {
    if (!isTrusted(event)) return { accepted: false };
    // Admin-driven monitoring: auto-accept (no employee Allow dialog).
    liveScreenConsentGranted = true;
    log.info('[live-screen] Auto-accepted admin live screen request');
    return { accepted: true };
  });

  ipcMain.handle('live-screen:select-source', async (event) => {
    if (!isTrusted(event)) return { cancelled: true, permission: 'denied' };
    liveScreenConsentGranted = true;

    const permission = macScreenPermissionStatus();
    log.info('[live-screen] Screen recording permission:', permission);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 300, height: 180 },
      fetchWindowIcons: false,
    });
    if (!sources.length) return { cancelled: true, permission };

    const source = pickPrimaryScreenSource(sources);
    if (!source) return { cancelled: true, permission };

    selectedLiveScreenSourceId = source.id;
    log.info('[live-screen] Auto-selected display:', source.name);
    return { cancelled: false, permission, source: { id: source.id, name: source.name } };
  });

  ipcMain.handle('live-screen:error', async (event, message: unknown) => {
    if (!isTrusted(event)) return { retry: false };
    focusMainWindow();
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'error',
      title: 'Screen Sharing Failed',
      message: 'Eirmon could not share your screen.',
      detail: String(message || 'Check screen-recording permission and try again.'),
      buttons: ['Retry', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    return { retry: result.response === 0 };
  });

  ipcMain.on('live-screen:log', (event, payload: { level?: string; message?: string }) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) return;
    const message = String(payload?.message || '');
    if (payload?.level === 'error') log.error('[live-screen]', message);
    else if (payload?.level === 'warn') log.warn('[live-screen]', message);
    else log.info('[live-screen]', message);
  });

  const pickScreenSource = async (preferredId: string | null = null) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    });
    if (!sources.length) return null;
    if (preferredId) {
      const match = sources.find((source) => source.id === preferredId);
      if (match) return match;
    }
    return pickPrimaryScreenSource(sources);
  };

  // Live screen + meeting share both use getDisplayMedia.
  const registerLiveScreenCaptureHandler = (): void => {
    const ses = session.defaultSession;
    if (!ses?.setDisplayMediaRequestHandler) {
      log.warn('[live-screen] setDisplayMediaRequestHandler not available');
      return;
    }

    ses.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        let responded = false;
        const respond = (streams: Electron.Streams) => {
          if (responded) return;
          responded = true;
          try {
            callback(streams);
          } catch (err) {
            log.error('[live-screen] display media callback failed:', err);
          }
        };

        try {
          const st = macScreenPermissionStatus();
          if (st && st !== 'granted') {
            log.warn('[live-screen] macOS screen recording status:', st);
          }

          const preferredId = liveScreenConsentGranted ? selectedLiveScreenSourceId : null;
          const screenSource = await pickScreenSource(preferredId);

          selectedLiveScreenSourceId = null;
          liveScreenConsentGranted = false;

          if (!screenSource) {
            log.error('[live-screen] No display source available');
            respond({});
            return;
          }

          log.info('[live-screen] Granting display media:', screenSource.name);
          respond({ video: screenSource });
        } catch (err) {
          log.error('[live-screen] display media handler failed:', err);
          selectedLiveScreenSourceId = null;
          liveScreenConsentGranted = false;
          respond({});
        }
      },
      { useSystemPicker: false }
    );
  };

  // Register IPC handlers (trusted main window only)
  ipcMain.handle('take-screenshot', async (event) => {
    if (!isTrusted(event)) throw new Error('Untrusted screenshot request.');
    return handleScreenshot();
  });
  ipcMain.handle('get-desktop-sources', async (event) => {
    if (!isTrusted(event)) throw new Error('Untrusted desktop-sources request.');
    return handleDesktopSources();
  });

  registerLiveScreenCaptureHandler();
}
