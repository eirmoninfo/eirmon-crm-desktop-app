import { getEcho, refreshEchoAuth, waitForEchoConnected } from "./echo";
import { apiRequest } from "../api/http";
import { getStoredUser, getToken } from "./storage";
import { fetchWorkSessionState } from "./workSessionGate";

let channel = null;
let userId = null;
let pc = null;
let screenStream = null;
let active = false;
let starting = false;
let listening = false;
let pendingRemoteCandidates = [];
let remoteDescSet = false;
let pendingPollId = null;
let sessionWatchId = null;
let subscribing = false;
let promptInFlight = false;
let currentRequestKey = null;
let pendingPollKey = null;
let requestEpoch = 0;
let outboundStatsId = null;
const handledRequests = new Map();
const CAPTURE_TIMEOUT_MS = 15000;
const REQUEST_DEDUP_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const SESSION_WATCH_MS = 10_000;

function repairSdpNewlines(sdp) {
  if (!sdp) return sdp;
  if (sdp.includes("\\n")) sdp = sdp.replace(/\\n/g, "\n");
  if (!/\r?\n/.test(sdp) && /\s[mabcoevt]=/.test(sdp)) {
    sdp = sdp.replace(/\s+(?=[mabcoevt]=)/g, "\n");
  }
  return sdp;
}

function normalizeSdp(sdp) {
  if (!sdp || typeof sdp !== "string") return sdp;
  sdp = repairSdpNewlines(sdp);
  return sdp
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join("\r\n") + "\r\n";
}

function mainLog(level, message) {
  try {
    window.api?.logLiveScreen?.(level, message);
  } catch {
    /* renderer console remains the fallback */
  }
}

function unpackSessionDescription(desc) {
  if (!desc) return null;
  let sdp = "";
  if (desc.format === "b64" && desc.sdp_b64) {
    sdp = atob(desc.sdp_b64);
  } else if (desc.sdp_b64 && !desc.sdp) {
    sdp = atob(desc.sdp_b64);
  } else {
    sdp = desc.sdp || "";
  }
  return {
    type: desc.type || "offer",
    sdp: normalizeSdp(sdp),
  };
}

function toSessionDescription(desc) {
  const session = unpackSessionDescription(desc);
  if (!session?.sdp) return null;
  return new RTCSessionDescription(session);
}

function employeeIdFromUser(value) {
  const u = value?.user ?? value;
  return u?.employee_id ?? u?.employee?.id ?? u?.employeeId ?? u?.id ?? null;
}

async function resolveUserId() {
  const fromStorage = employeeIdFromUser(getStoredUser());
  if (fromStorage != null) return fromStorage;
  try {
    const json = await apiRequest("/me", { method: "GET" });
    return employeeIdFromUser(json);
  } catch {
    return null;
  }
}

function stopPendingPoll() {
  if (pendingPollId != null) {
    clearInterval(pendingPollId);
    pendingPollId = null;
  }
}

function stopSessionWatch() {
  if (sessionWatchId != null) {
    clearInterval(sessionWatchId);
    sessionWatchId = null;
  }
}

function startSessionWatch() {
  stopSessionWatch();
  sessionWatchId = setInterval(() => {
    enforceWorkSessionGate("poll").catch(() => {});
  }, SESSION_WATCH_MS);
}

async function enforceWorkSessionGate(source = "check") {
  try {
    const session = await fetchWorkSessionState();
    if (session.canMonitor) return true;
    if (active || starting || promptInFlight) {
      const reason = !session.punchedIn
        ? "punched out / not clocked in"
        : "on break";
      console.log(`[LiveScreen] Stopping share (${reason}, ${source})`);
      stopLiveScreen();
    }
    return false;
  } catch (e) {
    console.warn("[LiveScreen] Session gate check failed:", e?.message || e);
    return true;
  }
}

function handleAttendanceChanged() {
  enforceWorkSessionGate("attendance-changed").catch(() => {});
}

function startPendingPoll(token) {
  stopPendingPoll();
  pendingPollId = setInterval(() => {
    checkPendingScreenRequest(token).catch(() => {});
  }, POLL_INTERVAL_MS);
}

