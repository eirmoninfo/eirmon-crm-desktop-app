import { toast } from "react-hot-toast";
import { getToastLogoIcon } from "./appBrand";
import { showAppNotification } from "./appNotification";
import { getEcho } from "./echo";
import { getToken } from "./storage";
import { postMotivationGenerate } from "../api/motivation.api";
import { unwrapApiBody } from "./unwrapApiBody";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 24;
const DEFERRED_FALLBACK_MS = 15_000;
const DASHBOARD_THROTTLE_MS = 60 * 60 * 1000;
const PRODUCTIVITY_DEBOUNCE_MS = 45_000;

const callTimestamps = [];

let motivationChannel = null;
let motivationUserId = null;
let deferredFallbackTimer = null;
let productivityDebounceTimer = null;
let lastProductivityPayload = null;

function pruneRateWindow() {
  const now = Date.now();
  while (callTimestamps.length && now - callTimestamps[0] > RATE_WINDOW_MS) {
    callTimestamps.shift();
  }
}

export function motivationRateLimitOk() {
  pruneRateWindow();
  return callTimestamps.length < RATE_MAX;
}

function recordMotivationCall() {
  callTimestamps.push(Date.now());
}

export function clearMotivationDeferredFallback() {
  if (deferredFallbackTimer) {
    clearTimeout(deferredFallbackTimer);
    deferredFallbackTimer = null;
  }
}

function scheduleDeferredFallback() {
  clearMotivationDeferredFallback();
  deferredFallbackTimer = setTimeout(() => {
    deferredFallbackTimer = null;
    toast("We'll show your next win soon.", {
      icon: getToastLogoIcon(),
      duration: 5000,
    });
  }, DEFERRED_FALLBACK_MS);
}

function readStoredUserId() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.id ?? u?.user_id ?? u?.user?.id ?? null;
  } catch {
    return null;
  }
}

function readEmployeeName() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "there";
    const u = JSON.parse(raw);
    const profile = u?.user ?? u;
    const name = profile?.name;
    return typeof name === "string" && name.trim() ? name.trim().split(/\s+/)[0] : "there";
  } catch {
    return "there";
  }
}

/** @param {Date} d */
export function formatDayOfWeekEnglish(d) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d);
}

