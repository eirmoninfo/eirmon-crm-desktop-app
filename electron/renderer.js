/**
 * Legacy scratch file — not loaded by the app (entry is src/main.jsx).
 * Live screen WebRTC + Echo lives in src/utils/liveScreenMonitoring.js (see electronBootstrap).
 */
import Echo from "laravel-echo";
import Pusher from "pusher-js";

import { startIdleTracking } from "../src/utils/idleTracker";
import { startScreenshotLoop } from "../src/utils/startScreenshotLoop";
import { fetchTrackerConfig } from "../src/api/trackerConfig";

window.Pusher = Pusher;

const API_URL = "https://sw.eirmonsolutions.com.au";
const TOKEN = localStorage.getItem("auth_token");
const USER_ID = Number(localStorage.getItem("user_id"));

/* ===============================
   LARAVEL REVERB (CORRECT)
================================ */
const echo = new Echo({
  broadcaster: "reverb",
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: import.meta.env.VITE_REVERB_HOST,
  wsPort: import.meta.env.VITE_REVERB_PORT,
  wssPort: import.meta.env.VITE_REVERB_PORT,
  forceTLS: import.meta.env.VITE_REVERB_SCHEME === "https",
  enabledTransports: ["ws", "wss"],
  authEndpoint: `${API_URL}/broadcasting/auth`,
  auth: {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  },
});

/* ===============================
   WEBRTC
================================ */
let pc = null;
let screenStream = null;

async function startLiveScreen() {
  console.log("🟢 ADMIN STARTED LIVE VIEW");

  screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 15 },
    audio: false,
  });

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  screenStream.getTracks().forEach(track =>
    pc.addTrack(track, screenStream)
  );

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      fetch(`${API_URL}/api/signal/candidate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          employee_id: USER_ID,
          candidate: e.candidate,
        }),
      });
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await fetch(`${API_URL}/api/signal/offer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      employee_id: USER_ID,
      offer,
    }),
  });
}

function stopLiveScreen() {
  console.log("🔴 ADMIN STOPPED LIVE VIEW");

  screenStream?.getTracks().forEach(t => t.stop());
  pc?.close();

  screenStream = null;
  pc = null;
}

/* ===============================
   WEBSOCKET EVENTS
================================ */
echo.private(`screen.${USER_ID}`)
  .listen(".screen.start", startLiveScreen)
  .listen(".screen.stop", stopLiveScreen)
  .listen(".webrtc.answer", async (e) => {
    if (pc) {
      await pc.setRemoteDescription(
        new RTCSessionDescription(e.answer)
      );
    }
  })
  .listen(".webrtc.candidate", async (e) => {
    if (pc) {
      await pc.addIceCandidate(
        new RTCIceCandidate(e.candidate)
      );
    }
  });

/* ===============================
   TRACKER BOOTSTRAP
================================ */
let started = false;

export async function bootstrapElectron() {
  if (started) return;
  started = true;

  const config = await fetchTrackerConfig(TOKEN);

  startIdleTracking(config, TOKEN);

  startScreenshotLoop(TOKEN, {
    screenshot_min_interval: config.screenshot_min_interval,
    screenshot_max_interval: config.screenshot_max_interval,
    enable_screenshots: config.enable_screenshots,
  });

  console.log("✅ Tracker + Live screen ready");
}
