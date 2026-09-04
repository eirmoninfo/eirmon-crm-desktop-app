import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

interface AppNotificationPayload {
  title?: string;
  body?: string;
  route?: string;
  actions?: Array<{ id: string; text: string }>;
  toastMessage?: string;
  toastOptions?: Record<string, unknown>;
}

interface AppUpdaterEvent {
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

interface NotificationActionPayload {
  action: string;
  route: string | null;
}

const electronAPI = {
  // Screenshot
  takeScreenshot: (): Promise<string> => ipcRenderer.invoke('take-screenshot'),

  /** Screen sources for live WebRTC share (no picker). */
  getDesktopSources: (): Promise<Array<{ id: string; name: string }>> => ipcRenderer.invoke('get-desktop-sources'),

  promptLiveScreenAccess: (): Promise<{ accepted: boolean }> => ipcRenderer.invoke('live-screen:prompt'),
  selectLiveScreenSource: (): Promise<{ cancelled: boolean; permission: string; source?: { id: string; name: string } }> =>
    ipcRenderer.invoke('live-screen:select-source'),
  showLiveScreenError: (message: string): Promise<{ retry: boolean }> =>
    ipcRenderer.invoke('live-screen:error', message),
  logLiveScreen: (level: string, message: string): void =>
    ipcRenderer.send('live-screen:log', { level, message }),

  // Break actions
  breakStart: (token: string): void => {
    ipcRenderer.send('break-start', token);
  },

  breakEnd: (token: string): void => {
    ipcRenderer.send('break-end', token);
  },

  // Break sync
  syncBreakState: (hasActiveBreak: boolean, opts?: { force?: boolean }): void =>
    ipcRenderer.send('break-state-sync', {
      active: !!hasActiveBreak,
      force: opts?.force === true,
    }),

  onIdleBreakChanged: (callback: (payload: { active: boolean }) => void): (() => void) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event: IpcRendererEvent, payload: { active: boolean }) => callback(payload);
    ipcRenderer.on('idle-break:changed', handler);
    return () => ipcRenderer.removeListener('idle-break:changed', handler);
  },

  // Idle monitor
  configureIdleMonitor: (payload: Record<string, unknown>): void =>
    ipcRenderer.send('idle-monitor-config', payload),

  clearIdleMonitor: (): void => ipcRenderer.send('idle-monitor-stop'),

  /** System print: hidden BrowserWindow + webContents.print (OS dialog unless silent). */
  listPrinters: (): Promise<{ ok: boolean; printers?: unknown[]; error?: string }> =>
    ipcRenderer.invoke('printers:list'),

  printHtmlReceipt: (payload: Record<string, unknown>): Promise<{ ok: boolean; message?: string; error?: string }> =>
    ipcRenderer.invoke('receipt:print-html', payload),

  /** Auto-updater controls (packaged builds only). */
  checkForAppUpdates: (): Promise<{ ok: boolean; disabled?: boolean; error?: string; downloadUrl?: string }> =>
    ipcRenderer.invoke('app-updater:check-now'),

  installDownloadedUpdateNow: (): Promise<{ ok: boolean; disabled?: boolean; error?: string }> =>
    ipcRenderer.invoke('app-updater:install-now'),

  openLatestReleasePage: (downloadUrl?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('app-updater:open-release-page', downloadUrl),

  /** OS notification with app logo (main process). */
  showAppNotification: (payload: AppNotificationPayload): Promise<{ ok: boolean; icon?: string | null; error?: string; reason?: string }> =>
    ipcRenderer.invoke('notification:show', payload),

  onAppNotificationAction: (callback: (payload: NotificationActionPayload) => void): (() => void) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event: IpcRendererEvent, payload: NotificationActionPayload) => callback(payload);
    ipcRenderer.on('notification:action', handler);
    return () => ipcRenderer.removeListener('notification:action', handler);
  },

  /** @deprecated use showAppNotification */
  showMotivationNotification: (payload: AppNotificationPayload): Promise<{ ok: boolean; icon?: string | null; error?: string }> =>
    ipcRenderer.invoke('notification:show', payload),

  // App auto-updater events from main process.
  onAppUpdaterEvent: (callback: (payload: AppUpdaterEvent) => void): (() => void) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event: IpcRendererEvent, payload: AppUpdaterEvent) => callback(payload);
    ipcRenderer.on('app-updater:event', handler);
    return () => ipcRenderer.removeListener('app-updater:event', handler);
  },

  /** Close flow: main asks renderer before quitting (punch-out warning). */
  onAppCloseRequest: (callback: (payload: { quitApp: boolean }) => void): (() => void) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event: IpcRendererEvent, payload: { quitApp: boolean }) => callback(payload);
    ipcRenderer.on('app:close-request', handler);
    return () => ipcRenderer.removeListener('app:close-request', handler);
  },

  confirmAppClose: (payload: { quitApp?: boolean }): void => ipcRenderer.send('app:confirm-close', payload),

  cancelAppClose: (): void => ipcRenderer.send('app:cancel-close'),
};

contextBridge.exposeInMainWorld('api', electronAPI);

export type ElectronAPI = typeof electronAPI;
