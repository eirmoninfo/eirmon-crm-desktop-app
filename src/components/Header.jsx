import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion as Motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Search,
  User,
  LogOut,
  X,
  Menu,
} from "lucide-react";
import WeatherPill from "./WeatherPill";
import ThemeToggle from "./ThemeToggle";
import EirmonLogo from "./EirmonLogo";
import { EIRMON_LOGO_SRC } from "../utils/appBrand";
import { getCurrentUser } from "../api/auth.api";
import { getUserPayload } from "../utils/permissions";
import { logoutSession } from "../utils/sessionLogout";

function readStoredUser() {
  try {
    const s = localStorage.getItem("user");
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export default function Header({
  onLogout,
  user,
  onMobileMenuToggle = () => {},
}) {
  const navigate = useNavigate();
  const [meUser, setMeUser] = useState(() => readStoredUser());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState(
    () => window.__collabflowNotifications || []
  );
  const [searchQuery, setSearchQuery] = useState(
    () => sessionStorage.getItem("collabflow:workspace-search") || ""
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getCurrentUser();
      if (cancelled || !r.success) return;
      setMeUser(getUserPayload(r.data));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onNotification = (event) => {
      const item = event?.detail;
      if (!item?.id) return;
      setNotifications((current) =>
        (
          window.__collabflowNotifications || [
            item,
            ...current.filter((existing) => existing.id !== item.id),
          ]
        ).slice(0, 50)
      );
    };
    window.addEventListener("collabflow:notification-added", onNotification);
    return () =>
      window.removeEventListener("collabflow:notification-added", onNotification);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const effectiveUser = user ?? meUser;
  const profile = effectiveUser?.user ?? effectiveUser ?? {};

  const hour = currentTime.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const userRole = profile.role ?? profile.role_name ?? "Staff";
  const normalizedRole = String(userRole).toLowerCase();

  const titles = {
    "super admin": "Super Admin",
    admin: "Company Admin",
    "branch manager": "Branch Manager",
    "team lead": "Team Lead",
    senior: "Senior Staff",
    junior: "Junior Staff",
    sales: "Sales",
    staff: "Workspace",
  };

  const title = titles[normalizedRole] || "Workspace";

  const getInitials = (name) => {
    if (!name) return "EM";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  const initials = getInitials(profile.name);

  const formattedRole = userRole
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  const timeString = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const dateString = currentTime.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const handleSearchKeyDown = useCallback(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.currentTarget.focus();
      }
      if (e.key === "Escape") {
        e.currentTarget.blur();
        setSearchQuery("");
        sessionStorage.removeItem("collabflow:workspace-search");
        window.dispatchEvent(
          new CustomEvent("collabflow:workspace-search", {
            detail: { query: "" },
          })
        );
      }
      if (e.key === "Enter" && searchQuery.trim()) {
        sessionStorage.setItem("collabflow:workspace-search", searchQuery);
        navigate("/rough-work");
      }
    },
    [navigate, searchQuery]
  );

  useEffect(() => {
    const onGlobalKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, []);

  const handleLogout = () => {
    if (typeof onLogout === "function") {
      onLogout();
    } else {
      logoutSession();
      navigate("/login");
    }
  };

  return (
    <>
      <header className="glass-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className="glass-btn-ghost rounded-xl p-2 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-2.5">
            <EirmonLogo size={34} className="hidden shrink-0 !rounded-xl sm:block" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-glass-subtle">
                {title}
              </p>
              <h2 className="truncate text-base font-semibold sm:text-lg">
                {greeting},{" "}
                <span className="text-[#64d2ff]">
                  {profile.name?.trim() || "there"}
                </span>
              </h2>
            </div>
          </div>
        </div>

        <div className="glass-search mx-2">
          <Search className="h-4 w-4 shrink-0" />
          <input
            id="global-search"
            type="search"
            value={searchQuery}
            onChange={(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              sessionStorage.setItem("collabflow:workspace-search", query);
              window.dispatchEvent(
                new CustomEvent("collabflow:workspace-search", {
                  detail: { query },
                })
              );
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search workspace…"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-glass-subtle"
            aria-label="Universal search"
          />
          <kbd>⌘K</kbd>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <WeatherPill />

          <span className="glass-pill hidden md:inline-flex tabular-nums">
            {dateString}
            <span className="theme-text-faint">·</span>
            <span className="font-semibold theme-text">{timeString}</span>
          </span>

          <button
            type="button"
            onClick={() => setIsNotificationOpen(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-white/8"
            aria-label="Notifications"
          >
            <Bell className="h-4.5 w-4.5 text-glass-muted" />
            {notifications.length > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff453a] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[var(--theme-ring-offset)]">
                {notifications.length > 99 ? "99+" : notifications.length}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setIsProfileOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-semibold theme-keep-white text-white ring-2 ring-white/15"
            style={{
              background:
                "linear-gradient(135deg, #0a84ff, #5e5ce6)",
            }}
            aria-label="Profile menu"
          >
            {profile.avatar || profile.avatar_url ? (
              <img
                src={profile.avatar_url || profile.avatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </button>
        </div>

        <AnimatePresence>
          {isProfileOpen ? (
            <>
              <Motion.button
                type="button"
                className="fixed inset-0 z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsProfileOpen(false)}
                aria-label="Close profile menu"
              />
              <Motion.div
                className="glass-modal absolute right-0 top-full z-50 mt-2 w-72 !max-w-none overflow-hidden !rounded-3xl"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              >
                <div className="border-b border-white/10 p-4">
                  <p className="font-semibold">{profile.name || "—"}</p>
                  <p className="truncate text-sm text-glass-muted">
                    {profile.email || "—"}
                  </p>
                  <span className="glass-badge-blue mt-2 inline-block">
                    {formattedRole}
                  </span>
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      navigate("/profile");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm theme-text transition hover:bg-[var(--theme-hover)]"
                  >
                    <User className="h-4 w-4" />
                    My profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm theme-text transition hover:bg-[var(--theme-hover)]"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              </Motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {isNotificationOpen ? (
          <>
            <Motion.div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotificationOpen(false)}
              aria-hidden
            />
            <Motion.aside
              className="glass-modal fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col !rounded-none !rounded-l-[32px]"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 36 }}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <img
                    src={EIRMON_LOGO_SRC}
                    alt=""
                    className="h-8 w-8 rounded-xl object-contain ring-1 ring-white/10"
                  />
                  <h3 className="text-base font-semibold">Notifications</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNotificationOpen(false)}
                  className="rounded-xl p-2 transition hover:bg-white/8"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {notifications.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-glass-muted">
                  You&apos;re all caught up. No new notifications.
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => {
                        setNotifications((current) =>
                          current.filter((item) => {
                            const keep = item.id !== notification.id;
                            if (!keep) {
                              window.__collabflowNotifications = (
                                window.__collabflowNotifications || []
                              ).filter((stored) => stored.id !== notification.id);
                            }
                            return keep;
                          })
                        );
                        setIsNotificationOpen(false);
                        if (notification.route) navigate(notification.route);
                      }}
                      className="mb-2 w-full rounded-2xl border border-[var(--theme-glass-border)] bg-[var(--theme-hover)] p-3 text-left transition hover:bg-[var(--theme-hover-strong)]"
                    >
                      <p className="text-sm font-semibold theme-text">
                        {notification.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-glass-muted">
                        {notification.body}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </Motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
