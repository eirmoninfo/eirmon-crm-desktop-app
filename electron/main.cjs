const {
  app,
  BrowserWindow,
  ipcMain,
  webContents,
  desktopCapturer,
  globalShortcut,
  nativeImage,
  systemPreferences,
  Notification,
  session,
} = require("electron");
const path = require("path");
const fs = require("fs");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

const systemIdleMonitor = require("./systemIdleMonitor.cjs");
const { listPrinters } = require("./printers-list.cjs");

/** Without this, the macOS menu bar shows "Electron" while running `electron .` in dev. */
app.setName("Erimon CRM");

function resolveAppIconPath() {
  const candidates = [
    path.join(__dirname, "..", "public", "logo.png"),
    path.join(__dirname, "..", "public", "eirmon_ai_logo.png"),
    path.join(__dirname, "..", "dist", "logo.png"),
    path.join(__dirname, "..", "dist", "eirmon_ai_logo.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function resolveAppIconNative() {
  const p = resolveAppIconPath();
  if (!p) return undefined;
  const img = nativeImage.createFromPath(p);
  return img.isEmpty() ? undefined : img;
}

const API_BASE =
  process.env.VITE_API_BASE_URL || "https://sw.eirmonsolutions.com.au/api";
const apiUrl = (p) =>
  `${String(API_BASE).replace(/\/$/, "")}${p.startsWith("/") ? p : `/${p}`}`;

const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));

let mainWindow = null;
let updaterCheckTimer = null;
let quitConfirmed = false;
let closeFlowActive = false;
let quittingViaAppMenu = false;
/** Skip punch-out prompt when auto-updater or another trusted path is quitting. */
let skipCloseGuard = false;

function startCloseFlow() {
  if (closeFlowActive || !mainWindow || mainWindow.isDestroyed()) return;
  closeFlowActive = true;
  mainWindow.webContents.send("app:close-request", {
    quitApp: quittingViaAppMenu,
  });
}

function resetCloseFlowState() {
  closeFlowActive = false;
  quittingViaAppMenu = false;
}

function attachWindowCloseGuard(win) {
  win.on("close", (event) => {
    if (quitConfirmed || skipCloseGuard) return;
    event.preventDefault();
    if (!closeFlowActive) {
      startCloseFlow();
    }
  });
}

/**
 * Register immediately so invoke never hits "No handler" while the rest of main.js loads.
 * Uses desktopCapturer first; falls back to the main BrowserWindow if getSources fails
 * (macOS Screen Recording / "Failed to get sources").
 */
function registerTakeScreenshotIpc() {
  try {
    ipcMain.removeHandler("take-screenshot");
  } catch {
    /* no previous handler */
  }
  ipcMain.handle("take-screenshot", async () => {
    if (
      process.platform === "darwin" &&
      typeof systemPreferences?.getMediaAccessStatus === "function"
    ) {
      try {
        const st = systemPreferences.getMediaAccessStatus("screen");
        if (st && st !== "granted") {
          log.info("[take-screenshot] macOS screen media status:", st);
        }
      } catch {
        /* ignore */
      }
    }

    const thumbnailSizes = [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 800, height: 600 },
    ];
    let lastErr;
    for (const thumbnailSize of thumbnailSizes) {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize,
          fetchWindowIcons: false,
        });
        const source =
          sources.find((s) => s.thumbnail && !s.thumbnail.isEmpty()) ||
          sources[0];
        if (source?.thumbnail && !source.thumbnail.isEmpty()) {
          return source.thumbnail.toPNG().toString("base64");
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const img = await mainWindow.webContents.capturePage();
        if (img && !img.isEmpty()) {
          log.warn(
            "[take-screenshot] desktopCapturer failed; using main window capturePage fallback"
          );
          return img.toPNG().toString("base64");
        }
      } catch (e) {
        lastErr = e;
      }
    }

    const hint =
      process.platform === "darwin"
        ? "Enable Screen Recording for Electron (dev) or Erimon CRM in System Settings → Privacy & Security, then fully quit and restart this app."
        : "Check OS screen / display capture permissions, then restart the app.";
    throw new Error(
      [lastErr?.message || "Screen capture failed.", hint].filter(Boolean).join(" ")
    );
  });
}

