import { app, ipcMain } from 'electron';
import log from 'electron-log';
import { getMainWindow, createMainWindow, initializeApp, registerPermissionHandlersWhenReady, registerGlobalShortcutsWhenReady } from './window.js';
import { registerScreenCaptureIpc } from './ipc/screen.js';
import { registerNotificationIpc } from './ipc/notifications.js';
import { registerPrintIpc } from './ipc/print.js';
import { registerIdleIpc } from './ipc/idle.js';
import { setupUpdater, handleCheckForUpdates, handleInstallUpdate, handleOpenLatestRelease, cleanupUpdater, clearMacShipItCache } from './ipc/updater.js';

log.transports.file.level = 'info';
log.transports.console.level = app.isPackaged ? 'warn' : 'info';

clearMacShipItCache();
initializeApp();

app.whenReady().then(() => {
  registerPermissionHandlersWhenReady();
  registerGlobalShortcutsWhenReady();
  
  const win = createMainWindow();
  setupUpdater(win);

  registerScreenCaptureIpc(getMainWindow());
  registerNotificationIpc(getMainWindow());
  registerPrintIpc();
  registerIdleIpc();
});

app.on('will-quit', () => {
  cleanupUpdater();
});

ipcMain.handle('app-updater:check-now', async (event) => {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed() || event?.sender?.id !== mainWindow.webContents.id) {
    return { ok: false, error: 'Untrusted update request.' };
  }
  return handleCheckForUpdates(mainWindow);
});

ipcMain.handle('app-updater:install-now', (event) => {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed() || event?.sender?.id !== mainWindow.webContents.id) {
    return { ok: false, error: 'Untrusted install request.' };
  }
  return handleInstallUpdate();
});

ipcMain.handle('app-updater:open-release-page', (event, downloadUrl?: string) => {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed() || event?.sender?.id !== mainWindow.webContents.id) {
    return { ok: false, error: 'Untrusted request.' };
  }
  return handleOpenLatestRelease(typeof downloadUrl === 'string' ? downloadUrl : undefined);
});