async function checkPendingScreenRequest(token) {
  if (!token || getToken() !== token) return;
  if (active || starting || promptInFlight) return;
  if (!(await enforceWorkSessionGate("pending-poll"))) return;
  try {
    const data = await apiRequest("/screen/pending", { method: "GET" });
    const payload = data?.data ?? data;
    if (payload?.pending) {
      const request = payload.request ?? payload;
      const key = requestKey(request);
      pendingPollKey = key;
      await receiveScreenRequest(request, token, "polling");
    } else {
      if (pendingPollKey) handledRequests.delete(pendingPollKey);
      pendingPollKey = null;
    }
  } catch (error) {
    console.warn("[LiveScreen] Pending request poll failed:", error?.message || error);
  }
}

function requestKey(request = {}) {
  const id = request.request_id ?? request.session_id ?? request.id;
  return id != null ? String(id) : "pending";
}

function isDuplicateRequest(key) {
  const now = Date.now();
  for (const [savedKey, time] of handledRequests) {
    if (now - time > REQUEST_DEDUP_MS) handledRequests.delete(savedKey);
  }
  return currentRequestKey === key || handledRequests.has(key);
}

async function receiveScreenRequest(request, token, source) {
  const key = requestKey(request);
  if (active || starting || promptInFlight || isDuplicateRequest(key)) {
    console.log(`[LiveScreen] Duplicate request ignored (${source}, ${key})`);
    return;
  }

  if (!(await enforceWorkSessionGate(source))) {
    console.log(
      `[LiveScreen] Ignoring live request (${source}, ${key}) — not punched in or on break`
    );
    handledRequests.delete(key);
    return;
  }

  handledRequests.set(key, Date.now());
  promptInFlight = true;
  const epoch = requestEpoch;
  const autoStart =
    request?.auto_start !== false && request?.require_consent !== true;
  console.log(
    `[LiveScreen] Request received (${source}, ${key}) — ${autoStart ? "auto-start" : "consent required"}`
  );
  try {
    if (!autoStart && typeof window.api?.promptLiveScreenAccess === "function") {
      const consent = await window.api.promptLiveScreenAccess();
      if (epoch !== requestEpoch) return;
      if (!consent?.accepted) {
        console.log("[LiveScreen] Employee declined screen sharing");
        return;
      }
    }
    if (epoch !== requestEpoch) {
      console.log("[LiveScreen] Request was stopped before capture started");
      return;
    }
    if (!(await enforceWorkSessionGate(source))) {
      console.log(`[LiveScreen] Session ended before capture (${source}, ${key})`);
      return;
    }
    currentRequestKey = key;
    await startLiveScreen(token);
  } finally {
    promptInFlight = false;
  }
}

function stopLiveScreen() {
  requestEpoch += 1;
  active = false;
  starting = false;
  remoteDescSet = false;
  pendingRemoteCandidates = [];
  if (outboundStatsId != null) {
    clearInterval(outboundStatsId);
    outboundStatsId = null;
  }

  try {
    screenStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  try {
    pc?.close();
  } catch {
    /* ignore */
  }
  screenStream = null;
  pc = null;
  currentRequestKey = null;
  console.log("[LiveScreen] Stopped");
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function captureScreenStream() {
  if (!navigator.mediaDevices) throw new Error("Screen capture is not available.");
  const selection = await window.api.selectLiveScreenSource();
  console.log(`[LiveScreen] Screen-recording permission result: ${selection?.permission || "unknown"}`);
  if (selection?.cancelled) throw new Error(
    selection.permission === "denied"
      ? "Screen Recording permission is denied. Enable Eirmon One in System Settings → Privacy & Security → Screen Recording, then restart the app."
      : "No display was selected."
  );
  if (!selection?.source?.id) throw new Error("No display is available to share.");

  if (navigator.mediaDevices.getDisplayMedia) {
    try {
      return await withTimeout(navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 15 } },
        audio: false,
      }), CAPTURE_TIMEOUT_MS, "getDisplayMedia");
    } catch (error) {
      console.warn("[LiveScreen] getDisplayMedia failed; trying desktop fallback:", error?.message || error);
      if (!navigator.mediaDevices.getUserMedia) throw error;
    }
  }

  if (!navigator.mediaDevices.getUserMedia) throw new Error("Screen capture is not available.");
  return withTimeout(navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: selection.source.id,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 15,
      } },
    }), CAPTURE_TIMEOUT_MS, "desktop capture fallback");
}

