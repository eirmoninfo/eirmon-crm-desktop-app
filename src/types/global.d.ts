interface CollabflowNotification {
  id: string;
  title: string;
  body: string;
  route: string;
  createdAt: string;
}

interface ElectronAPI {
  takeScreenshot: () => Promise<string>;
  getDesktopSources: () => Promise<Array<{ id: string; name: string }>>;
  promptLiveScreenAccess: () => Promise<{ accepted: boolean }>;
  selectLiveScreenSource: () => Promise<{ cancelled: boolean; permission: string; source?: { id: string; name: string } }>;
  showLiveScreenError: (message: string) => Promise<{ retry: boolean }>;
  logLiveScreen: (level: string, message: string) => void;
  breakStart: (token: string) => void;
  breakEnd: (token: string) => void;
  syncBreakState: (hasActiveBreak: boolean, opts?: { force?: boolean }) => void;
  onIdleBreakChanged: (callback: (payload: { active: boolean }) => void) => () => void;
  configureIdleMonitor: (payload: Record<string, unknown>) => void;
  clearIdleMonitor: () => void;
  listPrinters: () => Promise<{ ok: boolean; printers?: unknown[]; error?: string }>;
  printHtmlReceipt: (payload: Record<string, unknown>) => Promise<{ ok: boolean; message?: string; error?: string }>;
  checkForAppUpdates: () => Promise<{ ok: boolean; disabled?: boolean; error?: string; downloadUrl?: string }>;
  installDownloadedUpdateNow: () => Promise<{ ok: boolean; disabled?: boolean; error?: string }>;
  openLatestReleasePage: () => Promise<{ ok: boolean; error?: string }>;
  showAppNotification: (payload: {
    title?: string;
    body?: string;
    route?: string;
    actions?: Array<{ id: string; text: string }>;
    toastMessage?: string;
    toastOptions?: Record<string, unknown>;
  }) => Promise<{ ok: boolean; icon?: string | null; error?: string; reason?: string }>;
  onAppNotificationAction: (callback: (payload: { action: string; route: string | null }) => void) => () => void;
  showMotivationNotification: (payload: Record<string, unknown>) => Promise<{ ok: boolean; icon?: string | null; error?: string }>;
  onAppUpdaterEvent: (callback: (payload: {
    type: 'checking' | 'available' | 'not-available' | 'download-progress' | 'downloaded' | 'error' | 'disabled';
    version?: string;
    releaseDate?: string;
    percent?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
    message?: string;
    downloadUrl?: string;
  }) => void) => () => void;
  onAppCloseRequest: (callback: (payload: { quitApp: boolean }) => void) => () => void;
  confirmAppClose: (payload: { quitApp?: boolean }) => void;
  cancelAppClose: () => void;
}

interface Window {
  api?: ElectronAPI;
  __collabflowNotifications: CollabflowNotification[];
  __collabflowChatUnread: number;
  dispatchEvent: (event: CustomEvent) => boolean;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => void;
}

declare global {
  interface WindowEventMap {
    'collabflow:team-chat-message': CustomEvent<{
      message: {
        id: string | number;
        body?: string;
        _displayBody?: string;
        user_id?: string | number;
        user?: { id: string | number; name?: string };
        sender?: { name?: string };
        author_name?: string;
        user_name?: string;
        created_at?: string;
        channel_id?: string | number;
        channel?: { id: string | number; name?: string };
      };
      channelId: string | number;
      channelName?: string;
    }>;
    'collabflow:task-assigned': CustomEvent<{
      task: {
        id: string | number;
        title?: string;
        created_at?: string;
        desktop_route?: string;
        assigned_by?: { name?: string };
        creator?: { name?: string };
        assigned_by_name?: string;
      };
    }>;
    'collabflow:task-activity': CustomEvent<{
      type?: string;
      message?: string;
      desktop_route?: string;
      actor?: { name?: string };
      comment?: { id?: string | number };
      attachment?: { id?: string | number };
      task?: { id?: string | number; title?: string; status?: string };
    }>;
    'collabflow:task-updated': CustomEvent<{
      task: {
        id: string | number;
        title?: string;
        status?: string;
        priority?: string;
        assigned_to?: string | number;
        comments_count?: number;
        attachments_count?: number;
      };
    }>;
    'collabflow:notification-added': CustomEvent<CollabflowNotification>;
    'collabflow:team-chat-unread': CustomEvent<{ total: number }>;
    'collabflow:session-authenticated': CustomEvent<unknown>;
    'collabflow:session-logged-out': CustomEvent<unknown>;
    'collabflow:echo-ready': CustomEvent<unknown>;
    'collabflow:attendance-changed': CustomEvent<{ source: string; active: boolean }>;
    'idle-break:changed': CustomEvent<{ active: boolean; source: string }>;
    'notification:action': CustomEvent<{ action: string; route: string | null }>;
    'app-updater:event': CustomEvent<{
      type: 'checking' | 'available' | 'not-available' | 'download-progress' | 'downloaded' | 'error' | 'disabled';
      version?: string;
      releaseDate?: string;
      percent?: number;
      transferred?: number;
      total?: number;
      bytesPerSecond?: number;
      message?: string;
    }>;
    'app:close-request': CustomEvent<{ quitApp: boolean }>;
  }
}
