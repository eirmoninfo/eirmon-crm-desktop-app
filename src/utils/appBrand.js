import { createElement } from "react";

/** Build a URL for files in `public/` that works in dev and Electron (`base: "./"`). */
export function publicAssetUrl(assetPath) {
  const base = import.meta.env.BASE_URL || "./";
  const file = String(assetPath).replace(/^\//, "");
  if (base === "./") return `./${file}`;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${file}`;
}

/** Primary CRM mark — `public/eirmon_ai_logo.png`. */
export const ERIMON_LOGO_SRC = publicAssetUrl("eirmon_ai_logo.png");

/** Fallback when AI logo is missing — `public/logo.png`. */
export const ERIMON_LOGO_FALLBACK_SRC = publicAssetUrl("logo.png");

/** Absolute URL for browser `Notification` API and external references. */
export function getLogoAbsoluteUrl() {
  if (typeof window === "undefined") return ERIMON_LOGO_SRC;
  try {
    return new URL(ERIMON_LOGO_SRC, window.location.href).href;
  } catch {
    return ERIMON_LOGO_SRC;
  }
}

/**
 * React node for react-hot-toast `icon` (URL strings render as plain text).
 */
export function getToastLogoIcon() {
  return createElement("img", {
    src: ERIMON_LOGO_SRC,
    alt: "",
    "aria-hidden": true,
    className: "erimon-toast-logo",
    width: 20,
    height: 20,
    onError: (e) => {
      const el = e?.currentTarget;
      if (!el) return;
      if (!el.dataset.fallback) {
        el.dataset.fallback = "1";
        el.src = ERIMON_LOGO_FALLBACK_SRC;
      }
    },
  });
}
