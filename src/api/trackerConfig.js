import { API_BASE_URL } from "./api.config";
import { toBool, unwrapApiBody } from "../utils/unwrapApiBody";

export async function fetchTrackerConfig(token) {
  const baseUrl = API_BASE_URL || "";
  if (!baseUrl) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/tracker-settings`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch tracker config (${res.status}): ${text.slice(0, 200)}`
    );
  }

  const raw = await res.json();
  const body = unwrapApiBody(raw);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid tracker-settings payload (expected object).");
  }

  const min = Number(body.screenshot_min_interval);
  const max = Number(body.screenshot_max_interval);
  const idleMin = Number(body.idle_time_limit);

  return {
    ...body,
    screenshot_min_interval: Number.isFinite(min) && min > 0 ? min : 2,
    screenshot_max_interval: Number.isFinite(max) && max > 0 ? max : 10,
    idle_time_limit: Number.isFinite(idleMin) && idleMin > 0 ? idleMin : 2,
    enable_screenshots: toBool(body.enable_screenshots, true),
    user_screenshot_enabled: toBool(body.user_screenshot_enabled, true),
    enable_idle_tracking: toBool(body.enable_idle_tracking, true),
    enable_break_tracking: toBool(body.enable_break_tracking, true),
  };
}
