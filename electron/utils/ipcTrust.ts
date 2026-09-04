import type { BrowserWindow } from 'electron';

type IpcEventLike = {
  sender?: { id?: number } | null;
};

/** True when the IPC sender is the app main window (not a guest/print/devtools frame). */
export function isTrustedSender(
  event: IpcEventLike | null | undefined,
  mainWindow: BrowserWindow | null | undefined
): boolean {
  if (!event?.sender || !mainWindow || mainWindow.isDestroyed()) return false;
  try {
    return event.sender.id === mainWindow.webContents.id;
  } catch {
    return false;
  }
}

/** Only http(s) API bases — blocks file:, data:, javascript: token exfil via idle monitor. */
export function isAllowedApiBaseUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** In-app routes only (blocks open-redirect via notification payload). */
export function sanitizeAppRoute(route: unknown): string | null {
  if (typeof route !== 'string') return null;
  const trimmed = route.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.includes('\\') || trimmed.includes('\0')) return null;
  return trimmed.slice(0, 500);
}

/** Strip obvious script/event payloads from print HTML (defense in depth). */
export function sanitizePrintHtml(html: unknown, maxBytes = 1_500_000): string {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('html string is required');
  }
  if (Buffer.byteLength(html, 'utf8') > maxBytes) {
    throw new Error('Print HTML exceeds size limit');
  }
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, '');
}