async function flushRemoteCandidates() {
  if (!pc || !remoteDescSet) return;
  for (const candidate of pendingRemoteCandidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("[LiveScreen] addIceCandidate failed:", err);
    }
  }
  pendingRemoteCandidates = [];
}

async function addRemoteCandidate(candidate) {
  if (!pc || !candidate) return;
  if (!remoteDescSet) {
    pendingRemoteCandidates.push(candidate);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn("[LiveScreen] addIceCandidate failed:", err);
  }
}

async function startLiveScreen(token) {
  if (!token || active || starting) return;

  if (!(await enforceWorkSessionGate("start"))) {
    console.log("[LiveScreen] Share blocked — punched out or on break");
    currentRequestKey = null;
    return;
  }

  starting = true;
  console.log("[LiveScreen] Admin requested live view — starting WebRTC");

  try {
    screenStream = await captureScreenStream();
  } catch (e) {
    const message = e?.message || String(e);
    console.warn("[LiveScreen] Screen capture failed:", message);
    starting = false;
    const result = await window.api.showLiveScreenError(message);
    if (result?.retry) {
      console.log("[LiveScreen] Employee requested capture retry");
      await startLiveScreen(token);
    } else {
      currentRequestKey = null;
    }
    return;
  }

  active = true;
  remoteDescSet = false;
  pendingRemoteCandidates = [];

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  pc.oniceconnectionstatechange = () => {
    const state = pc?.iceConnectionState || "closed";
    console.log(`[LiveScreen] ICE state: ${state}`);
    mainLog("info", `ICE state: ${state}`);
    if (pc && ["failed", "closed"].includes(pc.iceConnectionState)) stopLiveScreen();
    if (pc && ["connected", "completed"].includes(pc.iceConnectionState) && outboundStatsId == null) {
      outboundStatsId = setInterval(() => {
        pc?.getStats().then((stats) => {
          for (const report of stats.values()) {
            if (report.type === "outbound-rtp" && report.kind === "video") {
              mainLog("info", `Outbound video bytes=${report.bytesSent || 0}, frames=${report.framesEncoded || report.framesSent || 0}`);
            }
          }
        }).catch(() => {});
      }, 3000);
    }
  };

  const videoTrack = screenStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.contentHint = "detail";
    try {
      await videoTrack.applyConstraints({
        width: { max: 1920 },
        height: { max: 1080 },
        frameRate: { ideal: 10, max: 10 },
      });
    } catch (error) {
      console.warn("[LiveScreen] Capture downscale constraint was not applied:", error);
    }
    mainLog("info", `Captured track readyState=${videoTrack.readyState}, muted=${videoTrack.muted}, settings=${JSON.stringify(videoTrack.getSettings?.() || {})}`);
    videoTrack.addEventListener("ended", () => {
      console.log("[LiveScreen] Employee or OS ended screen capture");
      stopLiveScreen();
    }, { once: true });
    const sender = pc.addTrack(videoTrack, screenStream);
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = 3_000_000;
      params.encodings[0].maxFramerate = 10;
      params.degradationPreference = "maintain-resolution";
      await sender.setParameters(params);
    } catch (error) {
      console.warn("[LiveScreen] Sender encoding parameters were not applied:", error);
    }
  }

  pc.onicecandidate = (e) => {
    if (!e.candidate || !token) return;
    apiRequest("/signal/candidate", {
      method: "POST",
      body: {
        employee_id: userId,
        candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate,
      },
    }).catch((err) => console.warn("[LiveScreen] ICE candidate send failed:", err));
  };

  try {
    const offer = await pc.createOffer({ iceRestart: false });
    const normalized = {
      type: offer.type,
      sdp: normalizeSdp(offer.sdp),
    };
    await pc.setLocalDescription(normalized);

    await apiRequest("/signal/offer", {
      method: "POST",
      body: {
        employee_id: userId,
        offer: normalized,
      },
    });

    console.log("[LiveScreen] Offer sent to admin");
    mainLog("info", `Offer sent for employee ${userId}`);
  } catch (e) {
    console.error("[LiveScreen] Offer failed:", e);
    const message = e?.message || String(e);
    mainLog("error", `Offer/signaling failed for employee ${userId}: ${message}`);
    stopLiveScreen();
    const result = await window.api.showLiveScreenError(`The screen was captured, but signaling failed: ${message}`);
    if (result?.retry) await startLiveScreen(token);
  } finally {
    starting = false;
  }
}

