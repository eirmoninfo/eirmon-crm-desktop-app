import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  Clock,
  ListTodo,
  CalendarDays,
  MessageSquare,
  Wallet,
  BarChart3,
  Tag,
  Receipt,
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";
import EirmonLogo from "./EirmonLogo";
import { getCurrentUser } from "../api/auth.api";
import { P } from "../constants/permissions";
import { canAccessAny, getUserPayload } from "../utils/permissions";

function readStoredUser() {
  try {
    const s = localStorage.getItem("user");
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function initialsFromUser(user) {
  const profile = user?.user ?? user ?? {};
  const name = profile.name;
  if (!name || typeof name !== "string") return "EM";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

const ICONS = {
  dashboard: LayoutDashboard,
  notes: BookOpen,
  attendance: Clock,
  tasks: ListTodo,
  leave: CalendarDays,
  chat: MessageSquare,
  ai: null,
  expenses: Wallet,
  budgets: BarChart3,
  categories: Tag,
  expenseList: Receipt,
};

export default function Sidebar({
  onLogout,
  user: rawUser,
  mobileOpen = false,
  onMobileClose,
}) {
  const [meUser, setMeUser] = useState(() => readStoredUser());
  const [isExpanded, setIsExpanded] = useState(false);
  const [openDropdowns, setOpenDropdowns] = useState({ expenseMgmt: false });

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

  const effectiveUser = rawUser ?? meUser;
  const profile = effectiveUser?.user ?? effectiveUser ?? {};
  const displayName = profile.name ?? "User";
  const displayRole = profile.role ?? "Staff";
  const location = useLocation();

  const showExpanded = isExpanded || mobileOpen;

  const showHrBadge = useMemo(() => {
    const r = String(displayRole);
    return r === "Super Admin" || r === "HR";
  }, [displayRole]);

  const toggleDropdown = (key) => {
    setOpenDropdowns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isActive = (path) =>
    location.pathname === path ||
    (path === "/team-chat" && location.pathname.startsWith("/team-chat")) ||
    (path === "/eirmon-ai" && location.pathname.startsWith("/eirmon-ai"));

  const isChildActive = (paths) =>
    paths.some((p) => location.pathname.startsWith(p));

  const menuItemsAll = useMemo(
    () => [
      {
        name: "Dashboard",
        iconKey: "dashboard",
        href: "/home",
        anyOf: [P.VIEW_DASHBOARD],
      },
      {
        name: "Workspace",
        iconKey: "notes",
        href: "/rough-work",
        anyOf: [],
      },
      {
        name: "Attendance",
        iconKey: "attendance",
        href: "/attendance",
        badge: showHrBadge ? "HR" : null,
        anyOf: [P.VIEW_ATTENDANCE],
      },
      {
        name: "Tasks",
        iconKey: "tasks",
        href: "/tasks",
        badge: showHrBadge ? "HR" : null,
        anyOf: [P.VIEW_TASKS],
      },
      {
        name: "Leave",
        iconKey: "leave",
        href: "/leave-requests",
        anyOf: [],
      },
      {
        name: "Chat",
        iconKey: "chat",
        href: "/team-chat",
        anyOf: [P.VIEW_TEAM_CHAT, P.MANAGE_TEAM_CHAT],
      },
      {
        name: "AI Assistant",
        iconKey: "ai",
        href: "/eirmon-ai",
        anyOf: [P.USE_EIRMON_AI, P.USE_AI_MARKETING_ASSISTANT],
      },
      {
        name: "Expenses",
        iconKey: "expenses",
        dropdown: true,
        key: "expenseMgmt",
        anyOf: [
          P.VIEW_BUDGETS,
          P.MANAGE_BUDGETS,
          P.VIEW_EXPENSE_CATEGORIES,
          P.MANAGE_EXPENSE_CATEGORIES,
          P.CREATE_EXPENSE_CATEGORIES,
          P.VIEW_EXPENSES,
        ],
        subItems: [
          {
            name: "Budgets",
            iconKey: "budgets",
            href: "/budgets",
            anyOf: [P.VIEW_BUDGETS, P.MANAGE_BUDGETS],
          },
          {
            name: "Categories",
            iconKey: "categories",
            href: "/expense-categories",
            anyOf: [
              P.VIEW_EXPENSE_CATEGORIES,
              P.MANAGE_EXPENSE_CATEGORIES,
              P.CREATE_EXPENSE_CATEGORIES,
            ],
          },
          {
            name: "Reports",
            iconKey: "expenseList",
            href: "/expense",
            badge: "Approver",
            anyOf: [P.VIEW_EXPENSES],
          },
        ],
      },
    ],
    [showHrBadge]
  );

  const menuItems = useMemo(() => {
    const u = effectiveUser;
    return menuItemsAll
      .map((item) => {
        if (item.dropdown) {
          const subItems = (item.subItems || []).filter((s) =>
            canAccessAny(u, s.anyOf ?? [])
          );
          if (subItems.length === 0) return null;
          return { ...item, subItems };
        }
        if (!item.anyOf?.length) return item;
        return canAccessAny(u, item.anyOf) ? item : null;
      })
      .filter(Boolean);
  }, [effectiveUser, menuItemsAll]);

  const avatarInitials = initialsFromUser(effectiveUser);

  const renderIcon = (key, className = "h-5 w-5 shrink-0") => {
    if (key === "ai") {
      const size = className.includes("h-4") ? 16 : 20;
      return <EirmonLogo size={size} className="shrink-0 !rounded-md" />;
    }
    const Icon = ICONS[key] || LayoutDashboard;
    return <Icon className={className} strokeWidth={1.75} />;
  };

  return (
    <aside
      className={`glass-sidebar ${showExpanded ? "glass-sidebar-expanded" : ""} ${
        mobileOpen ? "glass-sidebar-mobile-open" : ""
      }`}
      onMouseEnter={() => !mobileOpen && setIsExpanded(true)}
      onMouseLeave={() => !mobileOpen && setIsExpanded(false)}
    >
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <EirmonLogo size={36} className="shrink-0" />
          <AnimatePresence>
            {showExpanded ? (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="min-w-0 overflow-hidden"
              >
                <h1 className="truncate text-sm font-semibold tracking-tight">
                  Eirmon One
                </h1>
                <p className="text-[10px] font-medium uppercase tracking-widest text-glass-subtle">
                  Workspace
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {mobileOpen ? (
          <button
            type="button"
            onClick={onMobileClose}
            className="glass-btn-ghost rounded-xl p-2 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="hidden rounded-xl p-2 text-glass-muted transition hover:bg-white/5 hover:text-white lg:block"
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isExpanded ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {menuItems.map((item) => {
          if (item.dropdown) {
            const childPaths = item.subItems.map((s) => s.href);
            const dropdownActive = isChildActive(childPaths);
            const isOpen = openDropdowns[item.key] || dropdownActive;

            return (
              <div key={item.name}>
                <button
                  type="button"
                  onClick={() => toggleDropdown(item.key)}
                  className={`glass-nav-item w-full ${
                    isOpen ? "glass-nav-item-active" : ""
                  }`}
                >
                  {renderIcon(item.iconKey)}
                  {showExpanded ? (
                    <>
                      <span className="flex-1 truncate text-left">
                        {item.name}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </>
                  ) : null}
                </button>

                <AnimatePresence>
                  {isOpen && showExpanded ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="ml-3 mt-1 space-y-0.5 overflow-hidden border-l border-white/10 pl-3"
                    >
                      {item.subItems.map((sub) => {
                        const subActive = isChildActive([sub.href]);
                        return (
                          <Link
                            key={sub.name}
                            to={sub.href}
                            onClick={onMobileClose}
                            className={`glass-nav-item py-2 text-xs ${
                              subActive ? "glass-nav-item-active" : ""
                            }`}
                          >
                            {renderIcon(sub.iconKey, "h-4 w-4")}
                            <span className="flex-1 truncate">{sub.name}</span>
                            {sub.badge ? (
                              <span className="glass-badge-red text-[9px]">
                                {sub.badge}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          }

          const active = isActive(item.href);

          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={onMobileClose}
              title={!showExpanded ? item.name : undefined}
              className={`glass-nav-item ${active ? "glass-nav-item-active" : ""}`}
            >
              {renderIcon(item.iconKey)}
              {showExpanded ? (
                <>
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.badge ? (
                    <span className="glass-badge-red text-[9px]">
                      {item.badge}
                    </span>
                  ) : null}
                </>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, #0a84ff 0%, #5e5ce6 55%, #bf5af2 100%)",
            }}
            aria-hidden
          >
            {avatarInitials}
          </div>

          {showExpanded ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-glass-subtle">{displayRole}</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onLogout?.()}
            className="shrink-0 rounded-xl p-2 text-glass-muted transition hover:bg-white/10 hover:text-white"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
