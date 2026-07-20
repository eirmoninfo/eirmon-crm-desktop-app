import { captureAndUpload } from "./screenshotUploader";

let timeoutId = null;
let generation = 0;

let MIN_MINUTES = 2;
let MAX_MINUTES = 10;

function getRandomDelay() {
  const span = MAX_MINUTES - MIN_MINUTES + 1;
  const minutes =
    span <= 1
      ? MIN_MINUTES
      : MIN_MINUTES + Math.floor(Math.random() * span);
  return minutes * 60 * 1000;
}

export function startScreenshotLoop(token, config = {}) {
  stopScreenshotLoop();
  const currentGeneration = generation;

  if (!token) {
    console.warn("[Tracker] Screenshot loop: no token");
    return;
  }

  MIN_MINUTES = Math.max(1, Number(config.screenshot_min_interval) || 2);
  MAX_MINUTES = Math.max(
    MIN_MINUTES,
    Number(config.screenshot_max_interval) || MIN_MINUTES
  );

  if (config.enable_screenshots === false) {
    console.log("[Tracker] Screenshots disabled by admin");
    return;
  }

  const takeScreenshot = async () => {
    if (currentGeneration !== generation) return;
    await captureAndUpload(token);
    if (currentGeneration !== generation) return;
    timeoutId = setTimeout(takeScreenshot, getRandomDelay());
  };

  takeScreenshot();
}

export function stopScreenshotLoop() {
  generation += 1;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}
