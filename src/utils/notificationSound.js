/**
 * Soft two-note chime for desktop notifications (Web Audio).
 */
let audioCtx = null;
let unlocked = false;

function getCtx() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

export function unlockNotificationSound() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  unlocked = true;
}

if (typeof window !== "undefined") {
  ["pointerdown", "keydown", "touchstart"].forEach((evt) => {
    window.addEventListener(evt, unlockNotificationSound, {
      once: true,
      passive: true,
    });
  });
}

export function playNotificationSound({ volume = 0.28 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const vol = Math.min(1, Math.max(0, volume));
  const now = ctx.currentTime;
  const notes = [880, 1174.7];

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    const start = now + i * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.32);
  });

  if (!unlocked) unlocked = true;
}
