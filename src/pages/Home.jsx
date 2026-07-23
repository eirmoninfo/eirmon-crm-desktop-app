import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Clock,
  CalendarDays,
  ListTodo,
  Play,
  Coffee,
  ArrowUpRight,
  Bell,
  Activity,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import EirmonLogo from "../components/EirmonLogo";
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

const TARGET_DAY_HOURS = 8;
const RECENT_TASKS_LIMIT = 5;

function isTaskCompleted(status) {
  const s = String(status ?? "").toLowerCase();
  return s.includes("complete") || s.includes("done");
}

function taskStatusBadgeClass(status) {
  const s = String(status ?? "pending").toLowerCase();
  if (isTaskCompleted(s)) return "glass-badge-green";
  if (s.includes("block")) return "glass-badge-red";
  if (s.includes("review")) return "glass-badge-amber";
  if (s.includes("progress")) return "glass-badge-blue";
  return "glass-badge-amber";
}

function formatTaskStatus(status) {
  return String(status ?? "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortTasksRecent(list) {
  return [...list].sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  });
}

function formatHours(hours) {
  if (!hours) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
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

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isCheckedOut, setIsCheckedOut] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [todayHours, setTodayHours] = useState("0h 0m");
  const [thisWeekHours] = useState("0h 0m");
  const [pendingTasks, setPendingTasks] = useState(0);
  const [recentTasks, setRecentTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [checkInTime, setCheckInTime] = useState(null);
  const [lastPunchOut, setLastPunchOut] = useState(null);
  const [workingHoursNum, setWorkingHoursNum] = useState(0);
  const [breaks, setBreaks] = useState([]);
  const [timeTick, setTimeTick] = useState(0);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateHint, setUpdateHint] = useState("");
  const [checkOutConfirmOpen, setCheckOutConfirmOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const dayProgressPercent = useMemo(() => {
    const pct = Math.round(
      (Math.min(workingHoursNum, TARGET_DAY_HOURS) / TARGET_DAY_HOURS) * 100
    );
    return Math.min(100, Math.max(0, pct));
  }, [workingHoursNum]);

  useEffect(() => {
    if (!isCheckedIn && !isCheckedOut) return;
    const id = setInterval(() => setTimeTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isCheckedIn, isCheckedOut]);

  const totalBreakSeconds = useMemo(
    () => computeBreakSeconds(breaks, Date.now()),
    [breaks, timeTick, onBreak]
  );

  const currentBreakOnlySeconds = useMemo(
    () => (onBreak ? currentBreakSeconds(breaks, Date.now()) : 0),
    [breaks, onBreak, timeTick]
  );

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
        setTodayHours(formatHours(wh));

        if (att.check_in) {
          setCheckInTime(formatTime(att.check_in));
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
      }

      try {
        const { list } = await fetchTasksPage(1, 30);
        const sorted = sortTasksRecent(list);
        setRecentTasks(sorted.slice(0, RECENT_TASKS_LIMIT));
        setPendingTasks(list.filter((t) => !isTaskCompleted(t.status)).length);
      } catch (taskErr) {
        console.error(taskErr);
        setRecentTasks([]);
        setPendingTasks(0);
      } finally {
        setTasksLoading(false);
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

  useEffect(() => {
    const off = window.api?.onAppUpdaterEvent?.((event) => {
      if (!event?.type) return;
      if (event.type === "checking") {
        setCheckingUpdate(true);
        setUpdateHint("Checking for updates...");
        return;
      }
      if (event.type === "available") {
        setCheckingUpdate(false);
        setUpdateHint(
          event.version ? `Update found: v${event.version}` : "Update found."
        );
        return;
      }
      if (event.type === "not-available") {
        setCheckingUpdate(false);
        setUpdateHint("You're on the latest version.");
        return;
      }
      if (event.type === "disabled") {
        setCheckingUpdate(false);
        setUpdateHint("Update checks run in packaged app only.");
        return;
      }
      if (event.type === "error") {
        setCheckingUpdate(false);
        setUpdateHint(event.message || "Update check failed.");
      }
    });

    return () => {
      if (typeof off === "function") off();
    };
  }, []);

  const handleLogout = () => {
    logoutSession();
    navigate("/login");
  };

  const handleCheckIn = async () => {
    const punchAt = new Date();
    try {
      await apiRequest("/attendance/check-in", { method: "POST" });
      setIsCheckedIn(true);
      refreshAttendanceScreenshots();
      requestMotivationAfterCheckIn({ punchAt, attendance: {} });
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
      await loadDashboard();
      refreshAttendanceScreenshots();
    } catch (err) {
      toast.error(err?.message || "Check-out failed");
    } finally {
      setCheckingOut(false);
    }
  };

  const handleBreak = async () => {
    const ending = onBreak;
    const endpoint = ending
      ? "/attendance/break/end"
      : "/attendance/break/start";

    await apiRequest(endpoint, { method: "POST" });
    await loadDashboard();
    syncElectronBreakState(!ending, { force: ending });
  };

  const handleCheckForUpdates = async () => {
    if (!window.api?.checkForAppUpdates) {
      toast("Update checks are available in the desktop app.", { icon: "ℹ️" });
      return;
    }
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

  const statusLabel = !isCheckedIn
    ? "Not punched in"
    : isCheckedOut
      ? "Checked out"
      : onBreak
        ? "On break"
        : "Working";

  const statusClass = isCheckedOut
    ? "glass-badge"
    : onBreak
      ? "glass-badge-amber"
      : isCheckedIn
        ? "glass-badge-blue"
        : "glass-badge";

  return (
    <AppLayout
      user={user}
      onLogout={handleLogout}
      loading={loading}
      loadingLabel="Loading Eirmon One…"
      showWorkdayBar={
        <WorkdayStatusBar
          isCheckedIn={isCheckedIn}
          isCheckedOut={isCheckedOut}
          hasActiveBreak={onBreak}
          breaks={breaks}
        />
      }
    >
      <div className="space-y-6">
       

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div
            className="stat-widget"
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          >
            <div className="flex items-center justify-between">
              <span className="stat-widget-label">Today&apos;s hours</span>
              <Clock className="h-4 w-4 text-[#64d2ff]" />
            </div>
            <span className="stat-widget-value">{todayHours}</span>
          </motion.div>

          <motion.div className="stat-widget" whileHover={{ y: -2 }}>
            <div className="flex items-center justify-between">
              <span className="stat-widget-label">This week</span>
              <CalendarDays className="h-4 w-4 text-[#bf5af2]" />
            </div>
            <span className="stat-widget-value">{thisWeekHours}</span>
            <p className="text-[11px] text-glass-subtle">
              Synced when API provides weekly totals
            </p>
          </motion.div>

          <motion.div className="stat-widget" whileHover={{ y: -2 }}>
            <div className="flex items-center justify-between">
              <span className="stat-widget-label">Pending tasks</span>
              <ListTodo className="h-4 w-4 text-[#ffd60a]" />
            </div>
            <span className="stat-widget-value">{pendingTasks}</span>
          </motion.div>

          <motion.div className="stat-widget" whileHover={{ y: -2 }}>
            <div className="flex items-center justify-between">
              <span className="stat-widget-label">Break time</span>
              <Coffee className="h-4 w-4 text-[#ff9f0a]" />
            </div>
            <span className="stat-widget-value tabular-nums">
              {formatDurationHMS(totalBreakSeconds)}
            </span>
            {onBreak && (
              <p className="text-xs font-medium text-[#ffd60a]">
                Live · {formatDurationHMS(currentBreakOnlySeconds)}
              </p>
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <GlassCard className="xl:col-span-2 !p-6 sm:!p-8">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Live attendance</h3>
                  <span className={`${statusClass} rounded-2xl px-2 py02 inline-flex items-center gap-2`}>
                    <span
                      className={`h-2 w-2 rounded-2xl ${
                        isCheckedOut
                          ? "bg-white/40"
                          : onBreak
                            ? "bg-[#ffd60a]"
                            : isCheckedIn
                              ? "bg-[#64d2ff]  animate-pulse"
                              : "bg-white/40"
                      }`}
                    />
                    {statusLabel}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3">
                  {!isCheckedIn && (
                    <motion.button
                      type="button"
                      onClick={handleCheckIn}
                      className="punch-glow-btn flex min-w-[200px] items-center justify-center gap-3"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Punch in
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                        <Play className="h-4 w-4 fill-white" />
                      </span>
                    </motion.button>
                  )}

                  {isCheckedIn && !isCheckedOut && (
                    <>
                      <GlassButton
                        variant="secondary"
                        onClick={handleBreak}
                        className={onBreak ? "!border-[#ff9f0a]/40" : ""}
                      >
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

                <p className="text-sm text-glass-muted">
                  Last punch out:{" "}
                  <span className="font-medium theme-text">
                    {lastPunchOut || "No previous record"}
                  </span>
                </p>

                <div>
                  <div className="mb-2 flex justify-between text-xs text-glass-subtle">
                    <span>Progress toward {TARGET_DAY_HOURS}h</span>
                    <span>{dayProgressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #0a84ff, #5e5ce6)",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${dayProgressPercent}%` }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-5">
                <ProgressRing
                  percent={dayProgressPercent}
                  size={140}
                  label="Today"
                />
                <div className="grid w-full grid-cols-2 gap-3">
                  <div className="glass-card-sm p-4 text-center">
                    <p className="text-xs text-glass-subtle">Check-in</p>
                    <p className="mt-1 font-semibold tabular-nums">
                      {checkInTime || "—"}
                    </p>
                  </div>
                  <div className="glass-card-sm p-4 text-center">
                    <p className="text-xs text-glass-subtle">Break</p>
                    <p className="mt-1 font-semibold tabular-nums">
                      {onBreak
                        ? formatDurationHMS(currentBreakOnlySeconds)
                        : breaks.length
                          ? formatDurationHMS(totalBreakSeconds)
                          : "None"}
                    </p>
                  </div>
                </div>

                {breaks.length > 0 && (
                  <div className="glass-card-sm w-full overflow-hidden !rounded-2xl !p-0">
                    <p className="border-b border-white/8 px-3 py-2 text-xs font-semibold text-glass-muted">
                      Break log
                    </p>
                    <ul className="max-h-36 divide-y divide-white/5 overflow-y-auto text-xs">
                      {breaks.map((b, i) => {
                        const s = breakStart(b);
                        const e = breakEnd(b);
                        const durSec =
                          s && e
                            ? Math.max(
                                0,
                                Math.floor(
                                  (new Date(e) - new Date(s)) / 1000
                                )
                              )
                            : s && !e
                              ? Math.max(
                                  0,
                                  Math.floor(
                                    (Date.now() - new Date(s).getTime()) /
                                      1000
                                  )
                                )
                              : null;
                        return (
                          <li
                            key={i}
                            className="flex justify-between gap-2 px-3 py-2 text-glass-muted"
                          >
                            <span className="tabular-nums">
                              {formatTimeShort(s)} →{" "}
                              {e ? formatTimeShort(e) : "…"}
                            </span>
                            <span className="shrink-0 font-medium theme-text">
                              {durSec != null
                                ? formatDurationHMS(durSec)
                                : "—"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="!p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <EirmonLogo size={28} className="!rounded-xl shadow-md shadow-[#0a84ff]/20" />
              <h3 className="font-semibold">AI suggestions</h3>
            </div>
            <ul className="space-y-3 text-sm text-glass-muted">
              <li className="rounded-2xl border border-white/8 bg-white/4 p-3">
                {pendingTasks > 0
                  ? `You have ${pendingTasks} open task${pendingTasks === 1 ? "" : "s"} to review`
                  : "You're all caught up on tasks"}
              </li>
              <li className="rounded-2xl border border-white/8 bg-white/4 p-3">
                You&apos;re {dayProgressPercent}% toward your {TARGET_DAY_HOURS}h goal
              </li>
              <li className="rounded-2xl border border-white/8 bg-white/4 p-3">
                <Link to="/eirmon-ai" className="inline-flex items-center gap-1 text-[#64d2ff] hover:underline">
                  Ask Eirmon AI <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            </ul>
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <GlassCard>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recent tasks</h3>
              <Link
                to="/tasks"
                className="inline-flex items-center gap-1 text-sm font-medium text-[#64d2ff] hover:underline"
              >
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="space-y-2">
              {tasksLoading ? (
                <li className="py-8 text-center text-sm text-glass-muted">
                  {/* Loading tasks… */}
                </li>
              ) : recentTasks.length === 0 ? (
                <li className="rounded-2xl border border-[var(--theme-glass-border-soft)] bg-[var(--theme-hover)] px-4 py-8 text-center text-sm text-glass-muted">
                  No tasks yet.{" "}
                  <Link to="/tasks/create" className="text-[#64d2ff] hover:underline">
                    Create one
                  </Link>
                </li>
              ) : (
                recentTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      to="/tasks"
                      className="task-row-glass flex items-center gap-3 transition hover:bg-[var(--theme-hover-strong)]"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium theme-text">
                        {task.title || "Untitled task"}
                      </span>
                      <span
                        className={`shrink-0 capitalize px-1 py-1 rounded-2xl ${taskStatusBadgeClass(task.status)}`}
                      >
                        {formatTaskStatus(task.status)}
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </GlassCard>

          <GlassCard>
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Quick links</h3>
              <GlassButton
                variant="secondary"
                className="!px-3 !py-2 !text-xs"
                onClick={handleCheckForUpdates}
                disabled={checkingUpdate}
              >
                {checkingUpdate ? "Checking…" : "Check updates"}
              </GlassButton>
            </div>
            {updateHint ? (
              <p className="mb-4 text-xs text-glass-subtle">{updateHint}</p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { to: "/attendance", label: "Attendance", icon: CalendarDays },
                { to: "/tasks", label: "Tasks", icon: ListTodo },
                { to: "/expense", label: "Expenses", icon: Activity },
                { to: "/budgets", label: "Budgets", icon: Bell },
              ].map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="glass-card-sm flex flex-col items-center gap-2 p-4 text-center transition hover:bg-white/10"
                >
                  <Icon className="h-6 w-6 text-[#64d2ff]" />
                  <p className="text-sm font-medium">{label}</p>
                </Link>
              ))}
            </div>
          </GlassCard>
        </div>
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
            <h3 className="mb-2 text-lg font-bold theme-text">
              Confirm check out?
            </h3>
            <p className="mb-6 text-glass-muted">
              Are you sure you want to punch out for today? You can check in
              again later if needed.
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
    </AppLayout>
  );
}