/** @param {Date} d */
export function formatHHmm24(d) {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * @param {Date} punchDate
 * @param {string} shiftHHmm "HH:mm"
 */
export function computeEarlyMinutes(punchDate, shiftHHmm) {
  const parts = String(shiftHHmm || "09:00").split(":");
  const sh = Number(parts[0]);
  const sm = Number(parts[1]);
  if (!Number.isFinite(sh) || !Number.isFinite(sm)) return 0;

  const shiftStart = new Date(punchDate);
  shiftStart.setHours(sh, sm, 0, 0);

  const diffMin = Math.floor((shiftStart.getTime() - punchDate.getTime()) / 60000);
  return diffMin > 0 ? diffMin : 0;
}

function clampEarlyMinutes(n) {
  const v = Math.floor(Number(n) || 0);
  return Math.min(720, Math.max(0, v));
}

function clampStreakDays(n) {
  const v = Math.floor(Number(n) || 0);
  return Math.min(3650, Math.max(0, v));
}

function clampProductivityScore(n) {
  const v = Math.round(Number(n) || 0);
  return Math.min(100, Math.max(0, v));
}

let lastMotivationDedupeKey = "";
let lastMotivationDedupeAt = 0;

/**
 * Build request body (required + optional). Does not log tokens or raw HR payloads.
 * Required: employee_name, early_minutes, streak_days, productivity_score, day_of_week.
 * Optional: shift_start_time, punch_in_time, weather, defer, broadcast, subject_user_id, …
 */
export function buildMotivationRequestBody({
  punchAt = new Date(),
  attendance = {},
  extras = {},
}) {
  const att = attendance && typeof attendance === "object" ? attendance : {};
  const shiftRaw =
    att.shift_start ??
    att.expected_start ??
    att.scheduled_start ??
    att.shift_start_time ??
    null;
  let shiftHHmm = null;
  if (typeof shiftRaw === "string" && /^\d{1,2}:\d{2}/.test(shiftRaw)) {
    const [hh, mm] = shiftRaw.split(":");
    shiftHHmm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  const punch = punchAt instanceof Date ? punchAt : new Date(punchAt);
  const earlyRaw = computeEarlyMinutes(punch, shiftHHmm || "09:00");

  const streakSrc =
    extras.streak_days ??
    att.streak_days ??
    att.attendance_streak ??
    0;
  const scoreSrc =
    extras.productivity_score ??
    att.productivity_score ??
    att.productivity ??
    75;

  const merged = {
    employee_name: readEmployeeName(),
    early_minutes: clampEarlyMinutes(earlyRaw),
    streak_days: clampStreakDays(streakSrc),
    productivity_score: clampProductivityScore(scoreSrc),
    day_of_week: formatDayOfWeekEnglish(punch),
    ...extras,
  };

  if (shiftHHmm != null) {
    merged.shift_start_time = shiftHHmm;
  }

  if (merged.punch_in_time == null || merged.punch_in_time === "") {
    merged.punch_in_time = formatHHmm24(punch);
  }

  const en = String(merged.employee_name || "").trim();
  merged.employee_name = en
    ? en.split(/\s+/)[0]
    : readEmployeeName();

  merged.early_minutes = clampEarlyMinutes(merged.early_minutes);
  merged.streak_days = clampStreakDays(merged.streak_days);
  merged.productivity_score = clampProductivityScore(merged.productivity_score);

  if (merged.weather === undefined) {
    delete merged.weather;
  }

  return merged;
}

const MESSAGE_DISPLAY_MAX = 120;
const TITLE_DISPLAY_MAX = 100;

function deliverMotivationNotification(notification) {
  const title = String(notification?.title || "Eirmon CRM").slice(
    0,
    TITLE_DISPLAY_MAX
  );
  const message = String(notification?.message || "").slice(
    0,
    MESSAGE_DISPLAY_MAX
  );

  const dedupeKey = `${title}|${message}`;
  const now = Date.now();
  if (
    dedupeKey === lastMotivationDedupeKey &&
    now - lastMotivationDedupeAt < 2000
  ) {
    return;
  }
  lastMotivationDedupeKey = dedupeKey;
  lastMotivationDedupeAt = now;

  toast.success(`${title} — ${message}`, {
    duration: 6500,
    icon: getToastLogoIcon(),
  });

  showAppNotification({ title, body: message }).catch(() => {});
}

function handleMotivationEventPayload(raw) {
  const notification = raw?.notification ?? raw;
  if (!notification?.message && !notification?.title) return;
  clearMotivationDeferredFallback();
  deliverMotivationNotification(notification);
}

function isReverbConfigured() {
  return Boolean(
    import.meta.env.VITE_REVERB_APP_KEY && import.meta.env.VITE_REVERB_HOST
  );
}

/**
 * Subscribe to private-user.{id} for deferred / push motivation events.
 */
export function startMotivationNotificationListener() {
  const token = getToken();
  if (!token) return;

  stopMotivationNotificationListener();

  if (!isReverbConfigured()) {
    console.warn(
      "[Motivation] Echo/Reverb not configured — only sync HTTP responses will show"
    );
    return;
  }

  const id = readStoredUserId();
  if (id == null) {
    console.warn("[Motivation] No user id in storage; skip Echo subscribe");
    return;
  }

  const echo = getEcho();
  if (!echo) return;

  motivationUserId = id;
  const channelName = `user.${id}`;
  motivationChannel = echo.private(channelName);

  const onMotivationEvent = (e) => handleMotivationEventPayload(e);
  motivationChannel.listen(".MotivationNotificationGenerated", onMotivationEvent);
  motivationChannel.listen("MotivationNotificationGenerated", onMotivationEvent);

  console.log(`[Motivation] Subscribed private ${channelName}`);
}

export function stopMotivationNotificationListener() {
  clearMotivationDeferredFallback();

  if (motivationChannel != null && motivationUserId != null) {
    try {
      const echo = getEcho();
      if (echo) {
        echo.leave(`user.${motivationUserId}`);
      }
    } catch (e) {
      console.warn("[Motivation] leave channel:", e?.message || e);
    }
  }

  motivationChannel = null;
  motivationUserId = null;
}

async function runGenerate(body, { defer = false, broadcast } = {}) {
  if (!motivationRateLimitOk()) {
    console.warn("[Motivation] Rate limit (~24/min) — skipping request");
    return;
  }

  const payload = { ...body };
  if (defer) payload.defer = true;
  if (broadcast === false) payload.broadcast = false;

  recordMotivationCall();

  try {
    const result = await postMotivationGenerate(payload);

    if (result.kind === "queued") {
      scheduleDeferredFallback();
      return;
    }

    clearMotivationDeferredFallback();

    const data = result.data;
    const n = data?.notification;
    if (n && (n.title || n.message)) {
      deliverMotivationNotification(n);
    }
  } catch (err) {
    const status = err?.status;
    if (status === 422 && err?.errors) {
      console.warn("[Motivation] Validation:", err.message);
      return;
    }
    if (status === 401 || status === 403) {
      console.warn("[Motivation] Not allowed or session expired");
      return;
    }
    console.warn("[Motivation] Request failed:", err?.message || err);
  }
}

/**
 * After successful check-in (debounce + rate limit).
 */
export function requestMotivationAfterCheckIn({
  punchAt,
  attendance,
  extras,
} = {}) {
  const body = buildMotivationRequestBody({
    punchAt: punchAt || new Date(),
    attendance: attendance || {},
    extras: extras || {},
  });

  void runGenerate(body, { defer: false });
}

const SESSION_DASH_KEY = "motivation_dashboard_last_ts";

/**
 * Throttled motivation nudge when opening dashboard (once per hour per session).
 */
export function maybeMotivationOnDashboardOpen(attendance) {
  if (!getToken()) return;

  const now = Date.now();
  const last = Number(sessionStorage.getItem(SESSION_DASH_KEY) || 0);
  if (now - last < DASHBOARD_THROTTLE_MS) return;

  if (!motivationRateLimitOk()) return;

  const att = unwrapApiBody(attendance) || attendance;
  if (!att?.check_in || att.check_out) return;

  sessionStorage.setItem(SESSION_DASH_KEY, String(now));

  const punchAt = new Date(att.check_in);
  const body = buildMotivationRequestBody({
    punchAt,
    attendance: att,
    extras: {},
  });

  void runGenerate(body, { defer: true });
}

/**
 * When productivity / streak signals change — debounced.
 */
export function scheduleMotivationProductivityUpdate(partial) {
  lastProductivityPayload = {
    ...(lastProductivityPayload || {}),
    ...(partial || {}),
  };

  if (productivityDebounceTimer) {
    clearTimeout(productivityDebounceTimer);
  }

  productivityDebounceTimer = setTimeout(() => {
    productivityDebounceTimer = null;
    const snap = lastProductivityPayload;
    lastProductivityPayload = null;

    if (!getToken() || !snap) return;

    const punchAt = snap.punchAt ? new Date(snap.punchAt) : new Date();
    const body = buildMotivationRequestBody({
      punchAt,
      attendance: snap.attendance || {},
      extras: {
        productivity_trend: snap.productivity_trend,
        consecutive_high_intensity_days: snap.consecutive_high_intensity_days,
        team_rank: snap.team_rank,
        team_size: snap.team_size,
        productivity_score: snap.productivity_score,
        streak_days: snap.streak_days,
      },
    });

    void runGenerate(body, { defer: false });
  }, PRODUCTIVITY_DEBOUNCE_MS);
}
