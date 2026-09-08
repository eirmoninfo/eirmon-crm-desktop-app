import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Play,
  Coffee,
  Cake,
  Award,
  Target,
  ListTodo,
  CalendarDays,
  Wallet,
  BarChart3,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import { GlassCard, GlassButton } from "../components/glass/Glass";
import ProgressRing from "../components/glass/ProgressRing";
import { getCurrentUser } from "../api/auth.api";
import { fetchTasksPage } from "../api/tasks.api";
import { apiRequest } from "../api/http";
import WorkdayStatusBar from "../components/WorkdayStatusBar";
import { syncElectronBreakState } from "../utils/electronBreakSync";
import { toast } from "react-hot-toast";
import { logoutSession } from "../utils/sessionLogout";
import { refreshAttendanceScreenshots } from "../utils/attendanceScreenshotSync";
import {
  maybeMotivationOnDashboardOpen,
  requestMotivationAfterCheckIn,
  scheduleMotivationProductivityUpdate,
} from "../utils/motivationNotifications";
import { unwrapApiBody } from "../utils/unwrapApiBody";
import {
  breakStart,
  breakEnd,
  computeBreakSeconds,
  currentBreakSeconds,
  formatDurationHMS,
  formatTimeShort,
} from "../utils/breakTime";
import { markManualUpdateCheck } from "../components/AppUpdateOverlay";
import PunchCelebration from "../components/PunchCelebration";

const TARGET_DAY_HOURS = 8;
const RECENT_TASKS_LIMIT = 4;

function isTaskCompleted(status) {
  const s = String(status ?? "").toLowerCase();
  return s.includes("complete") || s.includes("done");
}

function breakDurationSeconds(b, nowMs = Date.now()) {
  const s = breakStart(b);
  if (!s) return null;
  const startMs = new Date(s).getTime();
  if (Number.isNaN(startMs)) return null;
  const endRaw = breakEnd(b);
  const endMs = endRaw ? new Date(endRaw).getTime() : nowMs;
  if (Number.isNaN(endMs) || endMs < startMs) return null;
  return Math.floor((endMs - startMs) / 1000);
}

function formatBreakRange(b) {
  const s = breakStart(b);
  const e = breakEnd(b);
  if (!s) return null;
  return `${formatTimeShort(s)} → ${e ? formatTimeShort(e) : "now"}`;
}

function formatTime(time) {
  const date = new Date(time);
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatLastPunch(time) {
  const date = new Date(time);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const label =
    date.toDateString() === yesterday.toDateString()
      ? "Yesterday"
      : date.toLocaleDateString();
  return `${label}, ${formatTime(time)}`;
}

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(user) {
  const profile = user?.user ?? user ?? {};
  const name = String(profile.name || "there").trim();
  return name.split(/\s+/)[0] || "there";
}

function sortTasksRecent(list) {
  return [...list].sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  });
}

