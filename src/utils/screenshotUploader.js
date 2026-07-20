import { apiRequest } from "../api/http";
import { API_BASE_URL } from "../api/api.config";

function base64ToFile(base64, filename) {
  const cleanBase64 = base64.includes("base64,")
    ? base64.split("base64,")[1]
    : base64;

  const byteString = atob(cleanBase64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new File([ab], filename, { type: "image/png" });
}

export async function captureAndUpload(token) {
  if (!token) {
    console.warn("[Tracker] captureAndUpload: no token");
    return;
  }
  if (!window.api?.takeScreenshot) {
    console.warn("[Tracker] captureAndUpload: not in Electron");
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.log("[Tracker] Offline; screenshot skipped");
    return;
  }

  if (!API_BASE_URL) {
    console.error("[Tracker] VITE_API_BASE_URL is not set; cannot upload screenshot");
    return;
  }

  try {
    const base64 = await window.api.takeScreenshot();

    const file = base64ToFile(base64, `ss-${Date.now()}.png`);

    const formData = new FormData();
    formData.append("screenshot", file);
    formData.append("timestamp", new Date().toISOString());
    formData.append("duration", "5");

    await apiRequest("/screenshots", {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    console.error("[Tracker] Screenshot upload failed:", err);
  }
}
