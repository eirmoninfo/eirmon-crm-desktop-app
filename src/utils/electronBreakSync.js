/**
 * Keeps Electron main-process break state in sync with the server/UI.
 * Auto-idle break uses main's `breakActive`; manual breaks use `apiRequest` only,
 * so main must be told the real break state.
 */
export function syncElectronBreakState(hasActiveBreak) {
  if (
    typeof window !== "undefined" &&
    typeof window.api?.syncBreakState === "function"
  ) {
    window.api.syncBreakState(!!hasActiveBreak);
  }
}