registerTakeScreenshotIpc();

function registerDesktopSourcesIpc() {
  try {
    ipcMain.removeHandler("get-desktop-sources");
  } catch {
    /* no previous handler */
  }
  ipcMain.handle("get-desktop-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 150, height: 150 },
      fetchWindowIcons: false,
    });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  });
}

registerDesktopSourcesIpc();

/**
 * Lets renderer call getDisplayMedia() without a picker — required for live screen share on Electron 17+.
 * macOS still needs Screen Recording permission for the app (System Settings → Privacy).
 */
function registerLiveScreenCaptureHandler() {
  const ses = session.defaultSession;
  if (!ses?.setDisplayMediaRequestHandler) {
    log.warn("[live-screen] setDisplayMediaRequestHandler not available");
    return;
  }

  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        if (
          process.platform === "darwin" &&
          typeof systemPreferences?.getMediaAccessStatus === "function"
        ) {
          const st = systemPreferences.getMediaAccessStatus("screen");
          if (st && st !== "granted") {
            log.warn("[live-screen] macOS screen recording status:", st);
          }
        }

        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 150, height: 150 },
          fetchWindowIcons: false,
        });

        const screen =
          sources.find((s) => /entire screen|screen 1|display/i.test(s.name)) ||
          sources[0];

        if (!screen) {
          log.error("[live-screen] No screen sources from desktopCapturer");
          callback();
          return;
        }

        log.info("[live-screen] Granting display media:", screen.name);
        callback({ video: screen });
      } catch (err) {
        log.error("[live-screen] display media handler failed:", err);
        callback();
      }
    },
    { useSystemPicker: false }
  );
}

function sendUpdaterEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("app-updater:event", payload);
}

