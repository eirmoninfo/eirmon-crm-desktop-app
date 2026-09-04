import { useEffect, useMemo, useState } from "react";
import { EIRMON_LOGO_SRC } from "../utils/appBrand";

const MANUAL_CHECK_KEY = "collabflow:update-check-manual";
const DISMISSED_VERSION_KEY = "collabflow:update-dismissed-version";
const SESSION_SNOOZE_KEY = "collabflow:update-snoozed";

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function wasManualCheck() {
  try {
    return sessionStorage.getItem(MANUAL_CHECK_KEY) === "1";
  } catch {
    return false;
  }
}

function clearManualCheck() {
  try {
    sessionStorage.removeItem(MANUAL_CHECK_KEY);
  } catch {
    /* ignore */
  }
}

function getDismissedVersion() {
  try {
    return localStorage.getItem(DISMISSED_VERSION_KEY) || "";
  } catch {
    return "";
  }
}

function setDismissedVersion(version) {
  try {
    if (version) localStorage.setItem(DISMISSED_VERSION_KEY, String(version));
    sessionStorage.setItem(SESSION_SNOOZE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function isSnoozedThisSession() {
  try {
    return sessionStorage.getItem(SESSION_SNOOZE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Call before window.api.checkForAppUpdates() so "You're up to date" can show once. */
export function markManualUpdateCheck() {
  try {
    sessionStorage.setItem(MANUAL_CHECK_KEY, "1");
  } catch {
    /* ignore */
  }
}

export default function AppUpdateOverlay() {
  const [state, setState] = useState({
    visible: false,
    status: "",
    version: "",
    percent: 0,
    transferred: 0,
    total: 0,
    message: "",
    downloadUrl: "",
  });

  useEffect(() => {
    const off = window.api?.onAppUpdaterEvent?.((event) => {
      if (!event?.type) return;
      const manual = wasManualCheck();
      const snoozed = !manual && isSnoozedThisSession();

      if (event.type === "checking") {
        if (!manual) return;
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "checking",
          message: "Checking for updates...",
        }));
        return;
      }

      if (event.type === "disabled") {
        if (!manual) return;
        clearManualCheck();
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "current",
          message: event.message || "Update checks run only in packaged builds.",
        }));
        return;
      }

      if (event.type === "not-available") {
        if (!manual) return;
        clearManualCheck();
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "current",
          version: event.version || prev.version,
          message: "You’re using the latest version.",
        }));
        return;
      }

      if (event.type === "available") {
        const isMacDmgPrompt = Boolean(event.downloadUrl);
        if (!manual && !isMacDmgPrompt) return;
        clearManualCheck();
        if (event.version && event.version === getDismissedVersion()) return;
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "available",
          version: event.version || "",
          message:
            event.message ||
            (isMacDmgPrompt
              ? `Version ${event.version || "new"} is available. Download the Mac DMG to install it.`
              : "New update found. Downloading in background..."),
          downloadUrl: event.downloadUrl || "",
        }));
        return;
      }

      if (event.type === "download-progress") {
        if (snoozed) return;
        setState((prev) => {
          if (!prev.visible) return prev;
          if (prev.version && prev.version === getDismissedVersion() && !manual) {
            return { ...prev, visible: false };
          }
          return {
            ...prev,
            visible: true,
            status: "downloading",
            percent: event.percent || 0,
            transferred: event.transferred || 0,
            total: event.total || 0,
            message: "Downloading update...",
          };
        });
        return;
      }

      if (event.type === "downloaded") {
        const version = event.version || "";
        if (!manual && (snoozed || (version && version === getDismissedVersion()))) {
          return;
        }
        if (manual) clearManualCheck();
        setState((prev) => {
          if (
            prev.visible &&
            prev.status === "ready" &&
            (prev.version || "") === version
          ) {
            return prev;
          }
          return {
            ...prev,
            visible: true,
            status: "ready",
            version: version || prev.version,
            percent: 100,
            message:
              event.message ||
              "Update downloaded. Install it now or after you finish working.",
          };
        });
        return;
      }

      if (event.type === "error") {
        if (!manual) return;
        clearManualCheck();
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "error",
          version: event.version || prev.version,
          message: event.message || "Update failed.",
          downloadUrl: event.downloadUrl || "",
        }));
      }
    });

    return () => {
      if (typeof off === "function") off();
    };
  }, []);

  const details = useMemo(() => {
    if (state.status !== "downloading") return "";
    const pct = `${Math.max(0, Math.min(100, state.percent)).toFixed(1)}%`;
    return `${pct} (${formatBytes(state.transferred)} / ${formatBytes(state.total)})`;
  }, [state.percent, state.status, state.total, state.transferred]);

  if (!state.visible) return null;

  const dismiss = () => {
    setDismissedVersion(state.version);
    setState((prev) => ({ ...prev, visible: false }));
  };

  const openDownloadPage = async () => {
    try {
      await window.api?.openLatestReleasePage?.(state.downloadUrl || undefined);
    } catch {
      /* overlay still has the message */
    }
    dismiss();
  };

  const installNow = async () => {
    setState((prev) => ({
      ...prev,
      status: "installing",
      message: "Restarting to install the update...",
    }));
    try {
      const result = await window.api?.installDownloadedUpdateNow?.();
      if (!result?.ok) {
        throw new Error(result?.error || "Could not start the installer.");
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "error",
        message: error?.message || "Could not install the update.",
        downloadUrl: /code signature|code requirement|ShipIt|did not pass validation/i.test(
          error?.message || ""
        )
          ? "https://github.com/eirmoninfo/eirmon-crm-desktop-app/releases/latest"
          : prev.downloadUrl,
      }));
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/55 p-4 backdrop-blur-md">
      <div className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-white/10 bg-[var(--theme-modal-bg,#fff)] p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img
            src={EIRMON_LOGO_SRC}
            alt=""
            className="h-10 w-10 rounded-xl object-contain ring-1 ring-slate-200/80"
          />
          <h3 className="text-lg font-semibold text-[var(--theme-text,#0f172a)]">App update</h3>
        </div>
        {state.version ? (
          <p className="mt-1 text-xs text-[var(--theme-muted,#64748b)]">Version {state.version}</p>
        ) : null}

        <p className="mt-3 text-sm text-[var(--theme-text,#334155)]">
          {/code signature|code requirement|ShipIt|did not pass validation|latest-mac\.yml|Cannot find latest-mac/i.test(state.message || "")
            ? "On Mac, download the latest DMG from GitHub Releases. In-app auto-install needs Apple Developer ID signing."
            : state.message}
        </p>

        {state.status === "downloading" ||
        state.status === "installing" ||
        state.status === "ready" ? (
          <>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{
                  width: `${
                    state.status === "ready" || state.status === "installing"
                      ? 100
                      : Math.max(0, Math.min(100, state.percent || 0))
                  }%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-[var(--theme-muted,#475569)]">
              {state.status === "installing" || state.status === "ready"
                ? "100% (download complete)"
                : details}
            </p>
          </>
        ) : null}

        {state.status === "installing" ? (
          <p className="mt-3 text-xs text-emerald-600">
            The app will restart automatically to finish installation.
          </p>
        ) : null}

        {state.status === "ready" ? (
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={dismiss} className="rounded-xl border border-slate-300/60 px-4 py-2 text-sm font-semibold text-[var(--theme-text,#334155)] hover:bg-white/10">
              Later
            </button>
            <button type="button" onClick={installNow} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Install Now
            </button>
          </div>
        ) : null}

        {state.status === "current" || state.status === "error" || state.status === "available" ? (
          <div className="mt-5 flex justify-end gap-2">
            {(state.status === "error" || state.status === "available") &&
            (state.downloadUrl ||
              /code signature|ShipIt|code requirement|latest-mac|DMG/i.test(state.message || "")) ? (
              <button
                type="button"
                onClick={openDownloadPage}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Download latest
              </button>
            ) : null}
            <button type="button" onClick={dismiss} className="rounded-xl border border-slate-300/60 px-4 py-2 text-sm font-semibold text-[var(--theme-text,#334155)] hover:bg-white/10">
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
