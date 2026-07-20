import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FaPaperclip, FaTimes } from "react-icons/fa";
import { apiRequest } from "../../api/http";
import {
  createSubtask,
  fetchTaskDetail,
  patchTask,
  postTaskComment,
  resolveAttachmentUrl,
  uploadTaskAttachment,
} from "../../api/tasks.api";
import { getEcho } from "../../utils/echo";

const COLUMN_OPTIONS = [
  { id: "todo", label: "Todo" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "blocked", label: "Blocked" },
  { id: "completed", label: "Completed" },
];

const PRIORITY_OPTIONS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

function errToast(e, fallback) {
  const msg =
    e?.message ||
    (typeof e === "string" ? e : fallback);
  toast.error(msg);
}

function formatErrors(e) {
  if (!e?.errors || typeof e.errors !== "object") return null;
  const lines = Object.entries(e.errors).flatMap(([k, v]) => {
    const arr = Array.isArray(v) ? v : [v];
    return arr.map((x) => `${k}: ${x}`);
  });
  return lines.join("\n");
}

function toDateInputValue(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function normalizePriority(p) {
  const s = String(p ?? "medium").toLowerCase();
  if (["urgent", "high", "low", "medium"].includes(s)) return s;
  return "medium";
}

function normalizeStatus(task) {
  const raw = task?.status ?? task?.state ?? "todo";
  const s = String(raw).toLowerCase().replace(/[\s-]+/g, "_");
  if (["completed", "done", "closed", "resolved"].includes(s)) return "completed";
  if (["review", "in_review"].includes(s)) return "review";
  if (["blocked", "block", "on_hold"].includes(s)) return "blocked";
  if (
    ["in_progress", "inprogress", "doing", "active", "started", "progress"].includes(
      s
    )
  )
    return "in_progress";
  if (["pending", "waiting"].includes(s)) return "pending";
  const found = COLUMN_OPTIONS.find((c) => c.id === s);
  return found ? found.id : "todo";
}

function snapshotFromTask(t) {
  if (!t) return {};
  const assignee =
    t.assigned_to_id ??
    t.assignee_id ??
    t.assignee?.id ??
    t.user_id ??
    "";
  return {
    title: t.title ?? "",
    description: t.description ?? "",
    priority: normalizePriority(t.priority ?? t.priority_level),
    status: normalizeStatus(t),
    due_date: toDateInputValue(t.due_date ?? t.due_date_raw),
    assigned_to: assignee === "" ? "" : Number(assignee),
  };
}

function buildPatch(before, after) {
  const patch = {};
  if (before.title !== after.title) patch.title = after.title;
  if (before.description !== after.description)
    patch.description = after.description;
  if (before.priority !== after.priority) patch.priority = after.priority;
  if (before.status !== after.status) patch.status = after.status;
  if (before.due_date !== after.due_date) {
    patch.due_date = after.due_date || null;
  }
  const b = before.assigned_to === "" ? null : Number(before.assigned_to);
  const a = after.assigned_to === "" ? null : Number(after.assigned_to);
  if (b !== a) patch.assigned_to = a;
  return patch;
}

export default function TaskDetailDrawer({
  taskId,
  open,
  onClose,
  onTaskPatched,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [task, setTask] = useState(null);
  const [draft, setDraft] = useState(() => snapshotFromTask(null));
  const baselineRef = useRef(null);

  const [commentBody, setCommentBody] = useState("");
  const [commentSending, setCommentSending] = useState(false);

  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskPriority, setSubtaskPriority] = useState("medium");
  const [subtaskStatus, setSubtaskStatus] = useState("todo");
  const [subtaskCreating, setSubtaskCreating] = useState(false);

  const [uploadPct, setUploadPct] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [users, setUsers] = useState([]);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const loadTask = useCallback(async () => {
    if (taskId == null) return;
    setLoading(true);
    try {
      const res = await fetchTaskDetail(taskId);
      const t = res.task ?? res.data?.task ?? res.data;
      if (!t?.id) {
        toast.error("Task not found");
        onClose();
        return;
      }
      setTask(t);
      const snap = snapshotFromTask(t);
      setDraft(snap);
      baselineRef.current = { ...snap };
    } catch (e) {
      if (e?.status === 403) toast.error("You don’t have access to this task");
      else errToast(e, "Could not load task");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [taskId, onClose]);

  useEffect(() => {
    if (!open || taskId == null) {
      setTask(null);
      setCommentBody("");
      setUploadPct(null);
      return;
    }
    loadTask();
  }, [open, taskId, loadTask]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await apiRequest("/users/company");
        const list = res?.data ?? res?.users ?? [];
        setUsers(Array.isArray(list) ? list : []);
      } catch {
        setUsers([]);
      }
    })();
  }, [open]);

  const assigneeOptions = useMemo(() => {
    const opts = [];
    const seen = new Set();
    if (task) {
      const id =
        task.assigned_to_id ??
        task.assignee_id ??
        task.assignee?.id ??
        task.user_id;
      const name =
        task.assignee?.name ??
        task.assignee_name ??
        task.user?.name;
      if (id != null && name) {
        seen.add(Number(id));
        opts.push({ id: Number(id), name });
      }
    }
    for (const u of users) {
      const id = u.id ?? u.user_id;
      const name = u.name ?? u.email ?? `User ${id}`;
      if (id != null && !seen.has(Number(id))) {
        seen.add(Number(id));
        opts.push({ id: Number(id), name });
      }
    }
    return opts;
  }, [users, task]);

  const mergeIntoMaster = useCallback(
    (partial) => {
      if (taskId != null && typeof onTaskPatched === "function") {
        onTaskPatched(taskId, partial);
      }
    },
    [taskId, onTaskPatched]
  );

  // Real-time task chat
  useEffect(() => {
    if (!open || taskId == null) return;

    const echo = getEcho();
    if (!echo) return;

    const channelName = `task.${taskId}`;
    const channel = echo.private(channelName);

    const onComment = (payload) => {
      const c = payload?.comment ?? payload;
      if (!c?.id) return;

      setTask((prev) => {
        if (!prev) return prev;
        const existing = prev.comments || [];
        if (existing.some((x) => Number(x.id) === Number(c.id))) {
          return prev;
        }
        const nextCount = (prev.comments_count ?? existing.length) + 1;
        mergeIntoMaster({ comments_count: nextCount });
        return {
          ...prev,
          comments: [...existing, c],
          comments_count: nextCount,
        };
      });
    };

    channel.listen(".task.comment.created", onComment);
    channel.listen("task.comment.created", onComment);

    return () => {
      try {
        channel.stopListening(".task.comment.created");
        channel.stopListening("task.comment.created");
        echo.leave(channelName);
      } catch {
        /* ignore */
      }
    };
  }, [open, taskId, mergeIntoMaster]);

  const handleSave = async () => {
    if (taskId == null || !baselineRef.current) return;
    const patch = buildPatch(baselineRef.current, draft);
    if (Object.keys(patch).length === 0) {
      toast.success("No changes to save");
      return;
    }
    setSaving(true);
    try {
      const res = await patchTask(taskId, patch);
      const updated = res.task ?? res.data?.task ?? res.data ?? null;
      if (updated) {
        setTask(updated);
        const snap = snapshotFromTask(updated);
        setDraft(snap);
        baselineRef.current = { ...snap };
        mergeIntoMaster({
          title: updated.title,
          description: updated.description,
          priority: updated.priority ?? updated.priority_level,
          status: updated.status,
          due_date: updated.due_date,
          assignee_id: updated.assignee_id ?? updated.assigned_to_id,
          assignee: updated.assignee,
          comments_count: updated.comments_count,
          attachments_count: updated.attachments_count,
          subtasks_count: updated.subtasks_count,
          subtasks_done: updated.subtasks_done,
        });
      } else {
        await loadTask();
      }
      toast.success("Changes saved");
    } catch (e) {
      const extra = formatErrors(e);
      if (e?.status === 403) toast.error("Forbidden");
      else toast.error(extra || e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleSendComment = async (e) => {
    e.preventDefault();
    const body = commentBody.trim();
    if (!body || taskId == null) return;
    if (body.length > 5000) {
      toast.error("Comment is too long (max 5000 characters)");
      return;
    }
    setCommentSending(true);
    try {
      const res = await postTaskComment(taskId, body);
      const c = res.comment ?? res.data?.comment;
      const nextCount = (task?.comments_count ?? 0) + 1;
      mergeIntoMaster({ comments_count: nextCount });
      setTask((prev) => {
        if (!prev) return prev;
        const nextComments = [...(prev.comments || []), c].filter(Boolean);
        return {
          ...prev,
          comments: nextComments,
          comments_count: nextCount,
        };
      });
      setCommentBody("");
      toast.success("Comment added");
    } catch (err) {
      const extra = formatErrors(err);
      if (err?.status === 403) toast.error("Forbidden");
      else toast.error(extra || err?.message || "Could not add comment");
    } finally {
      setCommentSending(false);
    }
  };

  const handleAddSubtask = async (e) => {
    e.preventDefault();
    const title = subtaskTitle.trim();
    if (!title || taskId == null) return;
    setSubtaskCreating(true);
    try {
      const res = await createSubtask(taskId, {
        title,
        priority: subtaskPriority,
        status: subtaskStatus,
      });
      const st = res.subtask ?? res.data?.subtask;
      const nextList = [...(task?.subtasks || []), st].filter(Boolean);
      const nextTotal = (task?.subtasks_count ?? 0) + 1;
      const nextDone = nextList.filter((s) =>
        ["review", "done", "completed", "closed", "resolved"].includes(
          String(s.status ?? "")
            .toLowerCase()
            .replace(/[\s-]+/g, "_")
        )
      ).length;
      mergeIntoMaster({
        subtasks_count: nextTotal,
        subtasks_done: nextDone,
      });
      setTask((prev) => {
        if (!prev) return prev;
        const list = [...(prev.subtasks || []), st].filter(Boolean);
        const count = (prev.subtasks_count ?? 0) + 1;
        const done = list.filter((s) =>
          ["review", "done", "completed", "closed", "resolved"].includes(
            String(s.status ?? "")
              .toLowerCase()
              .replace(/[\s-]+/g, "_")
          )
        ).length;
        return {
          ...prev,
          subtasks: list,
          subtasks_count: count,
          subtasks_done: done,
        };
      });
      setSubtaskTitle("");
      toast.success("Subtask created");
    } catch (err) {
      const extra = formatErrors(err);
      if (err?.status === 403) toast.error("Forbidden");
      else toast.error(extra || err?.message || "Could not create subtask");
    } finally {
      setSubtaskCreating(false);
    }
  };

  const patchSubtaskStatus = async (subtaskId, status) => {
    try {
      const res = await patchTask(subtaskId, { status });
      const updated = res.task ?? res.data?.task ?? res.data ?? { status };
      setTask((prev) => {
        if (!prev?.subtasks) return prev;
        const list = prev.subtasks.map((s) =>
          s.id == subtaskId ? { ...s, ...updated } : s
        );
        const done = list.filter((s) =>
          ["review", "done", "completed", "closed", "resolved"].includes(
            String(s.status ?? "")
              .toLowerCase()
              .replace(/[\s-]+/g, "_")
          )
        ).length;
        return {
          ...prev,
          subtasks: list,
          subtasks_done: done,
        };
      });
      toast.success("Subtask updated");
    } catch (err) {
      if (err?.status === 403) toast.error("Forbidden");
      else toast.error(err?.message || "Could not update subtask");
    }
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFile = async (fileList) => {
    const file = fileList?.[0];
    if (!file || taskId == null) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File must be 15 MB or smaller");
      return;
    }
    setUploading(true);
    setUploadPct(0);
    try {
      const res = await uploadTaskAttachment(taskId, file, setUploadPct);
      const att = res.attachment ?? res.data?.attachment;
      const nextCount = (task?.attachments_count ?? 0) + 1;
      mergeIntoMaster({ attachments_count: nextCount });
      setTask((prev) => {
        if (!prev) return prev;
        const list = [...(prev.attachments || []), att].filter(Boolean);
        return {
          ...prev,
          attachments: list,
          attachments_count: nextCount,
        };
      });
      toast.success("File uploaded");
    } catch (err) {
      const extra = formatErrors(err);
      if (err?.status === 403) toast.error("Forbidden");
      else toast.error(extra || err?.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("ring-2", "ring-[#0a84ff]");
    handleFile(e.dataTransfer?.files);
  };

  const subtasksDone = task?.subtasks_done ?? 0;
  const subtasksTotal = task?.subtasks_count ?? task?.subtasks?.length ?? 0;
  const progressPct =
    task?.progress_pct != null
      ? Math.round(Number(task.progress_pct))
      : subtasksTotal > 0
        ? Math.round((subtasksDone / subtasksTotal) * 100)
        : 0;

  const projectLabel = useMemo(() => {
    if (!task) return "—";
    return task.project?.title ?? task.project_title ?? task.project_name ?? "—";
  }, [task]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm transition-opacity"
        aria-label="Close task panel"
        onClick={onClose}
      />
      <aside
        className="glass-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
      >
        {loading || !task ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0a84ff] border-t-transparent" />
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <input
                id="task-detail-title"
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.target.value }))
                }
                className="min-w-0 flex-1 border-0 bg-transparent text-xl font-bold text-white outline-none ring-0 placeholder:text-glass-subtle focus:ring-0"
                placeholder="Task title"
              />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={handlePickFile}
                  disabled={uploading}
                  className="rounded-xl p-2 text-glass-muted transition hover:bg-white/8 hover:text-[#64d2ff]"
                  title="Upload attachment"
                >
                  <FaPaperclip className="h-5 w-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    handleFile(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-glass-muted transition hover:bg-white/8 hover:text-white"
                  aria-label="Close"
                >
                  <FaTimes className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <label className="block text-xs font-medium text-glass-subtle">
                Description
              </label>
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
                rows={4}
                className="glass-input mt-1"
                placeholder="Add a description…"
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-glass-subtle">
                  Priority
                  <select
                    value={draft.priority}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, priority: e.target.value }))
                    }
                    className="glass-select mt-1 w-full"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-glass-subtle">
                  Due
                  <input
                    type="date"
                    value={draft.due_date}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, due_date: e.target.value }))
                    }
                    className="glass-input mt-1 w-full"
                  />
                </label>
                <label className="block text-xs font-medium text-glass-subtle">
                  Column
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, status: e.target.value }))
                    }
                    className="glass-select mt-1 w-full capitalize"
                  >
                    {COLUMN_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-glass-subtle">
                  Assignee
                  <select
                    value={draft.assigned_to === "" ? "" : String(draft.assigned_to)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft((d) => ({
                        ...d,
                        assigned_to: v === "" ? "" : Number(v),
                      }));
                    }}
                    className="glass-select mt-1 w-full"
                  >
                    <option value="">—</option>
                    {assigneeOptions.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="mt-3 text-xs text-glass-subtle">
                Project:{" "}
                <span className="font-medium text-white">{projectLabel}</span>
              </p>

              <section className="mt-6 border-t border-white/10 pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">
                    Subtasks ({subtasksDone}/{subtasksTotal})
                  </h3>
                  {subtasksTotal > 0 && (
                    <span className="text-xs text-glass-subtle">
                      {progressPct}% done
                    </span>
                  )}
                </div>
                {(task.subtasks || []).length === 0 ? (
                  <p className="text-sm text-glass-subtle">No subtasks yet.</p>
                ) : (
                  <ul className="mb-3 space-y-2">
                    {(task.subtasks || []).map((st) => (
                      <li
                        key={st.id}
                        className="glass-card-sm flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 font-medium text-glass-muted">
                          {st.title}
                        </span>
                        <select
                          value={normalizeStatus(st)}
                          onChange={(e) =>
                            patchSubtaskStatus(st.id, e.target.value)
                          }
                          className="glass-select py-1 pl-2 pr-7 text-xs capitalize"
                        >
                          {COLUMN_OPTIONS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  onSubmit={handleAddSubtask}
                  className="flex flex-col gap-2 sm:flex-row sm:items-end"
                >
                  <input
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                    placeholder="New subtask title…"
                    className="glass-input min-w-0 flex-1"
                  />
                  <div className="flex gap-2">
                    <select
                      value={subtaskPriority}
                      onChange={(e) => setSubtaskPriority(e.target.value)}
                      className="glass-select"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={subtaskStatus}
                      onChange={(e) => setSubtaskStatus(e.target.value)}
                      className="glass-select capitalize"
                    >
                      {COLUMN_OPTIONS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={subtaskCreating || !subtaskTitle.trim()}
                      className="shrink-0 rounded-xl bg-[#0a84ff] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </section>

              <section className="mt-6 border-t border-white/10 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-white">
                  Attachments
                </h3>
                <div
                  ref={dropRef}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropRef.current?.classList.add("ring-2", "ring-[#0a84ff]");
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    dropRef.current?.classList.remove("ring-2", "ring-[#0a84ff]");
                  }}
                  onDrop={onDrop}
                  className="glass-card-sm border-dashed px-3 py-4 text-center text-xs text-glass-subtle transition"
                >
                  {(task.attachments || []).length === 0 ? (
                    <p>No attachments yet. Drop a file here or use the paperclip.</p>
                  ) : (
                    <ul className="space-y-2 text-left">
                      {(task.attachments || []).map((a) => (
                        <li key={a.id}>
                          <a
                            href={resolveAttachmentUrl(a.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-[#64d2ff] hover:underline"
                          >
                            {a.name || "File"}
                          </a>
                          {a.size != null && (
                            <span className="ml-2 text-xs text-glass-subtle">
                              ({Math.round((a.size / 1024) * 10) / 10} KB)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {uploading && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-[#0a84ff] transition-all"
                          style={{ width: `${uploadPct ?? 0}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-glass-muted">
                        Uploading… {uploadPct ?? 0}%
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="mt-6 border-t border-white/10 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-white">
                  Comments
                </h3>
                {(task.comments || []).length === 0 ? (
                  <p className="text-sm text-glass-subtle">No comments yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {(task.comments || []).map((c) => (
                      <li
                        key={c.id ?? `${c.created_at}-${c.body?.slice(0, 20)}`}
                        className="glass-card-sm px-3 py-2"
                      >
                        <p className="text-xs font-semibold text-glass-muted">
                          {c.user?.name ?? c.user_name ?? "User"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-glass-muted">
                          {c.body}
                        </p>
                        {c.created_at && (
                          <p className="mt-1 text-[10px] text-glass-subtle">
                            {new Date(c.created_at).toLocaleString()}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="glass-btn glass-btn-primary mt-6 w-full disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            <footer className="shrink-0 border-t border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <form onSubmit={handleSendComment} className="flex gap-2">
                <input
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a comment…"
                  maxLength={5000}
                  className="glass-input min-w-0 flex-1"
                />
                <button
                  type="submit"
                  disabled={commentSending || !commentBody.trim()}
                  className="glass-btn glass-btn-primary shrink-0 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
