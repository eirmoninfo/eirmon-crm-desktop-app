import { resetTrackerBootstrap } from "../../electron/electronBootstrap";

/**
 * Clear auth storage (matches keys used by login / getToken).
 */
export function clearAuthStorage() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

/**
 * Stop screenshot + idle loops and clear session. Call before navigate("/login").
 */
export function logoutSession() {
  try {
    resetTrackerBootstrap();
  } catch (e) {
    console.warn("[Tracker] reset on logout:", e);
  }
  clearAuthStorage();
}
