import { getEcho, refreshEchoAuth, waitForEchoConnected } from "./echo";
import { apiRequest } from "../api/http";
import { API_BASE_URL } from "../api/api.config";

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
let subscribing = false;
const CAPTURE_TIMEOUT_MS = 15000;

function signalUrl(segment) {
  const base = (API_BASE_URL || "").replace(/\/$/, "");
  return `${base}/signal/${segment}`;
}

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
  const lines = sdp
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd());

  const skipFmtpFor = new Set();
  lines.forEach((line) => {
    const m = line.match(/^a=rtpmap:(\d+) (ulpfec|red)\//);
    if (m) skipFmtpFor.add(m[1]);
  });

  const cleaned = lines
    .filter((line) => {
      if (!line) return false;
      if (line.startsWith("a=ssrc:") || line.startsWith("a=ssrc-group:")) return false;
      if (/^a=rtpmap:\d+ (ulpfec|red)\//.test(line)) return false;
      const fmtp = line.match(/^a=fmtp:(\d+)\b/);
      if (fmtp && skipFmtpFor.has(fmtp[1])) return false;
      const rtcpFb = line.match(/^a=rtcp-fb:(\d+)\b/);
      if (rtcpFb && skipFmtpFor.has(rtcpFb[1])) return false;
      return true;
    })
    .map((line) => {
      if (!line.startsWith("m=") || skipFmtpFor.size === 0) return line;
      const parts = line.split(" ");
      if (parts.length <= 3) return line;
      const head = parts.slice(0, 3);
      const payloads = parts.slice(3).filter((pt) => !skipFmtpFor.has(pt));
      return [...head, ...payloads].join(" ");
    });

  return cleaned.join("\r\n") + "\r\n";
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

function getUserIdFromStorage() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.id ?? u?.user_id ?? null;
  } catch {
    return null;
  }
}

async function resolveUserId() {
  const fromStorage = getUserIdFromStorage();
  if (fromStorage != null) return fromStorage;
  try {
    const json = await apiRequest("/me", { method: "GET" });
    return json?.user?.id ?? json?.id ?? null;
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

function startPendingPoll(token) {
  stopPendingPoll();
  pendingPollId = setInterval(() => {
    checkPendingScreenRequest(token).catch(() => {});
  }, 3000);
}

async function checkPendingScreenRequest(token) {
  if (!token || active || starting) return;
  try {
    const data = await apiRequest("/screen/pending", { method: "GET" });
    if (data?.pending) {
      console.log("[LiveScreen] Pending screen request (HTTP fallback)");
      await startLiveScreen(token);
    }
  } catch {
    /* ignore transient errors */
  }
}

function stopLiveScreen() {
  if (!active && !pc && !screenStream) return;
  active = false;
  starting = false;
  remoteDescSet = false;
  pendingRemoteCandidates = [];

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
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture API not available in this environment");
  }

  // Electron main process handler (setDisplayMediaRequestHandler) — no picker dialog.
  try {
    return await withTimeout(
      navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 15 } },
        audio: false,
      }),
      CAPTURE_TIMEOUT_MS,
      "getDisplayMedia"
    );
  } catch (displayErr) {
    console.warn("[LiveScreen] getDisplayMedia failed:", displayErr?.message || displayErr);
  }

  // Legacy Chromium desktop capture (older Electron builds).
  if (window.api?.getDesktopSources) {
    const sources = await window.api.getDesktopSources();
    const screen =
      sources.find((s) => /entire screen|screen 1|display/i.test(s.name)) ||
      sources[0];
    if (!screen?.id) {
      throw new Error("No screen source available");
    }

    return withTimeout(
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: screen.id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 15,
          },
        },
      }),
      CAPTURE_TIMEOUT_MS,
      "getUserMedia(desktop)"
    );
  }

  throw new Error(
    "Screen capture failed. On macOS enable Screen Recording for Erimon CRM in System Settings → Privacy."
  );
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

  starting = true;
  console.log("[LiveScreen] Admin requested live view — starting WebRTC");

  try {
    screenStream = await captureScreenStream();
  } catch (e) {
    console.warn("[LiveScreen] Screen capture failed:", e?.message || e);
    starting = false;
    return;
  }

  active = true;
  remoteDescSet = false;
  pendingRemoteCandidates = [];

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  const videoTrack = screenStream.getVideoTracks()[0];
  if (videoTrack) {
    pc.addTransceiver(videoTrack, { direction: "sendonly", streams: [screenStream] });
  }

  pc.onicecandidate = (e) => {
    if (!e.candidate || !token) return;
    fetch(signalUrl("candidate"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        employee_id: userId,
        candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate,
      }),
    }).catch((err) => console.warn("[LiveScreen] ICE candidate send failed:", err));
  };

  try {
    const offer = await pc.createOffer({ iceRestart: false });
    const normalized = {
      type: offer.type,
      sdp: normalizeSdp(offer.sdp),
    };
    await pc.setLocalDescription(normalized);

    const res = await fetch(signalUrl("offer"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        employee_id: userId,
        offer: normalized,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Offer rejected (${res.status})`);
    }

    console.log("[LiveScreen] Offer sent to admin");
  } catch (e) {
    console.error("[LiveScreen] Offer failed:", e);
    stopLiveScreen();
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
  channel.listen(".screen.start", () => startLiveScreen(token));
  channel.listen("screen.start", () => startLiveScreen(token));
  channel.listen(".screen.stop", () => stopLiveScreen());
  channel.listen("screen.stop", () => stopLiveScreen());

  const onAnswer = async (e) => {
    if (!pc || !e?.answer) return;
    try {
      await pc.setRemoteDescription(toSessionDescription(e.answer));
      remoteDescSet = true;
      await flushRemoteCandidates();
      console.log("[LiveScreen] Answer applied — stream active");
    } catch (err) {
      console.warn("[LiveScreen] setRemoteDescription failed:", err);
    }
  };
  channel.listen(".webrtc.answer", onAnswer);
  channel.listen("webrtc.answer", onAnswer);

  const onCandidate = async (e) => {
    await addRemoteCandidate(e.candidate);
  };
  channel.listen(".webrtc.candidate", onCandidate);
  channel.listen("webrtc.candidate", onCandidate);
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
    if (!isReverbConfigured()) {
      console.warn(
        "[LiveScreen] Skipped: set VITE_REVERB_APP_KEY, VITE_REVERB_HOST, VITE_REVERB_PORT in .env"
      );
      return false;
    }

    const id = await resolveUserId();
    if (id == null) {
      console.warn("[LiveScreen] No user id; subscribe after /me or login with user payload");
      return false;
    }

    userId = id;
    refreshEchoAuth();

    const echo = getEcho();
    if (!echo) return false;

    const connected = await waitForEchoConnected(10000);
    if (!connected) {
      console.warn("[LiveScreen] Echo not connected yet — will retry on connect event");
      window.addEventListener(
        "collabflow:echo-ready",
        () => startLiveScreenMonitoring(token),
        { once: true }
      );
      return false;
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
      return false;
    }

    bindChannelListeners(token);
    startPendingPoll(token);
    checkPendingScreenRequest(token).catch(() => {});

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
  stopLiveScreen();

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
}
