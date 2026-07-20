import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FaCalendarAlt, FaMoon, FaPlus, FaSun, FaTimes } from "react-icons/fa";
import { apiRequest } from "../api/http";
import { getCurrentUser } from "../api/auth.api";
import {
  createLeaveRequest,
  getLeaveRequest,
  listLeaveRequests,
  patchLeaveRequest,
} from "../api/leaveRequests.api";
import AppLayout from "../components/layout/AppLayout";
import { GlassButton, PageHeader } from "../components/glass/Glass";
import Pagination from "../components/Pagination";
import { logoutSession } from "../utils/sessionLogout";

const LEAVE_TYPES = [
  { value: "casual", label: "Casual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "half", label: "Half Leave" },
  { value: "short", label: "Short Leave" },
];

const HALF_OPTIONS = [
  { value: "first_half", label: "First Half" },
  { value: "second_half", label: "Second Half" },
];

const SHORT_OPTIONS = [
  { value: "morning", label: "Morning Short" },
  { value: "evening", label: "Evening Short" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(iso);
  }
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function statusBadgeClass(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "approved") return "bg-emerald-100 text-emerald-900";
  if (s === "rejected") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

function errToast(e, fallback) {
  const msg = e?.message || (typeof e === "string" ? e : fallback);
  if (e?.errors && typeof e.errors === "object") {
    const first = Object.values(e.errors).flat()[0];
    if (first) return toast.error(String(first));
  }
  toast.error(msg);
}

function authUserId(userPayload) {
  if (!userPayload) return undefined;
  const u = userPayload.user ?? userPayload;
  return u?.id ?? u?.user_id;
}

function leaveTypeLabel(value) {
  const v = String(value ?? "").toLowerCase();
  const map = {
    casual: "Casual Leave",
    sick: "Sick Leave",
    half: "Half Leave",
    short: "Short Leave",
    paid: "Paid",
    unpaid: "Unpaid",
    half_day: "Half day",
  };
  return map[v] ?? String(value ?? "—").replace(/_/g, " ");
}

function formatHalfType(v) {
  if (!v) return null;
  const m = { first_half: "First Half", second_half: "Second Half" };
  return m[String(v)] ?? String(v).replace(/_/g, " ");
}

function formatShortType(v) {
  if (!v) return null;
  const m = { morning: "Morning Short", evening: "Evening Short" };
  return m[String(v)] ?? String(v).replace(/_/g, " ");
}

export default function LeaveRequests() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ can_filter_by_user: false });
  const metaRef = useRef({ can_filter_by_user: false });
  /** Mirrors API meta after list loads. */
  const canFilterByUser = !!meta.can_filter_by_user;
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [filters, setFilters] = useState({
    status: "",
    month: new Date().toISOString().slice(0, 7),
    user_id: "",
  });
  const [filterUsers, setFilterUsers] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createFieldErrors, setCreateFieldErrors] = useState({});
  const [createForm, setCreateForm] = useState({
    from_date: "",
    to_date: "",
    leave_type: "casual",
    half_type: "",
    short_type: "",
    reason: "",
  });

  const prevLeaveTypeRef = useRef(null);
  useEffect(() => {
    const cur = createForm.leave_type;
    if (prevLeaveTypeRef.current === null) {
      prevLeaveTypeRef.current = cur;
      return;
    }
    if (prevLeaveTypeRef.current === cur) return;
    prevLeaveTypeRef.current = cur;
    setCreateForm((c) => ({ ...c, half_type: "", short_type: "" }));
    setCreateFieldErrors({});
  }, [createForm.leave_type]);

  const createFormValid = useMemo(() => {
    const { from_date, to_date, leave_type, half_type, short_type, reason } =
      createForm;
    const r = reason.trim();
    if (!from_date || !to_date || !r) return false;
    if (r.length > 500) return false;
    if (leave_type === "half" && !half_type) return false;
    if (leave_type === "short" && !short_type) return false;
    return true;
  }, [createForm]);

  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const loadFilterUsers = useCallback(async () => {
    try {
      const res = await apiRequest("/users/company");
      const list = res?.data ?? res?.users ?? [];
      setFilterUsers(Array.isArray(list) ? list : []);
    } catch {
      setFilterUsers([]);
    }
  }, []);

  const fetchList = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const params = {
          page: p,
          per_page: perPage,
          ...(filters.month && { month: filters.month }),
          ...(filters.status && { status: filters.status }),
          ...(metaRef.current.can_filter_by_user &&
            filters.user_id && { user_id: filters.user_id }),
        };
        const res = await listLeaveRequests();
        const pag = res?.data;
        const list = Array.isArray(pag?.data)
          ? pag.data
          : Array.isArray(pag)
            ? pag
            : [];
        setRows(list);
        const nextMeta = {
          can_filter_by_user: !!res?.meta?.can_filter_by_user,
        };
        metaRef.current = nextMeta;
        setMeta(nextMeta);
        setPage(
          typeof pag?.current_page === "number" ? pag.current_page : p
        );
        setLastPage(
          typeof pag?.last_page === "number" ? pag.last_page : 1
        );
        setTotal(
          typeof pag?.total === "number" ? pag.total : list.length
        );
        if (res?.meta?.can_filter_by_user) {
          loadFilterUsers();
        }
      } catch (e) {
        errToast(e, "Could not load leave requests");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [filters.month, filters.status, filters.user_id, perPage, loadFilterUsers]
  );

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
    fetchList(1);
  }, [
    filters.month,
    filters.status,
    filters.user_id,
    fetchList,
  ]);

  const handleLogout = () => {
    logoutSession();
    navigate("/login");
  };

  const openDetail = async (id) => {
    setDetailId(id);
    setDetail(null);
    setActionReason("");
    setDetailLoading(true);
    try {
      const res = await getLeaveRequest(id);
      const lr = res.leave_request ?? res.data?.leave_request ?? res.data;
      setDetail(lr);
    } catch (e) {
      errToast(e, "Could not load leave request");
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setActionReason("");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const {
      from_date,
      to_date,
      leave_type,
      half_type,
      short_type,
      reason,
    } = createForm;
    const fieldErr = {};
    if (!from_date || !to_date) {
      toast.error("Please choose from and to dates");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please enter a reason");
      return;
    }
    if (reason.length > 500) {
      toast.error("Reason must be 500 characters or less");
      return;
    }
    if (leave_type === "half" && !half_type) {
      fieldErr.half_type = "Select first or second half";
    }
    if (leave_type === "short" && !short_type) {
      fieldErr.short_type = "Select morning or evening short leave";
    }
    if (Object.keys(fieldErr).length) {
      setCreateFieldErrors(fieldErr);
      return;
    }
    setCreateFieldErrors({});

    const uid = authUserId(user);
    setCreateSubmitting(true);
    try {
      await createLeaveRequest({
        ...(uid != null ? { user_id: uid } : {}),
        from_date,
        to_date,
        leave_type,
        half_type: leave_type === "half" ? half_type : null,
        short_type: leave_type === "short" ? short_type : null,
        reason: reason.trim(),
      });
      toast.success("Leave request submitted");
      setShowCreate(false);
      setCreateForm({
        from_date: "",
        to_date: "",
        leave_type: "casual",
        half_type: "",
        short_type: "",
        reason: "",
      });
      fetchList(page);
    } catch (err) {
      errToast(err, "Could not create leave request");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleApproveReject = async (status) => {
    if (!detail?.id) return;
    const reason = actionReason.trim();
    // if (!reason) {
    //   toast.error("Action reason is required");
    //   return;
    // }
    // if (reason.length > 500) {
    //   toast.error("Action reason must be 500 characters or less");
    //   return;
    // }
    setActionSubmitting(true);
    try {
      await patchLeaveRequest(detail.id, { status, action_reason: reason });
      toast.success(status === "approved" ? "Approved" : "Rejected");
      closeDetail();
      fetchList(page);
    } catch (err) {
      errToast(err, "Could not update leave request");
    } finally {
      setActionSubmitting(false);
    }
  };

  const startDate = (row) => row.start_date ?? row.from_date;
  const endDate = (row) => row.end_date ?? row.to_date;
  const leaveType = (row) => row.leave_type ?? row.type ?? "—";

  const detailStart = useMemo(
    () => (detail ? startDate(detail) : null),
    [detail]
  );
  const detailEnd = useMemo(() => (detail ? endDate(detail) : null), [detail]);

  const showApproverActions =
    canFilterByUser &&
    detail &&
    String(detail.status ?? "").toLowerCase() === "pending";

  return (
    <AppLayout
      user={user}
      onLogout={handleLogout}
      noPadding
      mainClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
          <div className="shrink-0 border-b border-white/10 px-4 py-5 sm:px-6">
            <PageHeader
              title="Leave Requests"
              subtitle="Request time off and track approvals."
              actions={
                <GlassButton
                  type="button"
                  onClick={() => {
                    setCreateFieldErrors({});
                    setShowCreate(true);
                  }}
                >
                  <FaPlus className="text-xs" />
                  New request
                </GlassButton>
              }
            />

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-glass-muted">
                Month
                <input
                  type="month"
                  value={filters.month}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, month: e.target.value }))
                  }
                  className="glass-input mt-1 block"
                />
              </label>
              <label className="text-xs font-medium text-glass-muted">
                Status
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, status: e.target.value }))
                  }
                  className="glass-select mt-1 block"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {canFilterByUser && (
                <label className="text-xs font-medium text-glass-muted">
                  Employee
                  <select
                    value={filters.user_id}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, user_id: e.target.value }))
                    }
                    className="glass-select mt-1 block min-w-[200px]"
                  >
                    <option value="">All employees</option>
                    {filterUsers.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name ?? u.email ?? `User ${u.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={() => fetchList(1)}
                className="glass-btn glass-btn-secondary rounded-xl px-4 py-2 text-sm font-medium"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
            <div className="min-h-0 flex-1 overflow-auto glass-card !p-0">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                </div>
              ) : rows.length === 0 ? (
                <p className="py-16 text-center text-sm text-glass-muted">
                  No leave requests for these filters.
                </p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-white/10 bg-white/5 text-glass-muted">
                    <tr>
                      {canFilterByUser && (
                        <th className="px-4 py-3 font-semibold">Employee</th>
                      )}
                      <th className="px-4 py-3 font-semibold">Period</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Days</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-white/5"
                      >
                        {canFilterByUser && (
                          <td className="px-4 py-3 font-medium theme-text">
                            {row.user?.name ?? row.user_name ?? "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-glass-muted">
                          {formatDate(startDate(row))} –{" "}
                          {formatDate(endDate(row))}
                        </td>
                        <td className="px-4 py-3 text-glass-muted">
                          {leaveTypeLabel(leaveType(row))}
                        </td>
                        <td className="px-4 py-3 tabular-nums theme-text">
                          {row.total_days ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(row.status)}`}
                          >
                            {row.status ?? "—"}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-glass-muted">
                          {row.reason ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openDetail(row.id)}
                            className="text-sm font-medium text-[#64d2ff] hover:text-[#0a84ff]"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {lastPage > 1 && (
              <div className="shrink-0 pt-4">
                <Pagination
                  currentPage={page}
                  totalPages={lastPage}
                  onPageChange={(p) => fetchList(p)}
                />
              </div>
            )}

            <p className="mt-2 shrink-0 text-center text-xs text-glass-muted">
              {total > 0 ? `${total} request(s) total` : null}
            </p>
          </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-[var(--theme-backdrop)] p-4 sm:items-center">
          <div
            className="absolute inset-0"
            aria-hidden
            onClick={() => !createSubmitting && setShowCreate(false)}
          />
          <div className="relative z-[201] w-full max-w-lg glass-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold theme-text">
                New leave request
              </h2>
              <button
                type="button"
                onClick={() => !createSubmitting && setShowCreate(false)}
                className="rounded-lg p-2 text-glass-muted transition hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text)]"
              >
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-glass-muted">
                  From
                  <input
                    type="date"
                    required
                    value={createForm.from_date}
                    onChange={(e) =>
                      setCreateForm((c) => ({
                        ...c,
                        from_date: e.target.value,
                      }))
                    }
                    className="glass-input mt-1"
                  />
                </label>
                <label className="block text-xs font-medium text-glass-muted">
                  To
                  <input
                    type="date"
                    required
                    value={createForm.to_date}
                    onChange={(e) =>
                      setCreateForm((c) => ({
                        ...c,
                        to_date: e.target.value,
                      }))
                    }
                    className="glass-input mt-1"
                  />
                </label>
              </div>

              <label className="block text-xs font-medium text-glass-muted">
                Leave type
                <select
                  value={createForm.leave_type}
                  onChange={(e) =>
                    setCreateForm((c) => ({
                      ...c,
                      leave_type: e.target.value,
                    }))
                  }
                  className="glass-select mt-1"
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              {createForm.leave_type === "half" && (
                <div className="overflow-hidden rounded-xl border border-[#0a84ff]/25 bg-[#0a84ff]/10 p-4 transition-all duration-300 ease-out">
                  <p className="text-xs font-semibold theme-text">
                    Select half
                  </p>
                  <p className="mt-0.5 text-[11px] text-glass-muted">
                    Applies for half working day
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {HALF_OPTIONS.map((opt) => {
                      const selected = createForm.half_type === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setCreateForm((c) => ({
                              ...c,
                              half_type: opt.value,
                            }));
                            setCreateFieldErrors((e) => ({
                              ...e,
                              half_type: undefined,
                            }));
                          }}
                          className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                            selected
                              ? "border-[#0a84ff] bg-[#0a84ff] text-white shadow-md ring-2 ring-[#0a84ff]/30"
                              : "border-[var(--theme-glass-border)] bg-[var(--theme-hover)] text-glass-muted hover:border-[#0a84ff]/40 hover:bg-[var(--theme-hover-strong)] hover:text-[var(--theme-text)]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {createFieldErrors.half_type && (
                    <p className="mt-2 text-xs font-medium text-red-500">
                      {createFieldErrors.half_type}
                    </p>
                  )}
                </div>
              )}

              {createForm.leave_type === "short" && (
                <div className="overflow-hidden rounded-xl border border-amber-400/25 bg-amber-500/10 p-4 transition-all duration-300 ease-out">
                  <p className="text-xs font-semibold theme-text">
                    Select short leave type
                  </p>
                  <p className="mt-0.5 text-[11px] text-glass-muted">
                    Applies for few hours only
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {SHORT_OPTIONS.map((opt) => {
                      const selected = createForm.short_type === opt.value;
                      const Icon = opt.value === "morning" ? FaSun : FaMoon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setCreateForm((c) => ({
                              ...c,
                              short_type: opt.value,
                            }));
                            setCreateFieldErrors((e) => ({
                              ...e,
                              short_type: undefined,
                            }));
                          }}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                            selected
                              ? "border-amber-500 bg-amber-500 text-white shadow-md ring-2 ring-amber-500/30"
                              : "border-[var(--theme-glass-border)] bg-[var(--theme-hover)] text-glass-muted hover:border-amber-400/40 hover:bg-[var(--theme-hover-strong)] hover:text-[var(--theme-text)]"
                          }`}
                        >
                          <Icon className="text-base opacity-90" aria-hidden />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {createFieldErrors.short_type && (
                    <p className="mt-2 text-xs font-medium text-red-500">
                      {createFieldErrors.short_type}
                    </p>
                  )}
                </div>
              )}

              <label className="block text-xs font-medium text-glass-muted">
                Reason (max 500)
                <textarea
                  required
                  maxLength={500}
                  rows={3}
                  value={createForm.reason}
                  onChange={(e) =>
                    setCreateForm((c) => ({ ...c, reason: e.target.value }))
                  }
                  className="glass-textarea mt-1"
                  placeholder="Brief reason for leave"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={createSubmitting}
                  className="glass-btn glass-btn-secondary rounded-xl px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting || !createFormValid}
                  className="rounded-xl bg-[#0a84ff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createSubmitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailId != null && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-[var(--theme-backdrop)] p-4 sm:items-center">
          <div
            className="absolute inset-0"
            aria-hidden
            onClick={() => !actionSubmitting && closeDetail()}
          />
          <div className="relative z-[201] flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden glass-card !p-0">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--theme-glass-border)] px-5 py-4">
              <h2 className="text-lg font-bold theme-text">
                Leave request
              </h2>
              <button
                type="button"
                onClick={() => !actionSubmitting && closeDetail()}
                className="rounded-lg p-2 text-glass-muted transition hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text)]"
              >
                <FaTimes />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#0a84ff] border-t-transparent" />
                </div>
              ) : detail ? (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-glass-muted">From</p>
                      <p className="font-medium theme-text">
                        {formatDate(detailStart)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-glass-muted">To</p>
                      <p className="font-medium theme-text">
                        {formatDate(detailEnd)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-glass-muted">Total days</p>
                      <p className="font-medium theme-text">
                        {detail.total_days ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-glass-muted">Type</p>
                      <p className="font-medium theme-text">
                        {leaveTypeLabel(
                          detail.leave_type ?? detail.type ?? "—"
                        )}
                      </p>
                    </div>
                  </div>
                  {(detail.half_type != null && detail.half_type !== "") ||
                  (detail.half_day_type != null &&
                    detail.half_day_type !== "") ? (
                    <div>
                      <p className="text-xs text-glass-muted">Half</p>
                      <p className="font-medium theme-text">
                        {formatHalfType(
                          detail.half_type ?? detail.half_day_type
                        )}
                      </p>
                    </div>
                  ) : null}
                  {(detail.short_type != null && detail.short_type !== "") ||
                  (detail.short_leave_type != null &&
                    detail.short_leave_type !== "") ? (
                    <div>
                      <p className="text-xs text-glass-muted">Short leave</p>
                      <p className="font-medium theme-text">
                        {formatShortType(
                          detail.short_type ?? detail.short_leave_type
                        )}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs text-glass-muted">Status</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(detail.status)}`}
                    >
                      {detail.status ?? "—"}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-glass-muted">Reason</p>
                    <p className="mt-1 whitespace-pre-wrap theme-text">
                      {detail.reason ?? "—"}
                    </p>
                  </div>
                  {detail.user && (
                    <div>
                      <p className="text-xs text-glass-muted">Employee</p>
                      <p className="font-medium theme-text">
                        {detail.user.name ?? detail.user.email ?? "—"}
                      </p>
                    </div>
                  )}
                  {detail.action_at && (
                    <div className="rounded-xl border border-[var(--theme-glass-border)] bg-[var(--theme-hover)] p-3 text-xs text-glass-muted">
                      <p>
                        <span className="font-semibold theme-text">
                          Action:
                        </span>{" "}
                        {formatDateTime(detail.action_at)}
                      </p>
                      {detail.action_by_user && (
                        <p className="mt-1">
                          By {detail.action_by_user.name ?? "—"}
                        </p>
                      )}
                      {detail.action_reason && (
                        <p className="mt-2 whitespace-pre-wrap">
                          <span className="font-semibold theme-text">
                            Note:
                          </span>{" "}
                          {detail.action_reason}
                        </p>
                      )}
                    </div>
                  )}

                  {showApproverActions && (
                    <div className="border-t border-[var(--theme-glass-border)] pt-4">
                      <p className="mb-2 text-xs font-medium text-glass-muted">
                        Decision (required for approve / reject)
                      </p>
                      <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="Reason for your decision"
                        className="glass-textarea"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionSubmitting}
                          onClick={() => handleApproveReject("approved")}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actionSubmitting}
                          onClick={() => handleApproveReject("rejected")}
                          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="py-8 text-center text-glass-muted">
                  Could not load details.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
