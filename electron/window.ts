import { app, BrowserWindow, globalShortcut, ipcMain, session, type BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAppIconNative } from './utils/icon.js';
import { isTrustedSender } from './utils/ipcTrust.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let quitConfirmed = false;
let skipCloseGuard = false;
let closeFlowActive = false;
let quittingViaAppMenu = false;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function isQuitting(): boolean {
  return quitConfirmed;
}

export function setQuitting(value: boolean): void {
  quitConfirmed = value;
}

export function isSkipCloseGuard(): boolean {
  return skipCloseGuard;
}

export function setSkipCloseGuard(value: boolean): void {
  skipCloseGuard = value;
}

export function isCloseFlowActive(): boolean {
  return closeFlowActive;
}

export function setCloseFlowActive(value: boolean): void {
  closeFlowActive = value;
}

export function isQuittingViaAppMenu(): boolean {
  return quittingViaAppMenu;
}

export function setQuittingViaAppMenu(value: boolean): void {
  quittingViaAppMenu = value;
}

function startCloseFlow(): void {
  if (closeFlowActive || !mainWindow || mainWindow.isDestroyed()) return;
  closeFlowActive = true;
  mainWindow.webContents.send('app:close-request', {
    quitApp: quittingViaAppMenu,
  });
}

function resetCloseFlowState(): void {
  closeFlowActive = false;
  quittingViaAppMenu = false;
}

function attachWindowCloseGuard(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (quitConfirmed || skipCloseGuard) return;
    event.preventDefault();
    if (!closeFlowActive) {
      startCloseFlow();
    }
  });
}

function isAllowedMediaPermission(permission: string): boolean {
  return [
    'geolocation',
    'media',
    'mediaKeySystem',
    'display-capture',
    'camera',
    'microphone',
  ].includes(permission);
}

function isTrustedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return true;
  return (
    origin.startsWith('file://') ||
    origin.startsWith('http://localhost:5173') ||
    origin.startsWith('http://127.0.0.1:5173') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  );
}

function isTrustedPermissionRequester(requestingWebContents: Electron.WebContents | null): boolean {
  if (!requestingWebContents) return false;
  if (requestingWebContents === mainWindow?.webContents) return true;
  if (requestingWebContents.isDestroyed?.()) return false;

  try {
    const url = requestingWebContents.getURL();
    return isTrustedOrigin(url);
  } catch {
    return false;
  }
}

function setupAppDockIcon(): void {
  const appIcon = resolveAppIconNative();
  if (appIcon && process.platform === 'darwin') {
    try {
      app.dock?.setIcon(appIcon);
    } catch {
      /* ignore */
    }
    try {
      app.setAboutPanelOptions({
        applicationName: 'Eirmon CRM',
        applicationVersion: app.getVersion(),
        copyright: 'Eirmon Solutions',
      });
    } catch {
      /* ignore */
    }
  }
}

function setupGlobalShortcuts(): void {
  globalShortcut.register('CommandOrControl+Alt+I', () => {
    mainWindow?.webContents.toggleDevTools();
  });
}

function setupWindowEventHandlers(): void {
  app.on('before-quit', (event) => {
    if (quitConfirmed || skipCloseGuard) return;
    event.preventDefault();
    quittingViaAppMenu = true;
    startCloseFlow();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  ipcMain.on('app:confirm-close', (evt, payload) => {
    if (!isTrustedSender(evt, mainWindow)) return;
    quitConfirmed = true;
    const quitApp = payload?.quitApp === true || quittingViaAppMenu;

    resetCloseFlowState();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }

    if (quitApp) {
      app.quit();
    }
  });

  ipcMain.on('app:cancel-close', (evt) => {
    if (!isTrustedSender(evt, mainWindow)) return;
    resetCloseFlowState();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

export function createMainWindow(): BrowserWindow {
  const appIcon = resolveAppIconNative();
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const isDev = !app.isPackaged;
  const devUrl = process.env.APP_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Eirmon CRM',
    backgroundColor: '#050505',
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      // DevTools only in local builds — reduces production debug surface.
      devTools: isDev,
    },
  } as BrowserWindowConstructorOptions);

  mainWindow = win;
  attachWindowCloseGuard(win);

  win.on('closed', () => {
    mainWindow = null;
    if (!quitConfirmed) {
      resetCloseFlowState();
    }
  });

  win.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle('Eirmon CRM');
  });

  // Block popups / unexpected navigations (XSS → external site).
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = app.isPackaged
      ? url.startsWith('file://')
      : url.startsWith(devUrl) || url.startsWith('http://localhost:5173') || url.startsWith('http://127.0.0.1:5173');
    if (!allowed) {
      event.preventDefault();
    }
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
    return win;
  }

  win.loadURL(devUrl);
  if (process.env.VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools();
  }

  return win;
}

export function initializeApp(): void {
  app.setName('Eirmon CRM');

  // LiveKit/WebRTC: Join is async, so the click gesture expires before <video> mounts.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.eirmon.crm');
  }

  setupAppDockIcon();
  setupWindowEventHandlers();
}

export function registerPermissionHandlersWhenReady(): void {
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler(
      (requestingWebContents, permission, callback) => {
        if (!isAllowedMediaPermission(permission)) {
          callback(false);
          return;
        }
        // Electron sometimes omits webContents on media checks — still allow app origins.
        if (!requestingWebContents) {
          callback(true);
          return;
        }
        callback(isTrustedPermissionRequester(requestingWebContents));
      }
    );

    session.defaultSession.setPermissionCheckHandler(
      (requestingWebContents, permission, requestingOrigin) => {
        if (!isAllowedMediaPermission(permission)) return false;
        if (!requestingWebContents) return isTrustedOrigin(requestingOrigin);
        return isTrustedPermissionRequester(requestingWebContents);
      }
    );
  });
}

export function registerGlobalShortcutsWhenReady(): void {
  app.whenReady().then(() => {
    if (app.isPackaged) return;
    globalShortcut.register('CommandOrControl+Alt+I', () => {
      mainWindow?.webContents.toggleDevTools();
    });
  });
}