function formatTaskStatus(status) {
  return String(status ?? "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isCheckedOut, setIsCheckedOut] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkInAt, setCheckInAt] = useState(null);
  const [lastPunchOut, setLastPunchOut] = useState(null);
  const [workingHoursNum, setWorkingHoursNum] = useState(0);
  const [breaks, setBreaks] = useState([]);
  const [timeTick, setTimeTick] = useState(0);
  const [checkOutConfirmOpen, setCheckOutConfirmOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [celebrations, setCelebrations] = useState({ today: [], upcoming: [] });
  const [punchCelebration, setPunchCelebration] = useState(null);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [recentTasks, setRecentTasks] = useState([]);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateHint, setUpdateHint] = useState("");

  const isLiveWorking = isCheckedIn && !isCheckedOut;

  const totalBreakSeconds = useMemo(
    () => computeBreakSeconds(breaks, Date.now()),
    [breaks, timeTick, onBreak]
  );

  const currentBreakOnlySeconds = useMemo(
    () => (onBreak ? currentBreakSeconds(breaks, Date.now()) : 0),
    [breaks, onBreak, timeTick]
  );

  const liveProductionHours = useMemo(() => {
    if (!isLiveWorking || !checkInAt) {
      return workingHoursNum;
    }
    const checkInMs = new Date(checkInAt).getTime();
    if (!Number.isFinite(checkInMs)) return workingHoursNum;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - checkInMs) / 1000));
    const productionSec = Math.max(0, elapsedSec - totalBreakSeconds);
    return productionSec / 3600;
  }, [isLiveWorking, checkInAt, workingHoursNum, totalBreakSeconds, timeTick]);

  const dayProgressPercent = useMemo(() => {
    const pct = Math.round(
      (Math.min(liveProductionHours, TARGET_DAY_HOURS) / TARGET_DAY_HOURS) * 100
    );
    return Math.min(100, Math.max(0, pct));
  }, [liveProductionHours]);

  const celebrationItems = useMemo(
    () => [...(celebrations.today || []), ...(celebrations.upcoming || [])].slice(0, 5),
    [celebrations]
  );

  const breakClockMs = useMemo(() => Date.now(), [timeTick]);

  useEffect(() => {
    if (!isLiveWorking) return;
    const id = setInterval(() => setTimeTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isLiveWorking]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const userResult = await getCurrentUser();

      if (!userResult.success) {
        logoutSession();
        navigate("/login");
        return;
      }

      setUser(userResult.data);

      const todayRes = await apiRequest("/attendance/today");

      const att =
        unwrapApiBody(todayRes) ??
        (todayRes?.status === "success" ? todayRes.data : null) ??
        todayRes?.data ??
        null;

      if (att && typeof att === "object") {
        const checkedIn = att.check_in != null && att.check_in !== "";
        const checkedOut = att.check_out != null && att.check_out !== "";

        setIsCheckedIn(checkedIn);
        setIsCheckedOut(checkedOut);
        const activeBreak =
          todayRes.has_active_break ??
          att.has_active_break ??
          (Array.isArray(att.breaks) &&
            att.breaks.some((b) => breakStart(b) && !breakEnd(b)));
        setOnBreak(!!activeBreak);

        setBreaks(Array.isArray(att.breaks) ? att.breaks : []);

        const wh = parseFloat(att.working_hours || 0);
        setWorkingHoursNum(wh);

        if (att.check_in) {
          setCheckInAt(att.check_in);
          setCheckInTime(formatTime(att.check_in));
        } else {
          setCheckInAt(null);
          setCheckInTime(null);
        }

        if (att.check_out) {
          setLastPunchOut(formatLastPunch(att.check_out));
        }

        maybeMotivationOnDashboardOpen(att);

        if (
          att.productivity_score != null ||
          att.streak_days != null ||
          att.productivity_trend != null
        ) {
          scheduleMotivationProductivityUpdate({
            attendance: att,
            punchAt: att.check_in || new Date().toISOString(),
            productivity_score: att.productivity_score,
            streak_days: att.streak_days,
            productivity_trend: att.productivity_trend,
            consecutive_high_intensity_days:
              att.consecutive_high_intensity_days,
            team_rank: att.team_rank,
            team_size: att.team_size,
          });
        }
      } else {
        setIsCheckedIn(false);
        setIsCheckedOut(false);
        setOnBreak(false);
        setBreaks([]);
        setWorkingHoursNum(0);
        setCheckInAt(null);
        setCheckInTime(null);
      }

      try {
        const celebRes = await apiRequest("/team/celebrations?within_days=7");
        const celebBody = unwrapApiBody(celebRes) ?? celebRes?.data ?? celebRes;
        setCelebrations({
          today: Array.isArray(celebBody?.today) ? celebBody.today : [],
          upcoming: Array.isArray(celebBody?.upcoming) ? celebBody.upcoming : [],
        });
      } catch {
        setCelebrations({ today: [], upcoming: [] });
      }

      try {
        const { list } = await fetchTasksPage(1, 30);
        const sorted = sortTasksRecent(list);
        const open = sorted.filter((t) => !isTaskCompleted(t.status));
        setPendingTasks(open.length);
        setRecentTasks(sorted.slice(0, RECENT_TASKS_LIMIT));
      } catch {
        setPendingTasks(0);
        setRecentTasks([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const onAttendanceChanged = () => {
      loadDashboard();
      refreshAttendanceScreenshots();
    };
    window.addEventListener("collabflow:attendance-changed", onAttendanceChanged);
    return () => {
      window.removeEventListener("collabflow:attendance-changed", onAttendanceChanged);
    };
  }, [loadDashboard]);

  const handleLogout = () => {
    logoutSession();
    navigate("/login");
  };

  const handleCheckIn = async () => {
    const punchAt = new Date();
    try {
      const checkInRes = await apiRequest("/attendance/check-in", { method: "POST" });
      setIsCheckedIn(true);
      setPunchCelebration("in");
      refreshAttendanceScreenshots();
      const att = unwrapApiBody(checkInRes) || checkInRes?.data || {};
      requestMotivationAfterCheckIn({ punchAt, attendance: att });
      await loadDashboard();
    } catch (err) {
      toast.error(err?.message || "Check-in failed");
    }
  };

  const handleCheckOut = async () => {
    setCheckingOut(true);
    try {
      await apiRequest("/attendance/check-out", { method: "POST" });
      setCheckOutConfirmOpen(false);
      setPunchCelebration("out");
      await loadDashboard();
      refreshAttendanceScreenshots();
      window.dispatchEvent(
        new CustomEvent("collabflow:attendance-changed", {
          detail: { source: "check-out", active: false },
        })
      );
    } catch (err) {
      toast.error(err?.message || "Check-out failed");
    } finally {
      setCheckingOut(false);
    }
  };

  const handleBreak = async () => {
    const ending = onBreak;
    const endpoint = ending ? "/attendance/break/end" : "/attendance/break/start";

    await apiRequest(endpoint, { method: "POST" });
    await loadDashboard();
    syncElectronBreakState(!ending, { force: ending });
    refreshAttendanceScreenshots();
    window.dispatchEvent(
      new CustomEvent("collabflow:attendance-changed", {
        detail: { source: "manual-break", active: !ending },
      })
    );
  };

  const handleCheckForUpdates = async () => {
    if (!window.api?.checkForAppUpdates) {
      toast("Update checks are available in the desktop app.", { icon: "ℹ️" });
      return;
    }
    markManualUpdateCheck();
    setCheckingUpdate(true);
    setUpdateHint("Checking for updates...");
    try {
      const res = await window.api.checkForAppUpdates();
      if (res?.disabled) {
        setUpdateHint("Update checks run in packaged app only.");
        return;
      }
      if (!res?.ok && res?.error) {
        setUpdateHint(res.error);
      }
    } catch (err) {
      setUpdateHint(err?.message || "Update check failed.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const greeting = greetingForHour(now.getHours());
  const name = firstName(user);

  const statusLabel = !isCheckedIn
    ? "Away"
    : isCheckedOut
      ? "Checked out"
      : onBreak
        ? "On break"
        : "Working";
  const statusTone = !isCheckedIn
    ? ""
    : isCheckedOut
      ? "dash-status-out"
      : onBreak
        ? "dash-status-break"
        : "dash-status-working";

  const suggestions = [
    ...celebrationItems.slice(0, 1).map((item) => ({
      id: `celeb-${item.type}-${item.user_id}`,
      icon: item.type === "birthday" ? Cake : Award,
      text: `${item.name} — ${item.label}${
        item.is_today ? " today" : item.days_until != null ? ` in ${item.days_until}d` : ""
      }`,
    })),
    {
      id: "goal",
      icon: Target,
      text:
        dayProgressPercent >= 100
          ? "You've hit today's 8h goal"
          : `You're ${dayProgressPercent}% toward today's 8h goal`,
    },
    {
      id: "tasks",
      icon: ListTodo,
      text:
        pendingTasks > 0
          ? `${pendingTasks} open task${pendingTasks === 1 ? "" : "s"} need attention`
          : "You're all caught up on tasks",
    },
  ];

  return (
    <AppLayout
      user={user}
      onLogout={handleLogout}
      loading={loading}
      loadingLabel="Loading Eirmon One…"
      mainClassName="app-workspace-noscroll"
      showWorkdayBar={
        <WorkdayStatusBar
          variant="compact"
          isCheckedIn={isCheckedIn}
          isCheckedOut={isCheckedOut}
          hasActiveBreak={onBreak}
          breaks={breaks}
        />
      }
    >
      <div className="dash-board">
        <motion.div
          className="dash-board-mid"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <section className="dash-live">
            <div className="dash-live-top">
              <div className="min-w-0">
                <p className="dash-kicker">Live attendance</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="dash-live-title !mt-0">
                    {greeting}, {name}
                  </h2>
                  <span className={`dash-status-chip ${statusTone}`}>
                    <span className="dash-status-dot" />
                    {statusLabel}
                  </span>
                </div>
                <p className="dash-live-sub">
                  {!isCheckedIn
                    ? "Punch in to start tracking your workday."
                    : isCheckedOut
                      ? `Checked out${lastPunchOut ? ` · ${lastPunchOut}` : ""}.`
                      : onBreak
                        ? "You're on a break. Resume when you're ready."
                        : checkInTime
                          ? `Working · since ${checkInTime}`
                          : "Working"}
                </p>
              </div>
              <div className="dash-live-actions">
                {!isCheckedIn && (
                  <motion.button
                    type="button"
                    onClick={handleCheckIn}
                    className="punch-glow-btn flex items-center justify-center gap-2 !rounded-2xl !px-5 !py-2.5 !text-sm"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Punch in
                    <Play className="h-3.5 w-3.5 fill-white" />
                  </motion.button>
                )}
                {isCheckedIn && !isCheckedOut && (
                  <>
                    <GlassButton variant="secondary" onClick={handleBreak}>
                      <Coffee className="h-4 w-4" />
                      {onBreak ? "End break" : "Start break"}
                    </GlassButton>
                    <GlassButton
                      variant="danger"
                      onClick={() => setCheckOutConfirmOpen(true)}
                    >
                      Check out
                    </GlassButton>
                  </>
                )}
              </div>
            </div>

            <div className="dash-live-body">
              <div className="dash-live-main">
                <div className="dash-live-chips">
                  <div className="dash-live-chip">
                    <span>Check-in</span>
                    <strong className="tabular-nums">{checkInTime || "—"}</strong>
                  </div>
                  <div className="dash-live-chip">
                    <span>Break</span>
                    <strong className="tabular-nums">
                      {onBreak
                        ? formatDurationHMS(currentBreakOnlySeconds)
                        : formatDurationHMS(totalBreakSeconds)}
                    </strong>
                  </div>
                </div>

                {breaks.length > 0 ? (
                  <div className="dash-break-log dash-break-log-compact">
                    <p className="dash-break-log-title">Break log</p>
                    <ul>
                      {breaks.slice(-4).map((b, i) => {
                        const range = formatBreakRange(b);
                        const dur = breakDurationSeconds(b, breakClockMs);
                        if (!range) return null;
                        return (
                          <li key={i}>
                            <span className="tabular-nums">{range}</span>
                            <span className="tabular-nums font-medium theme-text">
                              {dur != null ? formatDurationHMS(dur) : "—"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="dash-live-empty-break">No breaks logged yet today.</p>
                )}

                <div className="dash-live-progress">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-glass-subtle">
                      Progress toward {TARGET_DAY_HOURS}h
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums theme-text">
                      {dayProgressPercent}%
                    </span>
                  </div>
                  <div className="dash-mini-bar">
                    <span
                      className={isLiveWorking ? "production-progress-fill" : ""}
                      style={{ width: `${dayProgressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="dash-live-ring">
                <ProgressRing
                  percent={dayProgressPercent}
                  size={112}
                  stroke={9}
                  label="TODAY"
                  variant={isLiveWorking ? "orange" : "blue"}
                />
              </div>
            </div>
          </section>

          <GlassCard className="dash-suggest !flex h-full min-h-0 flex-col !p-3">
            <div className="mb-2 flex items-center gap-2.5">
              <div className="dash-ai-avatar !h-9 !w-9">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">AI Suggestions</h3>
                  <span className="dash-beta">Beta</span>
                </div>
                <p className="text-[10px] text-glass-subtle">Reminders & workday tips</p>
              </div>
            </div>
            <ul className="dash-suggest-list">
              {suggestions.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[#64d2ff]" />
                    <span className="line-clamp-2">{item.text}</span>
                  </li>
                );
              })}
            </ul>
            <Link to="/eirmon-ai" className="dash-ai-cta !mt-2 !py-2.5 !text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Ask Eirmon AI
            </Link>
          </GlassCard>
        </motion.div>

        <motion.div
          className="dash-board-bottom"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.25 }}
        >
          <GlassCard className="dash-recent !flex h-full min-h-0 flex-col !p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent tasks</h3>
              <Link to="/tasks" className="dash-link">
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {recentTasks.length === 0 ? (
              <div className="dash-recent-empty">
                No tasks yet.{" "}
                <Link to="/tasks/create" className="text-[#64d2ff] hover:underline">
                  Create one
                </Link>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
                {recentTasks.slice(0, RECENT_TASKS_LIMIT).map((task) => (
                  <li key={task.id}>
                    <Link to="/tasks" className="dash-focus-row !py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium theme-text">
                          {task.title || "Untitled task"}
                        </p>
                        <p className="mt-0.5 text-[10px] text-glass-subtle">
                          {formatTaskStatus(task.status)}
                        </p>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-glass-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard className="dash-links !flex h-full min-h-0 flex-col !p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Quick links</h3>
              <GlassButton
                variant="ghost"
                className="!px-2 !py-1 !text-[11px]"
                onClick={handleCheckForUpdates}
                disabled={checkingUpdate}
              >
                {checkingUpdate ? "Checking…" : "Check updates"}
              </GlassButton>
            </div>
            {updateHint ? (
              <p className="mb-1.5 truncate text-[10px] text-glass-subtle">{updateHint}</p>
            ) : null}
            <div className="dash-links-grid">
              {[
                { to: "/attendance", label: "Attendance", icon: CalendarDays, tone: "blue" },
                { to: "/tasks", label: "Tasks", icon: ListTodo, tone: "violet" },
                { to: "/expense", label: "Expenses", icon: Wallet, tone: "emerald" },
                { to: "/budgets", label: "Budgets", icon: BarChart3, tone: "rose" },
              ].map((action) => {
                const ActionIcon = action.icon;
                return (
                  <Link
                    key={action.to}
                    to={action.to}
                    className={`dash-quick dash-quick-${action.tone}`}
                  >
                    <ActionIcon className="h-4 w-4" />
                    {action.label}
                  </Link>
                );
              })}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {checkOutConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !checkingOut && setCheckOutConfirmOpen(false)}
        >
          <GlassCard
            className="mx-4 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-bold theme-text">Confirm check out?</h3>
            <p className="mb-6 text-glass-muted">
              Are you sure you want to punch out for today? You can check in again later
              if needed.
            </p>
            <div className="flex justify-end gap-3">
              <GlassButton
                variant="secondary"
                disabled={checkingOut}
                onClick={() => setCheckOutConfirmOpen(false)}
              >
                Cancel
              </GlassButton>
              <GlassButton
                variant="danger"
                disabled={checkingOut}
                onClick={handleCheckOut}
              >
                {checkingOut ? "Checking out…" : "Yes, check out"}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      <PunchCelebration
        kind={punchCelebration}
        onDone={() => setPunchCelebration(null)}
      />
    </AppLayout>
  );
}
