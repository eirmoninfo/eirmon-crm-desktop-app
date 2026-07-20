const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Screenshot
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),

  /** Screen sources for live WebRTC share (no picker). */
  getDesktopSources: () => ipcRenderer.invoke("get-desktop-sources"),

  // Break actions
  breakStart: (token) => {
    console.log("📤 Renderer → break-start");
    ipcRenderer.send("break-start", token);
  },

  breakEnd: (token) => {
    console.log("📤 Renderer → break-end");
    ipcRenderer.send("break-end", token);
  },

  // Break sync
  syncBreakState: (hasActiveBreak) =>
    ipcRenderer.send("break-state-sync", hasActiveBreak),

  // Idle monitor
  configureIdleMonitor: (payload) =>
    ipcRenderer.send("idle-monitor-config", payload),

  clearIdleMonitor: () => ipcRenderer.send("idle-monitor-stop"),

  /** System print: hidden BrowserWindow + webContents.print (OS dialog unless silent). */
  listPrinters: () => ipcRenderer.invoke("printers:list"),
  printHtmlReceipt: (payload) => ipcRenderer.invoke("receipt:print-html", payload),

  /** Auto-updater controls (packaged builds only). */
  checkForAppUpdates: () => ipcRenderer.invoke("app-updater:check-now"),
  installDownloadedUpdateNow: () => ipcRenderer.invoke("app-updater:install-now"),

  /** OS notification with app logo (main process). */
  showAppNotification: (payload) =>
    ipcRenderer.invoke("notification:show", payload),

  /** @deprecated use showAppNotification */
  showMotivationNotification: (payload) =>
    ipcRenderer.invoke("notification:show", payload),

  // App auto-updater events from main process.
  onAppUpdaterEvent: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("app-updater:event", handler);
    return () => ipcRenderer.removeListener("app-updater:event", handler);
  },

  /** Close flow: main asks renderer before quitting (punch-out warning). */
  onAppCloseRequest: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("app:close-request", handler);
    return () => ipcRenderer.removeListener("app:close-request", handler);
  },

  confirmAppClose: (payload) => ipcRenderer.send("app:confirm-close", payload),

  cancelAppClose: () => ipcRenderer.send("app:cancel-close"),
});