function isReverbConfigured() {
  return Boolean(
    import.meta.env.VITE_REVERB_APP_KEY && import.meta.env.VITE_REVERB_HOST
  );
}

function bindChannelListeners(token) {
  channel.listen(".screen.start", (event) => receiveScreenRequest(event, token, "WebSocket"));
  channel.listen(".screen.stop", () => stopLiveScreen());

  const onAnswer = async (e) => {
    if (!pc || !e?.answer) return;
    try {
      await pc.setRemoteDescription(toSessionDescription(e.answer));
      remoteDescSet = true;
      await flushRemoteCandidates();
      console.log("[LiveScreen] WebRTC answer received and applied");
      mainLog("info", `WebRTC answer received for employee ${userId}`);
    } catch (err) {
      console.warn("[LiveScreen] setRemoteDescription failed:", err);
    }
  };
  channel.listen(".webrtc.answer", onAnswer);

  const onCandidate = async (e) => {
    await addRemoteCandidate(e.candidate);
  };
  channel.listen(".webrtc.candidate", onCandidate);
}

/**
 * Subscribes to admin-driven WebRTC live screen (Echo private channel).
 * Returns true when subscribed; false when skipped or failed.
 */
export async function startLiveScreenMonitoring(token) {
  if (!token || !window.api) {
    console.warn("[LiveScreen] Skipped: Electron + auth token required");
    return false;
  }
  if (listening) return true;
  if (subscribing) return false;
  subscribing = true;
  try {
    const id = await resolveUserId();
    if (id == null) {
      console.warn("[LiveScreen] No user id; subscribe after /me or login with user payload");
      return false;
    }

    userId = id;
    if (getToken() !== token) {
      console.warn("[LiveScreen] Auth session changed before monitoring started");
      return false;
    }
    startPendingPoll(token);
    startSessionWatch();
    if (typeof window !== "undefined") {
      window.addEventListener(
        "collabflow:attendance-changed",
        handleAttendanceChanged
      );
    }
    checkPendingScreenRequest(token).catch(() => {});

    if (!isReverbConfigured()) {
      console.warn(
        "[LiveScreen] Reverb is not configured; 2-second polling fallback is active"
      );
      return true;
    }
    refreshEchoAuth();

    const echo = getEcho();
    if (!echo) return true;

    const connected = await waitForEchoConnected(10000);
    if (!connected) {
      console.warn("[LiveScreen] Echo not connected yet — will retry on connect event");
      window.addEventListener(
        "collabflow:echo-ready",
        () => startLiveScreenMonitoring(token),
        { once: true }
      );
      console.warn("[LiveScreen] WebSocket disabled; polling fallback remains active");
      return true;
    }

    const channelName = `screen.${userId}`;
    channel = echo.private(channelName);

    const subscribed = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!listening) {
          console.error("[LiveScreen] Channel subscribe timed out");
          resolve(false);
        }
      }, 12000);

      channel.subscribed(() => {
        clearTimeout(timeout);
        listening = true;
        console.log(`[LiveScreen] Subscribed to ${channelName}`);
        resolve(true);
      });
      channel.error((err) => {
        clearTimeout(timeout);
        console.error("[LiveScreen] channel auth error", err);
        resolve(false);
      });
    });

    if (!subscribed) {
      channel = null;
      console.warn("[LiveScreen] WebSocket subscription failed; polling fallback remains active");
      return true;
    }

    bindChannelListeners(token);
    console.log(`[LiveScreen] Listening on private ${channelName}`);
    return true;
  } finally {
    subscribing = false;
  }
}

export function stopLiveScreenMonitoring() {
  listening = false;
  subscribing = false;
  stopPendingPoll();
  stopSessionWatch();
  stopLiveScreen();

  if (typeof window !== "undefined") {
    window.removeEventListener(
      "collabflow:attendance-changed",
      handleAttendanceChanged
    );
  }

  if (channel && userId != null) {
    try {
      const echo = getEcho();
      if (echo) {
        echo.leave(`screen.${userId}`);
      }
    } catch (e) {
      console.warn("[LiveScreen] leave channel:", e);
    }
  }

  channel = null;
  userId = null;
  promptInFlight = false;
  currentRequestKey = null;
  pendingPollKey = null;
  handledRequests.clear();
}
