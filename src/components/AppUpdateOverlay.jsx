import { useEffect, useMemo, useState } from "react";
import { EIRMON_LOGO_SRC } from "../utils/appBrand";

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

export default function AppUpdateOverlay() {
  const [state, setState] = useState({
    visible: false,
    status: "",
    version: "",
    percent: 0,
    transferred: 0,
    total: 0,
    message: "",
  });

  useEffect(() => {
    const off = window.api?.onAppUpdaterEvent?.((event) => {
      if (!event?.type) return;

      if (event.type === "checking") {
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "checking",
          message: "Checking for updates...",
        }));
        return;
      }

      if (event.type === "available") {
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "available",
          version: event.version || "",
          message: "New update found. Downloading in background...",
        }));
        return;
      }

      if (event.type === "download-progress") {
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "downloading",
          percent: event.percent || 0,
          transferred: event.transferred || 0,
          total: event.total || 0,
          message: "Downloading update...",
        }));
        return;
      }

      if (event.type === "downloaded") {
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "ready",
          version: event.version || prev.version,
          percent: 100,
          message:
            event.message ||
            "Update downloaded. Install it now or after you finish working.",
        }));
        return;
      }

      if (event.type === "not-available") {
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "current",
          version: event.version || prev.version,
          message: "You’re using the latest version.",
        }));
        return;
      }

      if (event.type === "error") {
        setState((prev) => ({
          ...prev,
          visible: true,
          status: "error",
          message: event.message || "Update failed.",
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
      }));
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/45 p-4 backdrop-blur-[1px]">
      <div className="mx-auto mt-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <img
            src={EIRMON_LOGO_SRC}
            alt=""
            className="h-10 w-10 rounded-xl object-contain ring-1 ring-slate-200/80"
          />
          <h3 className="text-lg font-semibold text-slate-900">App update</h3>
        </div>
        {state.version ? (
          <p className="mt-1 text-xs text-slate-500">Version {state.version}</p>
        ) : null}

        <p className="mt-3 text-sm text-slate-700">{state.message}</p>

        {state.status === "downloading" ||
        state.status === "installing" ||
        state.status === "ready" ? (
          <>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
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
            <p className="mt-2 text-xs font-medium text-slate-600">
              {state.status === "installing" || state.status === "ready"
                ? "100% (download complete)"
                : details}
            </p>
          </>
        ) : null}

        {state.status === "installing" ? (
          <p className="mt-3 text-xs text-emerald-700">
            The app will restart automatically to finish installation.
          </p>
        ) : null}

        {state.status === "ready" ? (
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                setState((prev) => ({ ...prev, visible: false }))
              }
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Later
            </button>
            <button
              type="button"
              onClick={installNow}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Install Now
            </button>
          </div>
        ) : null}

        {state.status === "current" || state.status === "error" ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() =>
                setState((prev) => ({ ...prev, visible: false }))
              }
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
