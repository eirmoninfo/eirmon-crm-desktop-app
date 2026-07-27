import toast from "react-hot-toast";
import { createElement } from "react";
import { getLogoAbsoluteUrl, getToastLogoIcon } from "./appBrand";
import { playNotificationSound } from "./notificationSound";

/**
 * Show a native OS notification with the Eirmon logo (Electron main process when available).
 * Also plays a short in-app chime and can surface a toast banner.
 */
export async function showAppNotification({
  title,
  body,
  silent = false,
  toastMessage,
  toastOptions = {},
  route,
  actions = [],
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
      const replyAction = actions.find((action) => action?.id === "reply");
      if (replyAction && route) {
        toast.custom(
          (toastItem) =>
            createElement(
              "div",
              { className: "eirmon-toast flex items-center gap-3 rounded-2xl px-4 py-3" },
              createElement("span", { className: "min-w-0 flex-1 text-sm font-medium" }, safeToastMessage),
              createElement(
                "button",
                {
                  type: "button",
                  className: "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white",
                  onClick: () => {
                    toast.dismiss(toastItem.id);
                    window.location.assign(route);
                  },
                },
                replyAction.text || "Reply"
              )
            ),
          { duration: 6000, ...toastOptions }
        );
      } else {
        toast.success(safeToastMessage, {
          icon: getToastLogoIcon(),
          duration: 6000,
          ...toastOptions,
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (typeof window !== "undefined" && window.api?.showAppNotification) {
    try {
      const result = await window.api.showAppNotification({
        title: safeTitle,
        body: safeBody,
        route,
        actions,
      });
      if (result?.ok) return result;
    } catch {
      // Fall through to the Web Notification API.
    }
  }

  if (typeof window !== "undefined" && window.api?.showMotivationNotification) {
    try {
      const result = await window.api.showMotivationNotification({
        title: safeTitle,
        body: safeBody,
      });
      if (result?.ok) return result;
    } catch {
      // Fall through to the Web Notification API.
    }
  }

  if (typeof Notification !== "undefined") {
    try {
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        return { ok: false, reason: "permission_denied" };
      }
      const notification = new Notification(safeTitle, {
        body: safeBody,
        icon: getLogoAbsoluteUrl(),
        silent,
        requireInteraction: false,
      });
      if (route) {
        notification.onclick = () => {
          window.location.assign(route);
        };
      }
      return Promise.resolve({ ok: true });
    } catch {
      /* fall through */
    }
  }

  return Promise.resolve({ ok: false, reason: "unavailable" });
}
