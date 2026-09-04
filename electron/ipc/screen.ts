import { desktopCapturer, dialog, ipcMain, session, systemPreferences, type BrowserWindow } from 'electron';
import log from 'electron-log';
import { isTrustedSender } from '../utils/ipcTrust.js';

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

  // Screenshot handler
  const handleScreenshot = async (): Promise<string> => {
    if (
      process.platform === 'darwin' &&
      typeof systemPreferences?.getMediaAccessStatus === 'function'
    ) {
      try {
        const st = systemPreferences.getMediaAccessStatus('screen');
        if (st && st !== 'granted') {
          log.info('[take-screenshot] macOS screen media status:', st);
        }
      } catch {
        /* ignore */
      }
    }

    const thumbnailSizes = [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 800, height: 600 },
    ];
    let lastErr: Error | null = null;
    for (const thumbnailSize of thumbnailSizes) {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize,
          fetchWindowIcons: false,
        });
        const source =
          sources.find((s) => s.thumbnail && !s.thumbnail.isEmpty()) ||
          sources[0];
        if (source?.thumbnail && !source.thumbnail.isEmpty()) {
          return source.thumbnail.toPNG().toString('base64');
        }
      } catch (e) {
        lastErr = e as Error;
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const img = await mainWindow.webContents.capturePage();
        if (img && !img.isEmpty()) {
          log.warn(
            '[take-screenshot] desktopCapturer failed; using main window capturePage fallback'
          );
          return img.toPNG().toString('base64');
        }
      } catch (e) {
        lastErr = e as Error;
      }
    }

    const hint =
      process.platform === 'darwin'
        ? 'Enable Screen Recording for Electron (dev) or Eirmon CRM in System Settings → Privacy & Security, then fully quit and restart this app.'
        : 'Check OS screen / display capture permissions, then restart the app.';
    throw new Error(
      [lastErr?.message || 'Screen capture failed.', hint].filter(Boolean).join(' ')
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

    const permission =
      process.platform === 'darwin' && systemPreferences.getMediaAccessStatus
        ? systemPreferences.getMediaAccessStatus('screen')
        : 'granted';
    log.info('[live-screen] Screen recording permission:', permission);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 300, height: 180 },
      fetchWindowIcons: false,
    });
    if (!sources.length) return { cancelled: true, permission };

    // Prefer primary / "Entire screen" without showing a picker dialog.
    const source =
      sources.find((s) => /entire screen|screen 1|display 1|built-in/i.test(s.name)) ||
      sources[0];
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
    return (
      sources.find((source) => /entire screen|screen 1|display 1|built-in/i.test(source.name)) ||
      sources[0]
    );
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
          if (
            process.platform === 'darwin' &&
            typeof systemPreferences?.getMediaAccessStatus === 'function'
          ) {
            const st = systemPreferences.getMediaAccessStatus('screen');
            if (st && st !== 'granted') {
              log.warn('[live-screen] macOS screen recording status:', st);
            }
          }

          const preferredId = liveScreenConsentGranted ? selectedLiveScreenSourceId : null;
          const screen = await pickScreenSource(preferredId);

          selectedLiveScreenSourceId = null;
          liveScreenConsentGranted = false;

          if (!screen) {
            log.error('[live-screen] No display source available');
            respond({});
            return;
          }

          log.info('[live-screen] Granting display media:', screen.name);
          respond({ video: screen });
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
