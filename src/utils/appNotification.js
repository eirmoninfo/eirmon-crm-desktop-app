import { getLogoAbsoluteUrl } from "./appBrand";

/**
 * Show a native OS notification with the Erimon logo (Electron main process when available).
 */
export function showAppNotification({ title, body } = {}) {
  const safeTitle = String(title || "Erimon CRM").slice(0, 100);
  const safeBody = String(body || "").slice(0, 500);

  if (typeof window !== "undefined" && window.api?.showAppNotification) {
    return window.api.showAppNotification({
      title: safeTitle,
      body: safeBody,
    });
  }

  if (typeof window !== "undefined" && window.api?.showMotivationNotification) {
    return window.api.showMotivationNotification({
      title: safeTitle,
      body: safeBody,
    });
  }

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(safeTitle, {
        body: safeBody,
        icon: getLogoAbsoluteUrl(),
      });
      return Promise.resolve({ ok: true });
    } catch {
      /* fall through */
    }
  }

  return Promise.resolve({ ok: false, reason: "unavailable" });
}