function initAutoUpdater() {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdaterEvent({ type: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdaterEvent({
      type: "available",
      version: info?.version || "",
      releaseDate: info?.releaseDate || "",
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    sendUpdaterEvent({
      type: "not-available",
      version: info?.version || "",
    });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    const percent = Number.isFinite(progressObj?.percent)
      ? Number(progressObj.percent.toFixed(1))
      : 0;
    sendUpdaterEvent({
      type: "download-progress",
      percent,
      transferred: progressObj?.transferred || 0,
      total: progressObj?.total || 0,
      bytesPerSecond: progressObj?.bytesPerSecond || 0,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdaterEvent({
      type: "downloaded",
      version: info?.version || "",
      message: "Update downloaded. Installing now...",
    });

    setTimeout(() => {
      skipCloseGuard = true;
      quitConfirmed = true;
      autoUpdater.quitAndInstall(false, true);
    }, 2000);
  });

  autoUpdater.on("error", (error) => {
    log.error("autoUpdater error", error);
    sendUpdaterEvent({
      type: "error",
      message: error?.message || "Update failed.",
    });
  });
}

function clearUpdaterTimer() {
  if (updaterCheckTimer) {
    clearInterval(updaterCheckTimer);
    updaterCheckTimer = null;
  }
}

function checkForUpdatesSafe() {
  return autoUpdater.checkForUpdates().catch((err) => {
    log.error("checkForUpdates failed", err);
    sendUpdaterEvent({
      type: "error",
      message: err?.message || "Could not check for updates.",
    });
    throw err;
  });
}

function schedulePeriodicUpdateChecks() {
  clearUpdaterTimer();
  const EVERY_30_MIN_MS = 30 * 60 * 1000;
  updaterCheckTimer = setInterval(() => {
    checkForUpdatesSafe().catch(() => {
      /* already logged in checkForUpdatesSafe */
    });
  }, EVERY_30_MIN_MS);
}

/**
 * Browser-style print: load HTML in a hidden window and call webContents.print.
 */
function printHtmlWithSystemDialog(payload) {
  const html = payload?.html;
  if (!html || typeof html !== "string") {
    return Promise.reject(new Error("html string is required"));
  }
  const silent = payload?.silent === true;
  const deviceName =
    typeof payload?.deviceName === "string" ? payload.deviceName : "";

  return new Promise((resolve, reject) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

    const cleanup = () => {
      if (!printWin.isDestroyed()) printWin.close();
    };

    printWin.webContents.once("did-fail-load", (_e, code, desc) => {
      cleanup();
      reject(new Error(`Could not load print view: ${desc} (${code})`));
    });

    printWin.webContents.once("did-finish-load", () => {
      const opts = {
        silent,
        printBackground: true,
      };
      if (silent && deviceName) opts.deviceName = deviceName;

      printWin.webContents.print(opts, (success, failureReason) => {
        cleanup();
        if (success) resolve();
        else reject(new Error(failureReason || "Print was cancelled or failed"));
      });
    });

    printWin.loadURL(url).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

function createWindow() {
  const appIcon = resolveAppIconNative();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Erimon CRM",
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
    },
  });
  mainWindow = win;
  attachWindowCloseGuard(win);

  win.on("closed", () => {
    mainWindow = null;
    if (!quitConfirmed) {
      resetCloseFlowState();
    }
  });

  win.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle("Erimon CRM");
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
    return;
  }

  const devUrl =
    process.env.APP_URL ||
    process.env.VITE_DEV_SERVER_URL ||
    "http://localhost:5173";
  win.loadURL(devUrl);
  if (process.env.VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  registerLiveScreenCaptureHandler();

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "geolocation");
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => permission === "geolocation"
  );

  const appIcon = resolveAppIconNative();
  if (appIcon && process.platform === "darwin") {
    try {
      app.dock.setIcon(appIcon);
    } catch {
      /* ignore */
    }
    try {
      app.setAboutPanelOptions({
        applicationName: "Erimon CRM",
        applicationVersion: app.getVersion(),
        copyright: "Erimon Solutions",
      });
    } catch {
      /* ignore */
    }
  }

  createWindow();

  globalShortcut.register("CommandOrControl+Alt+I", () => {
    mainWindow?.webContents.toggleDevTools();
  });

  if (!app.isPackaged) {
    sendUpdaterEvent({
      type: "disabled",
      message: "Auto-update checks run only in packaged builds.",
    });
  } else {
    initAutoUpdater();
    checkForUpdatesSafe().catch(() => {
      /* already logged in checkForUpdatesSafe */
    });
    schedulePeriodicUpdateChecks();
  }
});

app.on("before-quit", (event) => {
  if (quitConfirmed || skipCloseGuard) return;
  event.preventDefault();
  quittingViaAppMenu = true;
  startCloseFlow();
});

app.on("will-quit", () => {
  clearUpdaterTimer();
  globalShortcut.unregisterAll();
  systemIdleMonitor.stop();
});

ipcMain.on("app:confirm-close", (_evt, payload) => {
  quitConfirmed = true;
  const quitApp = payload?.quitApp === true || quittingViaAppMenu;

  resetCloseFlowState();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }

  if (quitApp) {
    app.quit();
  }
});

