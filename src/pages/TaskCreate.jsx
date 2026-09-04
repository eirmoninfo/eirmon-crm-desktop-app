import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Check, ListTodo, Paperclip, Search, X } from "lucide-react";
import { apiRequest } from "../api/http";
import { getCurrentUser } from "../api/auth.api";
import { createTask, fetchTaskCreateData, uploadTaskAttachment } from "../api/tasks.api";
import AppLayout from "../components/layout/AppLayout";
import { GlassButton, PageHeader } from "../components/glass/Glass";
import WorkdayStatusBar from "../components/WorkdayStatusBar";
import { breakStart, breakEnd } from "../utils/breakTime";
import { logoutSession } from "../utils/sessionLogout";

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUSES = [
  { value: "todo", label: "Todo" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

const ASSIGNEE_TYPES = [
  { value: "user", label: "User" },
  { value: "team", label: "Team" },
];

const fieldClass = "glass-input mt-1.5 w-full";
const selectClass = "glass-select mt-1.5 w-full";
const labelClass = "glass-field text-sm font-medium";

function extractCreatePayload(res) {
  // API: { status: true, projects, users, teams }
  // Also tolerate nested { data: { projects } } shapes.
  const roots = [res, res?.data, res?.data?.data].filter(Boolean);
  let projects = [];
  let users = [];
  let teams = [];

  for (const root of roots) {
    if (!projects.length && Array.isArray(root.projects)) projects = root.projects;
    if (!users.length && Array.isArray(root.users)) users = root.users;
    if (!teams.length && Array.isArray(root.teams)) teams = root.teams;
  }

  return { projects, users, teams };
}

function unwrapProjectsList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.projects)) return res.projects;
  const d = res.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.projects)) return d.projects;
  return [];
}

function errToast(e, fallback) {
  const msg = e?.message || fallback;
  if (e?.errors && typeof e.errors === "object") {
    const first = Object.values(e.errors).flat()[0];
    if (first) {
      toast.error(String(first));
      return;
    }
  }
  toast.error(msg);
}

