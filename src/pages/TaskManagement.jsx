import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import toast from "react-hot-toast";
import {
  FaPlus,
  FaSearch,
  FaComment,
  FaPaperclip,
  FaThLarge,
  FaListUl,
  FaGripVertical,
  FaTasks,
} from "react-icons/fa";
import { apiRequest } from "../api/http";
import { getCurrentUser } from "../api/auth.api";
import AppLayout from "../components/layout/AppLayout";
import { GlassButton, PageHeader } from "../components/glass/Glass";
import Pagination from "../components/Pagination";
import { getEcho } from "../utils/echo";
import WorkdayStatusBar from "../components/WorkdayStatusBar";
import TaskDetailDrawer from "../components/Tasks/TaskDetailDrawer";
import { breakStart, breakEnd } from "../utils/breakTime";
import { getToastLogoIcon } from "../utils/appBrand";
import { showAppNotification } from "../utils/appNotification";
import { logoutSession } from "../utils/sessionLogout";

const COLUMNS = [
  {
    id: "todo",
    label: "Todo",
    dotClass: "bg-white/25",
    glow: "rgb(255 255 255 / 0.25)",
    barClass: "border-t-white/30",
  },
  {
    id: "pending",
    label: "Pending",
    dotClass: "bg-[#ffd60a]",
    glow: "rgb(255 214 10 / 0.45)",
    barClass: "border-t-[#ffd60a]/50",
  },
  {
    id: "in_progress",
    label: "In Progress",
    dotClass: "bg-[#64d2ff]",
    glow: "rgb(100 210 255 / 0.45)",
    barClass: "border-t-[#64d2ff]/50",
  },
  {
    id: "review",
    label: "Review",
    dotClass: "bg-[#ff9f0a]",
    glow: "rgb(255 159 10 / 0.45)",
    barClass: "border-t-[#ff9f0a]/50",
  },
  {
    id: "blocked",
    label: "Blocked",
    dotClass: "bg-[#ff453a]",
    glow: "rgb(255 69 58 / 0.45)",
    barClass: "border-t-[#ff453a]/50",
  },
  {
    id: "completed",
    label: "Completed",
    dotClass: "bg-[#30d158]",
    glow: "rgb(48 209 88 / 0.45)",
    barClass: "border-t-[#30d158]/50",
  },
];

const COLUMN_TO_API = {
  todo: "todo",
  pending: "pending",
  in_progress: "in_progress",
  review: "review",
  blocked: "blocked",
  completed: "completed",
};

const PRIORITY_STYLES = {
  low: "bg-white/10 text-glass-muted ring-1 ring-white/10",
  medium: "bg-[#ffd60a]/15 text-[#ffd60a] ring-1 ring-[#ffd60a]/25",
  high: "bg-[#ff9f0a]/15 text-[#ffb340] ring-1 ring-[#ff9f0a]/30",
  urgent: "bg-[#ff453a]/15 text-[#ff6961] ring-1 ring-[#ff453a]/30",
};

function idsEqual(a, b) {
  return a === b || String(a) === String(b);
}

/** Prefer pointer hits (empty columns + cards), then corners — works better for multi-column boards. */
function kanbanCollisionDetection(args) {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return closestCorners(args);
}

/** Merge one column’s visible tasks into master state (respects filtered hidden rows). */
function mergeColumnState(prev, columnId, newList, filteredTasks) {
  const visibleInColumn = filteredTasks.filter(
    (t) => normalizeColumn(t) === columnId
  );
  const visibleIdSet = new Set(visibleInColumn.map((t) => t.id));

  const hiddenInColumn = prev.filter(
    (t) => normalizeColumn(t) === columnId && !visibleIdSet.has(t.id)
  );

  const withoutColumn = prev.filter(
    (t) => normalizeColumn(t) !== columnId
  );
  const mapped = newList.map((t) => ({
    ...t,
    status: COLUMN_TO_API[columnId],
  }));
  return [...withoutColumn, ...hiddenInColumn, ...mapped];
}

