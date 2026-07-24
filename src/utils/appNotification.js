import toast from "react-hot-toast";
import { getLogoAbsoluteUrl, getToastLogoIcon } from "./appBrand";
import { playNotificationSound } from "./notificationSound";

/**
 * Show a native OS notification with the Eirmon logo (Electron main process when available).
 * Also plays a short in-app chime and can surface a toast banner.
 */
export function showAppNotification({
  title,
  body,
  silent = false,
  toastMessage,
  toastOptions = {},
} = {}) {
  const safeTitle = String(title || "Eirmon CRM").slice(0, 100);
  const safeBody = String(body || "").slice(0, 500);
  const safeToastMessage = String(toastMessage || "").trim();

  if (!silent) {
    try {
      playNotificationSound();
    } catch {
      /* ignore */
    }
  }

  if (safeToastMessage) {
    try {
      toast.success(safeToastMessage, {
        icon: getToastLogoIcon(),
        duration: 6000,
        ...toastOptions,
      });
    } catch {
      /* ignore */
    }
  }

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
        silent: false,
      });
      return Promise.resolve({ ok: true });
    } catch {
      /* fall through */
    }
  }

  return Promise.resolve({ ok: false, reason: "unavailable" });
}
