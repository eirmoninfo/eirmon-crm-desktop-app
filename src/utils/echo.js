import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { broadcastingAuthUrl } from "../api/api.config";

window.Pusher = Pusher;

let echoInstance = null;

/** Refresh Bearer token on Echo auth (e.g. after login). */
export function refreshEchoAuth() {
  if (!echoInstance?.connector?.pusher?.config?.auth?.headers) return;
  const token = localStorage.getItem("auth_token");
  echoInstance.connector.pusher.config.auth.headers.Authorization = token
    ? `Bearer ${token}`
    : "";
}

export const getEcho = () => {
  if (echoInstance) return echoInstance;

  const key = import.meta.env.VITE_REVERB_APP_KEY;
  const host = import.meta.env.VITE_REVERB_HOST;
  const port = Number(import.meta.env.VITE_REVERB_PORT) || 8080;
  const scheme = import.meta.env.VITE_REVERB_SCHEME || "http";

  if (!key || !host) {
    console.warn(
      "[Echo] Missing VITE_REVERB_APP_KEY or VITE_REVERB_HOST — WebSocket disabled"
    );
    return null;
  }

  const authEndpoint = broadcastingAuthUrl();
  if (!authEndpoint) {
    console.warn("[Echo] API base URL missing — cannot set broadcasting auth");
    return null;
  }

  echoInstance = new Echo({
    broadcaster: "reverb",
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === "https",
    encrypted: scheme === "https",
    enabledTransports: ["ws", "wss"],
    disableStats: true,
    authEndpoint,
    auth: {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        Accept: "application/json",
      },
    },
  });

  echoInstance.connector.pusher.connection.bind("connected", () => {
    console.log("[Echo] Connected");
    window.dispatchEvent(new CustomEvent("collabflow:echo-ready"));
  });

  echoInstance.connector.pusher.connection.bind("error", (err) => {
    console.error("[Echo] Connection error", err);
  });

  refreshEchoAuth();
  return echoInstance;
};

export function isEchoConnected() {
  try {
    return echoInstance?.connector?.pusher?.connection?.state === "connected";
  } catch {
    return false;
  }
}

/** Wait until Reverb/Pusher socket is connected (or timeout). */
export function waitForEchoConnected(timeoutMs = 8000) {
  const echo = getEcho();
  if (!echo) return Promise.resolve(false);

  const conn = echo.connector?.pusher?.connection;
  if (!conn) return Promise.resolve(false);
  if (conn.state === "connected") return Promise.resolve(true);

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const onConnected = () => {
      clearTimeout(timer);
      conn.unbind("connected", onConnected);
      resolve(true);
    };
    conn.bind("connected", onConnected);
  });
}