function normalizeColumn(task) {
  const raw = task?.status ?? task?.state ?? "";
  const s = String(raw).toLowerCase().replace(/[\s-]+/g, "_");

  if (["blocked", "block", "on_hold"].includes(s)) return "blocked";
  if (["completed", "done", "closed", "resolved"].includes(s)) return "completed";
  if (["review", "in_review"].includes(s)) return "review";
  if (
    ["in_progress", "inprogress", "doing", "active", "started", "progress"].includes(
      s
    )
  )
    return "in_progress";
  if (["pending", "waiting"].includes(s)) return "pending";
  if (["todo", "open", "new", "backlog"].includes(s)) return "todo";
  return "todo";
}

function splitIntoColumns(taskList) {
  const next = {
    todo: [],
    pending: [],
    in_progress: [],
    review: [],
    blocked: [],
    completed: [],
  };
  for (const t of taskList) {
    const col = normalizeColumn(t);
    next[col].push({ ...t, status: COLUMN_TO_API[col] });
  }
  return next;
}

function formatDue(d) {
  if (!d) return null;
  try {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function isOverdue(d) {
  if (!d) return false;
  const end = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end < today;
}

function initialsFromTask(task) {
  const name =
    task.assignee?.name ??
    task.assignee_name ??
    task.user?.name ??
    task.assigned_to?.name ??
    "";
  if (!name || typeof name !== "string") return "—";
  const p = name.trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  return p[0].slice(0, 2).toUpperCase();
}

function priorityLabel(task) {
  const p = String(task.priority ?? task.priority_level ?? "medium").toLowerCase();
  if (p.includes("urgent")) return "URGENT";
  if (p.includes("high")) return "HIGH";
  if (p.includes("low")) return "LOW";
  return "MEDIUM";
}

function priorityClass(task) {
  const p = String(task.priority ?? "medium").toLowerCase();
  if (p.includes("urgent")) return PRIORITY_STYLES.urgent;
  if (p.includes("high")) return PRIORITY_STYLES.high;
  if (p.includes("low")) return PRIORITY_STYLES.low;
  return PRIORITY_STYLES.medium;
}

/** Presentational task card — used by sortable row and drag overlay. */
function KanbanTaskCardBody({ task }) {
  const due = task.due_date;
  const dueStr = formatDue(due);
  const overdue = due && isOverdue(due);
  const comments = task.comments_count ?? task.comment_count ?? 0;
  const attachments =
    task.attachments_count ?? task.attachment_count ?? 0;
  const subtasks = task.subtasks_count ?? task.subtask_count ?? 0;

  return (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityClass(task)}`}
          >
            {priorityLabel(task)}
          </span>
        </div>
      </div>
      <h3 className="text-sm font-semibold leading-snug theme-text">
        {task.title || "Untitled task"}
      </h3>
      {(task.description || task.project?.title) && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-glass-muted">
          {task.description || task.project?.title || ""}
        </p>
      )}

      <div className="mt-3 flex items-end justify-between gap-2 border-t border-white/8 pt-3">
        <div className="min-w-0 flex-1">
          {dueStr && (
            <p
              className={`text-xs font-medium tabular-nums ${
                overdue ? "text-[#ff6961]" : "text-glass-muted"
              }`}
            >
              {dueStr}
            </p>
          )}
          {!dueStr && (
            <p className="text-xs text-glass-subtle">No due date</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <span
            className="inline-flex items-center gap-1 text-[11px] text-glass-subtle"
            title="Subtasks"
          >
            <FaTasks className="text-glass-subtle" />
            {subtasks}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-glass-subtle">
            <FaComment className="text-glass-subtle" />
            {comments}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-glass-subtle">
            <FaPaperclip className="text-glass-subtle" />
            {attachments}
          </span>
          <span
            className="theme-keep-white flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md"
            style={{
              background: "linear-gradient(135deg, #0a84ff, #5e5ce6)",
            }}
            title={
              task.assignee?.name || task.assignee_name || "Assignee"
            }
          >
            {initialsFromTask(task)}
          </span>
        </div>
      </div>
    </>
  );
}

function SortableTaskCard({ task, onOpen }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`kanban-card group ${
        isDragging ? "kanban-card-dragging" : ""
      }`}
    >
      <button
        type="button"
        className="touch-none mt-0.5 flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-white/25 transition hover:bg-white/8 hover:text-white/50 active:cursor-grabbing"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        aria-label="Drag to move task"
      >
        <FaGripVertical className="h-4 w-4" aria-hidden={true} />
      </button>
      <div
        role="button"
        tabIndex={0}
        className="min-w-0 flex-1 cursor-pointer rounded-lg p-1 outline-none ring-[#0a84ff]/40 focus-visible:ring-2"
        onClick={() => onOpen?.(task)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen?.(task);
          }
        }}
      >
        <KanbanTaskCardBody task={task} />
      </div>
    </article>
  );
}

/** Floating preview under cursor while dragging (must match card width). */
function KanbanTaskDragOverlay({ task }) {
  return (
    <article
      className="kanban-card kanban-card-overlay group flex w-[min(280px,calc(100vw-10rem))] gap-1 p-2.5 pl-1 will-change-transform"
    >
      <span className="mt-0.5 flex h-8 w-7 shrink-0 items-center justify-center text-white/30">
        <FaGripVertical className="h-4 w-4" aria-hidden={true} />
      </span>
      <div className="min-w-0 flex-1 p-1">
        <KanbanTaskCardBody task={task} />
      </div>
    </article>
  );
}

function KanbanBoardColumn({ col, tasks, onAdd, onTaskClick }) {
  const { setNodeRef } = useDroppable({ id: col.id });
  const sortableIds = tasks.map((t) => t.id);

  return (
    <section
      data-column={col.id}
      className={`kanban-column flex h-full min-h-[calc(100dvh-13.5rem)] w-[300px] shrink-0 flex-col border-t-4 sm:w-[320px] ${col.barClass}`}
    >
      <div className="kanban-column-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`kanban-count-badge ${col.dotClass}`}
            style={{ "--kanban-glow": col.glow }}
          >
            {tasks.length}
          </span>
          <span className="truncate text-sm font-semibold theme-text">
            {col.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAdd(col.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-glass-muted transition hover:bg-white/10 hover:text-[#64d2ff]"
          aria-label={`Add task to ${col.label}`}
        >
          <FaPlus className="text-sm" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex min-h-full flex-1 flex-col gap-3">
            {tasks.length === 0 ? (
              <div className="flex min-h-full flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--theme-glass-border-soft)] bg-[var(--theme-hover)] px-4 py-8 text-center">
                <p className="text-xs text-glass-subtle">Drop tasks here</p>
              </div>
            ) : (
              tasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  onOpen={onTaskClick}
                />
              ))
            )}
          </div>
        </SortableContext>
      </div>
    </section>
  );
}

export default function TaskManagement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [masterTasks, setMasterTasks] = useState([]);
  const [meta, setMeta] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [todayAttendance, setTodayAttendance] = useState(null);
  const [todayHasActiveBreak, setTodayHasActiveBreak] = useState(false);

  const [viewMode, setViewMode] = useState("board");
  const [filterTab, setFilterTab] = useState("all");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [activeDragId, setActiveDragId] = useState(null);
  const [detailTaskId, setDetailTaskId] = useState(null);

  const currentUserId =
    user?.user?.id ?? user?.data?.user?.id ?? user?.data?.id ?? user?.id;

  const filteredTasks = useMemo(() => {
    let list = masterTasks;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const title = (t.title || "").toLowerCase();
        const desc = (t.description || "").toLowerCase();
        return title.includes(q) || desc.includes(q);
      });
    }

    if (filterTab === "my" && currentUserId != null) {
      const uid = Number(currentUserId);
      list = list.filter((t) => {
        const aid = t.assignee_id ?? t.user_id ?? t.assigned_to_id;
        return aid != null && Number(aid) === uid;
      });
    }

    if (filterTab === "overdue") {
      list = list.filter((t) => t.due_date && isOverdue(t.due_date));
    }

    if (assigneeFilter !== "all") {
      const id = Number(assigneeFilter);
      list = list.filter((t) => {
        const aid = t.assignee_id ?? t.user_id ?? t.assigned_to_id;
        return aid != null && Number(aid) === id;
      });
    }

    if (priorityFilter !== "all") {
      list = list.filter((t) =>
        String(t.priority ?? "medium")
          .toLowerCase()
          .includes(priorityFilter.toLowerCase())
      );
    }

    if (dueFilter !== "all") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      list = list.filter((t) => {
        if (dueFilter === "none") return !t.due_date;
        if (!t.due_date) return false;
        const d = new Date(t.due_date);
        d.setHours(0, 0, 0, 0);
        const diff = (d - today) / 864e5;
        if (dueFilter === "today") return diff === 0;
        if (dueFilter === "week") return diff >= 0 && diff <= 7;
        return true;
      });
    }

    return list;
  }, [
    masterTasks,
    search,
    filterTab,
    assigneeFilter,
    priorityFilter,
    dueFilter,
    currentUserId,
  ]);

  const columns = useMemo(
    () => splitIntoColumns(filteredTasks),
    [filteredTasks]
  );

  const activeDragTask = useMemo(() => {
    if (activeDragId == null) return null;
    return (
      filteredTasks.find((t) => idsEqual(t.id, activeDragId)) ?? null
    );
  }, [activeDragId, filteredTasks]);

  const assigneeOptions = useMemo(() => {
    const m = new Map();
    for (const t of masterTasks) {
      const id = t.assignee_id ?? t.user_id ?? t.assigned_to_id;
      const name =
        t.assignee?.name ?? t.assignee_name ?? t.user?.name ?? `User ${id}`;
      if (id != null) m.set(id, name);
    }
    return Array.from(m.entries());
  }, [masterTasks]);

  const loadTodayAttendance = useCallback(async () => {
    try {
      const res = await apiRequest("/attendance/today");
      if (res?.status === "success" && res.data) {
        setTodayAttendance(res.data);
        const br = res.data.breaks || [];
        const active =
          res.has_active_break ??
          res.data.has_active_break ??
          br.some((b) => breakStart(b) && !breakEnd(b));
        setTodayHasActiveBreak(!!active);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTasks = useCallback(async (currentPage = 1) => {
    if (currentPage === 1) setLoading(true);
    try {
      const res = await apiRequest(
        `/tasks?page=${currentPage}&per_page=50`
      );

      const unwrap = (r) => {
        if (!r) return { list: [], meta: null };
        // Laravel paginator JSON: { data: [...tasks], meta: { current_page, last_page, total } }
        if (Array.isArray(r.data) && r.meta && typeof r.meta === "object") {
          const m = r.meta;
          return {
            list: r.data,
            meta: {
              current_page: m.current_page ?? 1,
              last_page: m.last_page ?? 1,
              total: m.total ?? r.data.length,
            },
          };
        }
        const ok =
          r.status === true ||
          r.status === "success" ||
          r.success === true ||
          r.data != null;
        if (!ok && !r.data && !Array.isArray(r)) {
          return { list: [], meta: null };
        }
        const d = r.data;
        // Wrapped paginator: { data: { data: [...], current_page, ... } }
        if (d && Array.isArray(d.data)) {
          return {
            list: d.data,
            meta: {
              current_page: d.current_page ?? 1,
              last_page: d.last_page ?? 1,
              total: d.total ?? d.data.length,
            },
          };
        }
        // Bare array under data
        if (Array.isArray(d)) {
          return {
            list: d,
            meta: {
              current_page: 1,
              last_page: 1,
              total: d.length,
            },
          };
        }
        // Some APIs: { data: { tasks: [...] } }
        if (d?.tasks && Array.isArray(d.tasks)) {
          return {
            list: d.tasks,
            meta: {
              current_page: d.current_page ?? 1,
              last_page: d.last_page ?? 1,
              total: d.total ?? d.tasks.length,
            },
          };
        }
        return { list: [], meta: null };
      };

      const { list, meta: m } = unwrap(res);
      if (list.length > 0 || m) {
        setMasterTasks(list);
        setMeta(
          m ?? {
            current_page: 1,
            last_page: 1,
            total: list.length,
          }
        );
      } else {
        setMasterTasks([]);
        setMeta({ current_page: 1, last_page: 1, total: 0 });
        if (res && res.status !== undefined && res.status !== true && res.status !== "success") {
          console.warn("[Tasks] Unexpected API shape:", res);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not load tasks");
      setMasterTasks([]);
    } finally {
      if (currentPage === 1) setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const r = await getCurrentUser();
      if (!r.success) {
        logoutSession();
        navigate("/login");
        return;
      }
      setUser(r.data);
    })();
  }, [navigate]);

  useEffect(() => {
    fetchTasks(page);
  }, [page, fetchTasks]);

  useEffect(() => {
    loadTodayAttendance();
  }, [loadTodayAttendance]);

  useEffect(() => {
    const onAttendanceChanged = () => loadTodayAttendance();
    window.addEventListener("collabflow:attendance-changed", onAttendanceChanged);
    return () => {
      window.removeEventListener("collabflow:attendance-changed", onAttendanceChanged);
    };
  }, [loadTodayAttendance]);

  useEffect(() => {
    const id = setInterval(loadTodayAttendance, 120000);
    const onFocus = () => loadTodayAttendance();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadTodayAttendance]);

  useEffect(() => {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return;

    let u;
    try {
      u = JSON.parse(rawUser);
    } catch {
      return;
    }
    if (!u?.id) return;

    const echo = getEcho();
    if (!echo) return;

    const channel = `user.${u.id}`;

    echo.private(channel).listen(".task.assigned", (e) => {
      const task = e.task;
      if (!task?.id) return;

      setMasterTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev;
        const col = normalizeColumn(task);
        return [...prev, { ...task, status: COLUMN_TO_API[col] }];
      });

      window.dispatchEvent(
        new CustomEvent("collabflow:task-assigned", {
          detail: { task },
        })
      );

      showAppNotification({
        title: "New Task Assigned",
        body: task.title,
        toastMessage: `New task: ${task.title}`,
        toastOptions: { duration: 6000 },
      }).catch(() => {});
    });

    return () => {
      try {
        echo.leave(channel);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const handleLogout = () => {
    logoutSession();
    navigate("/login");
  };

  const patchTaskStatus = async (taskId, columnId) => {
    const status = COLUMN_TO_API[columnId];
    await apiRequest(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  };

  /** Merge sortable column updates without dropping tasks hidden by filters. */
  const mergeColumn = useCallback(
    (columnId, newList) => {
      setMasterTasks((prev) => {
        const visibleInColumn = filteredTasks.filter(
          (t) => normalizeColumn(t) === columnId
        );
        const visibleIdSet = new Set(visibleInColumn.map((t) => t.id));

        const hiddenInColumn = prev.filter(
          (t) =>
            normalizeColumn(t) === columnId && !visibleIdSet.has(t.id)
        );

        const withoutColumn = prev.filter(
          (t) => normalizeColumn(t) !== columnId
        );
        const mapped = newList.map((t) => ({
          ...t,
          status: COLUMN_TO_API[columnId],
        }));
        return [...withoutColumn, ...hiddenInColumn, ...mapped];
      });
    },
    [filteredTasks]
  );

  const columnSetters = useMemo(
    () => ({
      todo: (newList) => mergeColumn("todo", newList),
      pending: (newList) => mergeColumn("pending", newList),
      in_progress: (newList) => mergeColumn("in_progress", newList),
      review: (newList) => mergeColumn("review", newList),
      blocked: (newList) => mergeColumn("blocked", newList),
      completed: (newList) => mergeColumn("completed", newList),
    }),
    [mergeColumn]
  );

  const lastDragRef = useRef({ key: "", t: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id;
      const overId = over.id;

      if (idsEqual(activeId, overId)) return;

      const findContainer = (id) => {
        for (const c of COLUMNS) {
          if (columns[c.id].some((t) => idsEqual(t.id, id))) return c.id;
        }
        return undefined;
      };

      const activeContainer = findContainer(activeId);
      const overContainer =
        COLUMNS.find((c) => c.id === overId)?.id ?? findContainer(overId);

      if (!activeContainer || !overContainer) return;

      if (activeContainer === overContainer) {
        const items = columns[activeContainer];
        const oldIndex = items.findIndex((t) => idsEqual(t.id, activeId));
        const newIndex = items.findIndex((t) => idsEqual(t.id, overId));
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          columnSetters[activeContainer](
            arrayMove(items, oldIndex, newIndex)
          );
        }
        return;
      }

      const sourceItems = [...columns[activeContainer]];
      const destItems = [...columns[overContainer]];
      const fromIdx = sourceItems.findIndex((t) =>
        idsEqual(t.id, activeId)
      );
      if (fromIdx === -1) return;
      const [moved] = sourceItems.splice(fromIdx, 1);
      const updated = { ...moved, status: COLUMN_TO_API[overContainer] };

      const droppedOnColumn =
        idsEqual(overId, overContainer) ||
        COLUMNS.some((c) => c.id === overId);

      if (droppedOnColumn) {
        destItems.push(updated);
      } else {
        const destIdx = destItems.findIndex((t) =>
          idsEqual(t.id, overId)
        );
        if (destIdx >= 0) {
          destItems.splice(destIdx, 0, updated);
        } else {
          destItems.push(updated);
        }
      }

      setMasterTasks((prev) => {
        let next = mergeColumnState(
          prev,
          activeContainer,
          sourceItems,
          filteredTasks
        );
        next = mergeColumnState(
          next,
          overContainer,
          destItems,
          filteredTasks
        );
        return next;
      });

      const key = `${updated.id}:${activeContainer}→${overContainer}`;
      const now = Date.now();
      if (
        lastDragRef.current.key === key &&
        now - lastDragRef.current.t < 400
      ) {
        return;
      }
      lastDragRef.current = { key, t: now };

      try {
        await patchTaskStatus(updated.id, overContainer);
        toast.success("Task status saved");
      } catch {
        toast.error("Could not save status — reverted");
        fetchTasks(page);
      }
    },
    [columns, columnSetters, filteredTasks, fetchTasks, page]
  );

  const addTaskPlaceholder = (columnId) => {
    toast(`Add task to ${columnId} from your admin`, { icon: "ℹ️" });
  };

  const handleTaskPatched = useCallback((id, patch) => {
    setMasterTasks((prev) =>
      prev.map((t) => (idsEqual(t.id, id) ? { ...t, ...patch } : t))
    );
  }, []);

  return (
    <AppLayout
      user={user}
      onLogout={handleLogout}
      loading={loading && page === 1}
      loadingLabel="Loading tasks…"
      showWorkdayBar={
        <WorkdayStatusBar
          isCheckedIn={todayAttendance?.check_in != null}
          isCheckedOut={todayAttendance?.check_out != null}
          hasActiveBreak={todayHasActiveBreak}
          breaks={todayAttendance?.breaks || []}
          variant="compact"
        />
      }
      noPadding
      mainClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <TaskDetailDrawer
        taskId={detailTaskId}
        open={detailTaskId != null}
        onClose={() => setDetailTaskId(null)}
        onTaskPatched={handleTaskPatched}
      />

        <div className="tasks-toolbar">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="page-header-eyebrow">Workspace</p>
              <h1 className="text-2xl font-bold tracking-tight theme-text sm:text-3xl">
                Tasks
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    viewMode === "list"
                      ? "glass-btn glass-btn-primary !py-2 !px-3"
                      : "text-glass-muted hover:text-white"
                  }`}
                >
                  <FaListUl className="text-xs" />
                  List view
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("board")}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    viewMode === "board"
                      ? "glass-btn glass-btn-primary !py-2 !px-3"
                      : "text-glass-muted hover:text-white"
                  }`}
                >
                  <FaThLarge className="text-xs" />
                  Board
                </button>
              </div>

              <GlassButton
                type="button"
                onClick={() => navigate("/tasks/create")}
                className="inline-flex items-center gap-2"
              >
                <FaPlus className="text-xs" />
                New task
              </GlassButton>
            </div>
          </div>

            <div className="tasks-filter-card">
              <div className="tasks-filter-row">
                <div className="tasks-filter-tabs">
                  {["all", "my", "overdue"].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilterTab(tab)}
                      className={`tasks-filter-pill ${
                        filterTab === tab ? "tasks-filter-pill-active" : ""
                      }`}
                    >
                      {tab === "all"
                        ? "All"
                        : tab === "my"
                          ? "My tasks"
                          : "Overdue"}
                    </button>
                  ))}
                </div>

                <div className="tasks-filter-search">
                  <FaSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-glass-subtle" />
                  <input
                    type="search"
                    placeholder="Search tasks…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="glass-input w-full"
                  />
                </div>

                <div className="tasks-filter-dropdowns">
                  <select
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                    className="tasks-filter-select"
                    aria-label="Filter by assignee"
                  >
                    <option value="all">All assignees</option>
                    {assigneeOptions.map(([id, name]) => (
                      <option key={id} value={String(id)}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="tasks-filter-select"
                    aria-label="Filter by priority"
                  >
                    <option value="all">Priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>

                  <select
                    value={dueFilter}
                    onChange={(e) => setDueFilter(e.target.value)}
                    className="tasks-filter-select"
                    aria-label="Filter by due date"
                  >
                    <option value="all">Due</option>
                    <option value="today">Today</option>
                    <option value="week">This week</option>
                    <option value="none">No due date</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Board or List */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2 pt-2 sm:px-4">
            {viewMode === "list" ? (
              <div className="flex-1 overflow-auto glass-card !p-0 overflow-hidden">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white/5 text-glass-muted border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Task</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Priority</th>
                      <th className="px-4 py-3 font-semibold text-center">
                        Sub
                      </th>
                      <th className="px-4 py-3 font-semibold text-center">
                        Cmt
                      </th>
                      <th className="px-4 py-3 font-semibold text-center">
                        Files
                      </th>
                      <th className="px-4 py-3 font-semibold">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredTasks.map((task) => (
                      <tr
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailTaskId(task.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDetailTaskId(task.id);
                          }
                        }}
                        className="cursor-pointer hover:bg-white/5"
                      >
                        <td className="px-4 py-3 font-medium theme-text">
                          {task.title || "Untitled"}
                        </td>
                        <td className="px-4 py-3 text-glass-muted capitalize">
                          {normalizeColumn(task).replace("_", " ")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityClass(task)}`}
                          >
                            {priorityLabel(task)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-glass-muted">
                          {task.subtasks_count ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-glass-muted">
                          {task.comments_count ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-glass-muted">
                          {task.attachments_count ?? 0}
                        </td>
                        <td className="px-4 py-3 text-glass-muted">
                          {formatDue(task.due_date) || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredTasks.length === 0 && (
                  <p className="py-12 text-center text-glass-muted text-sm">
                    No tasks match your filters.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-gutter:stable]">
                <DndContext
                  sensors={sensors}
                  collisionDetection={kanbanCollisionDetection}
                  onDragStart={({ active }) => setActiveDragId(active.id)}
                  onDragEnd={(e) => {
                    handleDragEnd(e);
                    setActiveDragId(null);
                  }}
                  onDragCancel={() => setActiveDragId(null)}
                >
                  <div className="flex h-full min-h-[calc(100dvh-13.5rem)] w-max gap-3 pr-1 sm:gap-4">
                    {COLUMNS.map((col) => (
                      <KanbanBoardColumn
                        key={col.id}
                        col={col}
                        tasks={columns[col.id]}
                        onAdd={addTaskPlaceholder}
                        onTaskClick={(t) => setDetailTaskId(t.id)}
                      />
                    ))}
                  </div>
                  <DragOverlay
                    dropAnimation={{
                      duration: 240,
                      easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                    }}
                    style={{ zIndex: 9999 }}
                  >
                    {activeDragTask ? (
                      <KanbanTaskDragOverlay task={activeDragTask} />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            )}

            {meta.last_page > 1 && (
              <div className="pt-4 border-t border-white/10 shrink-0">
                <Pagination
                  currentPage={meta.current_page}
                  totalPages={meta.last_page}
                  onPageChange={setPage}
                />
              </div>
            )}
          </div>
    </AppLayout>
  );
}
