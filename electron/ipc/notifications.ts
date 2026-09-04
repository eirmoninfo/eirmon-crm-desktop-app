import { ipcMain, Notification, nativeImage, type BrowserWindow } from 'electron';
import log from 'electron-log';
import { resolveAppIconPath } from '../utils/icon.js';
import { isTrustedSender, sanitizeAppRoute } from '../utils/ipcTrust.js';

interface AppNotificationPayload {
  title?: string;
  body?: string;
  route?: string;
  actions?: Array<{ id: string; text: string }>;
}

function showNativeAppNotification(
  mainWindow: BrowserWindow | null,
  payload: AppNotificationPayload
): { ok: boolean; icon?: string | null; error?: string; reason?: string } {
  const title = String(payload?.title || 'Eirmon CRM').slice(0, 100);
  const bodyText = String(payload?.body || '').slice(0, 500);
  const safeRoute = sanitizeAppRoute(payload?.route);

  if (!Notification.isSupported()) {
    return { ok: false, reason: 'not_supported' };
  }

  const iconPath = resolveAppIconPath();
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  const notificationOptions: Electron.NotificationConstructorOptions = {
    title,
    body: bodyText,
    timeoutType: 'default',
    ...(icon ? { icon } : {}),
    ...(process.platform === 'darwin' &&
    Array.isArray(payload?.actions) &&
    payload.actions.length
      ? {
          actions: payload.actions.slice(0, 1).map((action) => ({
            type: 'button' as const,
            text: String(action?.text || 'Reply').slice(0, 30),
          })),
          closeButtonText: 'Close',
        }
      : {}),
  };

  const n = new Notification(notificationOptions);

  const sendAction = (action = 'open'): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('notification:action', {
      action: String(action).slice(0, 40),
      route: safeRoute,
    });
  };

  n.on('click', () => sendAction('open'));
  n.on('action', (_event, index) => {
    const action = payload?.actions?.[index]?.id || 'reply';
    sendAction(action);
  });
  n.on('failed', (_event, error) => {
    log.warn('[notification:failed]', error || 'Native notification failed');
  });
  n.show();

  return { ok: true, icon: iconPath || null };
}

export function registerNotificationIpc(mainWindow: BrowserWindow | null): void {
  ipcMain.handle('notification:show', (event: Electron.IpcMainInvokeEvent, payload: AppNotificationPayload) => {
    if (!isTrustedSender(event, mainWindow)) {
      return { ok: false, error: 'Untrusted notification request.' };
    }
    try {
      return showNativeAppNotification(mainWindow, payload);
    } catch (err) {
      const error = err as Error;
      log.warn('[notification:show]', error.message || error);
      return { ok: false, error: error.message };
    }
  });

  /** @deprecated use notification:show */
  ipcMain.handle('notification:motivation', (event: Electron.IpcMainInvokeEvent, payload: AppNotificationPayload) => {
    if (!isTrustedSender(event, mainWindow)) {
      return { ok: false, error: 'Untrusted notification request.' };
    }
    try {
      return showNativeAppNotification(mainWindow, payload);
    } catch (err) {
      const error = err as Error;
      log.warn('[notification:motivation]', error.message || error);
      return { ok: false, error: error.message };
    }
  });
}