ipcMain.on("app:cancel-close", () => {
  resetCloseFlowState();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

async function getWindowPrinters() {
  const allWebContents = webContents.getAllWebContents();
  const wc = allWebContents.find((w) => w.getType() === "window");
  if (!wc) throw new Error("No renderer webContents available");
  return wc.getPrintersAsync();
}

async function assertPrinterExists(printerName, transport) {
  if (!printerName || typeof printerName !== "string") {
    throw new Error("No printer selected.");
  }
  if (transport === "tcp") return;
  const printers = await getWindowPrinters();
  if (!printers.length) {
    throw new Error(
      "No printers connected. Add a printer in System Settings."
    );
  }
  const exists = printers.some((p) => p.name === printerName);
  if (!exists) {
    throw new Error(
      `Printer not found: "${printerName}". Refresh the list and try again.`
    );
  }
}

// ===============================
// System idle + break (see systemIdleMonitor.cjs)
// ===============================
ipcMain.on("idle-monitor-config", (_, payload) => {
  if (!payload || typeof payload !== "object") return;
  const { apiBaseUrl, ...rest } = payload;
  const resolveUrl =
    typeof apiBaseUrl === "string" && apiBaseUrl.trim().length > 0
      ? (p) =>
          `${String(apiBaseUrl).replace(/\/$/, "")}${
            p.startsWith("/") ? p : `/${p}`
          }`
      : apiUrl;
  systemIdleMonitor.configure({
    apiUrl: resolveUrl,
    fetch,
    ...rest,
  });
});

ipcMain.on("idle-monitor-stop", () => {
  systemIdleMonitor.stop();
});

ipcMain.on("break-state-sync", (_, active) => {
  systemIdleMonitor.syncFromRenderer(!!active);
});

ipcMain.on("break-start", (_, token) => {
  void systemIdleMonitor.handleBreakStartIPC(token);
});

ipcMain.on("break-end", (_, token) => {
  void systemIdleMonitor.handleBreakEndIPC(token);
});

ipcMain.handle("app-updater:check-now", async () => {
  if (!app.isPackaged) {
    sendUpdaterEvent({
      type: "disabled",
      message: "Auto-update checks run only in packaged builds.",
    });
    return { ok: false, disabled: true };
  }

  try {
    await checkForUpdatesSafe();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "Could not check updates." };
  }
});

ipcMain.handle("app-updater:install-now", () => {
  if (!app.isPackaged) {
    return { ok: false, disabled: true };
  }
  try {
    skipCloseGuard = true;
    quitConfirmed = true;
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "Install failed." };
  }
});

function showNativeAppNotification(payload = {}) {
  const title = String(payload?.title || "Erimon CRM").slice(0, 100);
  const bodyText = String(payload?.body || "").slice(0, 500);
  if (!Notification.isSupported()) {
    return { ok: false, reason: "not_supported" };
  }
  const iconPath = resolveAppIconPath();
  const n = new Notification({
    title,
    body: bodyText,
    ...(iconPath ? { icon: iconPath } : {}),
  });
  n.show();
  return { ok: true, icon: iconPath || null };
}

ipcMain.handle("notification:show", (_evt, payload) => {
  try {
    return showNativeAppNotification(payload);
  } catch (err) {
    log.warn("[notification:show]", err?.message || err);
    return { ok: false, error: err?.message };
  }
});

/** @deprecated use notification:show */
ipcMain.handle("notification:motivation", (_evt, payload) => {
  try {
    return showNativeAppNotification(payload);
  } catch (err) {
    log.warn("[notification:motivation]", err?.message || err);
    return { ok: false, error: err?.message };
  }
});

ipcMain.handle("printers:list", async () => {
  try {
    const printers = await getWindowPrinters();
    return { ok: true, printers: listPrinters(printers) };
  } catch (err) {
    log.error("printers:list failed", err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("receipt:print-html", async (_evt, payload) => {
  try {
    if (payload?.silent && payload?.deviceName) {
      await assertPrinterExists(payload.deviceName, payload?.transport);
    }
    await printHtmlWithSystemDialog(payload);
    log.info("[Print] HTML job finished", { silent: !!payload?.silent });
    return { ok: true, message: "Print dialog completed or silent job sent." };
  } catch (err) {
    log.error("receipt:print-html failed", err);
    return { ok: false, error: err.message };
  }
});