function userInitials(name, email) {
  const src = name || email || "?";
  const parts = String(src).trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

export default function TaskCreate() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [parentTasks, setParentTasks] = useState([]);
  const [userSearch, setUserSearch] = useState("");

  const [form, setForm] = useState({
    project_id: "",
    parent_task_id: "",
    title: "",
    description: "",
    assignee_type: "user",
    team_id: "",
    due_date: "",
    estimated_hours: "",
    priority: "medium",
    status: "pending",
  });
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const prefilledAssignee = useRef(false);

  const [todayAttendance, setTodayAttendance] = useState(null);
  const [todayHasActiveBreak, setTodayHasActiveBreak] = useState(false);

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

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      let projs = [];
      let usr = [];
      let tms = [];

      try {
        const res = await fetchTaskCreateData();
        const ex = extractCreatePayload(res);
        projs = ex.projects;
        usr = ex.users;
        tms = ex.teams;
      } catch {
        /* use fallbacks below */
      }

      if (usr.length === 0) {
        try {
          const ures = await apiRequest("/users/company");
          usr = ures?.data ?? ures?.users ?? [];
          if (!Array.isArray(usr)) usr = [];
        } catch {
          usr = [];
        }
      }

      if (projs.length === 0) {
        try {
          const pres = await apiRequest("/projects?page=1&per_page=100");
          projs = unwrapProjectsList(pres);
        } catch {
          projs = [];
        }
      }

      setProjects(projs);
      setUsers(usr);
      setTeams(tms);

      if (projs.length === 0) {
        toast.error("No projects available. Ask an admin to add a project or grant project access.");
      }
    } catch (e) {
      errToast(e, "Could not load form data");
    } finally {
      setLoading(false);
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
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    loadTodayAttendance();
  }, [loadTodayAttendance]);

  useEffect(() => {
    if (prefilledAssignee.current) return;
    const id = user?.user?.id ?? user?.data?.user?.id ?? user?.data?.id ?? user?.id;
    if (!id || users.length === 0) return;
    prefilledAssignee.current = true;
    setSelectedUserIds([Number(id)]);
  }, [user, users]);

  useEffect(() => {
    const onAttendanceChanged = () => loadTodayAttendance();
    window.addEventListener("collabflow:attendance-changed", onAttendanceChanged);
    return () => {
      window.removeEventListener("collabflow:attendance-changed", onAttendanceChanged);
    };
  }, [loadTodayAttendance]);

  const projectId = form.project_id;

  useEffect(() => {
    if (!projectId) {
      setParentTasks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest(
          `/tasks?page=1&per_page=100&project_id=${encodeURIComponent(projectId)}`
        );
        const pag = res?.data;
        let list = Array.isArray(pag?.data) ? pag.data : [];
        if (list.length === 0) {
          const res2 = await apiRequest(`/tasks?page=1&per_page=100`);
          const p2 = res2?.data;
          list = Array.isArray(p2?.data) ? p2.data : [];
          list = list.filter(
            (t) =>
              String(t.project_id ?? t.project?.id ?? "") === String(projectId)
          );
        }
        if (!cancelled) setParentTasks(list);
      } catch {
        if (!cancelled) setParentTasks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const toggleUser = (id) => {
    const n = Number(id);
    setSelectedUserIds((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  };

  const buildPayload = () => {
    const project_id = form.project_id ? Number(form.project_id) : null;
    const parent_task_id = form.parent_task_id
      ? Number(form.parent_task_id)
      : null;
    const estimated_hours = form.estimated_hours
      ? parseFloat(form.estimated_hours)
      : null;

    const base = {
      project_id,
      parent_id: parent_task_id,
      title: form.title.trim(),
      description: form.description?.trim() || null,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      estimated_hours:
        estimated_hours != null && !Number.isNaN(estimated_hours)
          ? estimated_hours
          : null,
      assign_type: form.assignee_type,
    };

    if (form.assignee_type === "user") {
      base.assigned_users = selectedUserIds;
    } else if (form.assignee_type === "team" && form.team_id) {
      base.team_id = Number(form.team_id);
    }

    return base;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.project_id) {
      toast.error("Please select a project");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Please enter a task title");
      return;
    }
    if (form.assignee_type === "user" && selectedUserIds.length === 0) {
      toast.error("Select at least one user to assign");
      return;
    }
    if (form.assignee_type === "team" && !form.team_id) {
      toast.error("Please select a team");
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      const res = await createTask(payload);
      const created = Array.isArray(res?.tasks)
        ? res.tasks
        : res?.task
          ? [res.task]
          : [];
      if (pendingFiles.length > 0 && created.length > 0) {
        for (const task of created) {
          if (!task?.id) continue;
          for (const file of pendingFiles) {
            await uploadTaskAttachment(task.id, file);
          }
        }
      }
      if (res?.status === true || res?.status === "success" || res?.task || created.length) {
        toast.success(res?.message || "Task created. Assignees were notified.");
        const firstId = created[0]?.id;
        navigate(firstId ? `/tasks?task=${firstId}` : "/tasks");
        return;
      }
      toast.success("Task created");
      navigate("/tasks");
    } catch (err) {
      errToast(err, "Could not create task");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logoutSession();
    navigate("/login");
  };

  const assignerName =
    user?.user?.name ?? user?.data?.user?.name ?? user?.data?.name ?? user?.name ?? "You";
  const selectedPeople = users.filter((u) =>
    selectedUserIds.includes(Number(u.id ?? u.user_id))
  );
  const selectedTeam = teams.find((tm) => String(tm.id) === String(form.team_id));

  const projectOptions = useMemo(() => {
    return projects.map((p) => ({
      id: p.id,
      label: p.title ?? p.name ?? `Project ${p.id}`,
    }));
  }, [projects]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = String(u.name ?? "").toLowerCase();
      const email = String(u.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, userSearch]);

  return (
    <AppLayout
      user={user}
      onLogout={handleLogout}
      loading={loading}
      loadingLabel="Loading task form…"
      showWorkdayBar={
        <WorkdayStatusBar
          isCheckedIn={todayAttendance?.check_in != null}
          isCheckedOut={todayAttendance?.check_out != null}
          hasActiveBreak={todayHasActiveBreak}
          breaks={todayAttendance?.breaks || []}
          variant="compact"
        />
      }
    >
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title="Create task"
          subtitle="Assign work, attach files, and notify people in real time"
          actions={
            <Link
              to="/tasks"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-glass-muted transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to tasks
            </Link>
          }
        />

        <form onSubmit={handleSubmit} className="glass-card space-y-8 !p-6 sm:!p-8">
          <section>
            <h2 className="form-section-title">Project</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                <span>
                  Project <span className="text-[#ff6961]">*</span>
                </span>
                <select
                  required
                  value={form.project_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      project_id: e.target.value,
                      parent_task_id: "",
                    }))
                  }
                  className={selectClass}
                >
                  <option value="">Select project</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass}>
                <span>Parent task (optional)</span>
                <select
                  value={form.parent_task_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      parent_task_id: e.target.value,
                    }))
                  }
                  className={selectClass}
                >
                  <option value="">None</option>
                  {parentTasks.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.title || `Task #${t.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section>
            <h2 className="form-section-title">Details</h2>
            <div className="space-y-4">
              <label className={labelClass}>
                <span>
                  Task title <span className="text-[#ff6961]">*</span>
                </span>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="e.g. Fix login bug"
                  className={fieldClass}
                />
              </label>

              <label className={labelClass}>
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={4}
                  placeholder="Add details…"
                  className={`${fieldClass} resize-y`}
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="form-section-title">Assignment</h2>
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-glass-muted">
              <p>
                Assigned by{" "}
                <span className="font-semibold text-white">{assignerName}</span>
              </p>
              <p className="mt-1 text-xs text-glass-subtle">
                {form.assignee_type === "team"
                  ? selectedTeam
                    ? `Team ${selectedTeam.name} will be notified.`
                    : "Select a team to notify members."
                  : selectedPeople.length
                    ? `Notifying ${selectedPeople.map((p) => p.name || p.email).join(", ")}.`
                    : "Select at least one person. They get a desktop notification instantly."}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                <span>
                  Assign task to <span className="text-[#ff6961]">*</span>
                </span>
                <select
                  value={form.assignee_type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      assignee_type: e.target.value,
                    }))
                  }
                  className={`${selectClass} capitalize`}
                >
                  {ASSIGNEE_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>

              {form.assignee_type === "team" && (
                <label className={labelClass}>
                  <span>
                    Team <span className="text-[#ff6961]">*</span>
                  </span>
                  <select
                    value={form.team_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, team_id: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="">Select team</option>
                    {teams.map((tm) => (
                      <option key={tm.id} value={String(tm.id)}>
                        {tm.name ?? `Team ${tm.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {form.assignee_type === "user" && (
              <div className="mt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white/85">
                    Select users <span className="text-[#ff6961]">*</span>
                    {selectedUserIds.length > 0 ? (
                      <span className="ml-2 glass-badge-blue text-[10px]">
                        {selectedUserIds.length} selected
                      </span>
                    ) : null}
                  </p>
                  <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-glass-subtle" />
                    <input
                      type="search"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search people…"
                      className="glass-input w-full py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                </div>

                <div className="glass-card-sm max-h-56 overflow-y-auto !rounded-2xl !p-3">
                  {users.length === 0 ? (
                    <p className="text-sm text-glass-muted">
                      No users loaded. Check API access.
                    </p>
                  ) : filteredUsers.length === 0 ? (
                    <p className="text-sm text-glass-muted">No users match your search.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {filteredUsers.map((u) => {
                        const id = u.id ?? u.user_id;
                        const selected = selectedUserIds.includes(Number(id));
                        const name = u.name ?? u.email ?? `User ${id}`;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleUser(id)}
                            className={`user-chip ${selected ? "user-chip-selected" : ""}`}
                          >
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{
                                background: selected
                                  ? "linear-gradient(135deg, #0a84ff, #5e5ce6)"
                                  : "rgb(255 255 255 / 0.12)",
                              }}
                            >
                              {selected ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                userInitials(u.name, u.email)
                              )}
                            </span>
                            <span className="min-w-0 text-left">
                              <span className="block max-w-[140px] truncate font-medium">
                                {name}
                              </span>
                              {u.email && u.name ? (
                                <span className="block max-w-[140px] truncate text-[10px] text-glass-subtle">
                                  {u.email}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="form-section-title">Attachments</h2>
            <p className="mb-3 text-xs text-glass-subtle">
              Files are attached to the new task so assignees see them immediately.
            </p>
            <label className="glass-card-sm flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed px-4 py-6 text-center text-sm text-glass-muted">
              <Paperclip className="h-4 w-4" />
              <span>Add files (optional, 15 MB each)</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const next = Array.from(e.target.files || []);
                  setPendingFiles((prev) => [...prev, ...next]);
                  e.target.value = "";
                }}
              />
            </label>
            {pendingFiles.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {pendingFiles.map((file, idx) => (
                  <li
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-white/90">{file.name}</span>
                    <button
                      type="button"
                      className="rounded-lg p-1 text-glass-subtle hover:text-white"
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section>
            <h2 className="form-section-title">Schedule</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                <span>Due date</span>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, due_date: e.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className={labelClass}>
                <span>Estimated hours</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.estimated_hours}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      estimated_hours: e.target.value,
                    }))
                  }
                  placeholder="2.5"
                  className={fieldClass}
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="form-section-title">Priority & status</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                <span>
                  Priority <span className="text-[#ff6961]">*</span>
                </span>
                <select
                  required
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: e.target.value }))
                  }
                  className={`${selectClass} capitalize`}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                <span>
                  Status <span className="text-[#ff6961]">*</span>
                </span>
                <select
                  required
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                  className={`${selectClass} capitalize`}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-6">
            <Link
              to="/tasks"
              className="glass-btn glass-btn-secondary rounded-2xl px-5 py-2.5 text-sm font-semibold"
            >
              Cancel
            </Link>
            <GlassButton type="submit" disabled={submitting}>
              <ListTodo className="h-4 w-4" />
              {submitting ? "Creating…" : "Create task"}
            </GlassButton>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
