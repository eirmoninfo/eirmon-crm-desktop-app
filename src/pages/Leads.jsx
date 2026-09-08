import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  Flame,
  Snowflake,
  Sun,
  Plus,
  Search,
  Sparkles,
  Mail,
  Phone,
  MessageCircle,
  X,
  RefreshCw,
  Bot,
  ExternalLink,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import { GlassButton, GlassCard, PageHeader } from "../components/glass/Glass";
import {
  LEAD_DRAWER_AI_PROMPTS,
  LEAD_INTEGRATION_PROMPTS,
  LEAD_PRIORITIES,
  LEAD_QUICK_FILTERS,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  analyzeLead,
  createLead,
  fetchLead,
  fetchLeadStats,
  fetchLeads,
  generateLeadEmail,
  sendLeadEmail,
  suggestLeadNextAction,
  updateLead,
} from "../api/leads.api";
import { canAccessAny, getUserPayload } from "../utils/permissions";
import { P } from "../constants/permissions";
import { getCurrentUser } from "../api/auth.api";

function TempIcon({ value }) {
  if (value === "hot") return <Flame className="h-3.5 w-3.5 text-rose-400" />;
  if (value === "cold") return <Snowflake className="h-3.5 w-3.5 text-sky-400" />;
  return <Sun className="h-3.5 w-3.5 text-amber-400" />;
}

function statusLabel(value) {
  return LEAD_STATUSES.find((s) => s.value === value)?.label || value || "—";
}

function formatFollowUp(value) {
  if (!value) return "—";
  try {
    const d = new Date(value.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  lead_company: "",
  source: "other",
  status: "new",
  lead_temperature: "warm",
  priority: "medium",
  next_followup: "",
  message: "",
  location: "",
};

export default function Leads() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({});
  const [leads, setLeads] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    temperature: "",
    priority: "",
    filter: location.state?.leadFilter || "",
    page: 1,
  });

  useEffect(() => {
    const f = location.state?.leadFilter;
    if (typeof f !== "string") return;
    setFilters((prev) => ({ ...prev, filter: f, page: 1 }));
  }, [location.state?.leadFilter]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiBusy, setAiBusy] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [insight, setInsight] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const canEdit = canAccessAny(user, [P.EDIT_LEADS, P.CREATE_LEADS]);
  const canCreate = canAccessAny(user, [P.CREATE_LEADS]);

  useEffect(() => {
    (async () => {
      const r = await getCurrentUser();
      if (r.success) setUser(getUserPayload(r.data));
    })();
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        fetchLeadStats().catch(() => ({})),
        fetchLeads({
          q: filters.q || undefined,
          status: filters.status || undefined,
          temperature: filters.temperature || undefined,
          priority: filters.priority || undefined,
          filter: filters.filter || undefined,
          page: filters.page,
          limit: 20,
        }),
      ]);
      setStats(statsRes || {});
      setLeads(listRes.leads || []);
      setMeta(listRes.meta || { current_page: 1, last_page: 1, total: 0 });
    } catch (err) {
      toast.error(err?.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openLead = async (id) => {
    setSelectedId(id);
    setDetailLoading(true);
    setSuggestion("");
    setInsight(null);
    setEmailDraft(null);
    try {
      const lead = await fetchLead(id);
      setDetail(lead);
      if (lead?.ai_insights) setInsight(lead.ai_insights);
    } catch (err) {
      toast.error(err?.message || "Failed to open lead");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDrawer = () => {
    setSelectedId(null);
    setDetail(null);
    setSuggestion("");
    setInsight(null);
    setEmailDraft(null);
  };

  const askEirmonAi = (message, lead = detail) => {
    const ctx = lead?.name
      ? `${message} (lead: ${lead.name}${lead.id ? `, id ${lead.id}` : ""})`
      : message;
    navigate("/eirmon-ai", { state: { initialPrompt: ctx } });
  };

  const runIntegrationPrompt = (item) => {
    if (item.kind === "filter") {
      setFilters((prev) => ({
        ...prev,
        filter: item.filter || "",
        page: 1,
      }));
      return;
    }
    if (item.id === "create") {
      setCreateOpen(true);
      return;
    }
    askEirmonAi(item.aiMessage);
  };

  const patchField = async (payload) => {
    if (!selectedId) return;
    try {
      const updated = await updateLead(selectedId, payload);
      setDetail(updated);
      setLeads((prev) =>
        prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l))
      );
      toast.success("Lead updated");
      loadList();
    } catch (err) {
      toast.error(err?.message || "Update failed");
    }
  };

  const runAiPrompt = async (prompt) => {
    if (!selectedId || !detail) return;
    const key = prompt.toLowerCase();

    try {
      if (key.includes("contacted")) {
        await patchField({ status: "contacted" });
        return;
      }
      if (key.includes("hot lead") || key === "mark as hot lead") {
        await patchField({ lead_temperature: "hot" });
        return;
      }
      if (key.includes("analyze")) {
        setAiBusy("analyze");
        const res = await analyzeLead(selectedId);
        setInsight(res?.insight || res);
        if (res?.lead) setDetail(res.lead);
        toast.success("AI analysis ready");
        return;
      }
      if (key.includes("email") || key.includes("draft")) {
        setAiBusy("email");
        const draft = await generateLeadEmail(selectedId);
        setEmailDraft({
          subject: draft?.subject || "",
          body: draft?.body || "",
          log_id: draft?.log_id,
        });
        toast.success("Follow-up email drafted");
        return;
      }
      setAiBusy("suggest");
      const text = await suggestLeadNextAction(
        selectedId,
        `Lead: ${detail.name}. Status: ${detail.status}. Temperature: ${detail.lead_temperature}. Next follow-up: ${detail.next_followup || "none"}.`
      );
      setSuggestion(typeof text === "string" ? text : String(text || ""));
      toast.success("Next action suggested");
    } catch (err) {
      toast.error(err?.message || "AI request failed");
    } finally {
      setAiBusy("");
    }
  };

  const sendDraft = async () => {
    if (!selectedId || !emailDraft?.subject || !emailDraft?.body) return;
    setAiBusy("send");
    try {
      await sendLeadEmail(selectedId, emailDraft);
      toast.success("Email sent");
      setEmailDraft(null);
    } catch (err) {
      toast.error(err?.message || "Send failed");
    } finally {
      setAiBusy("");
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.next_followup) delete payload.next_followup;
      const created = await createLead(payload);
      toast.success("Lead created");
      setCreateOpen(false);
      setForm(emptyForm);
      await loadList();
      if (created?.id) openLead(created.id);
    } catch (err) {
      toast.error(err?.message || "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const kpi = useMemo(
    () => [
      {
        label: "Total",
        value: stats.total ?? stats.total_leads ?? meta.total ?? leads.length,
      },
      {
        label: "Follow-ups today",
        value: stats.followup_today ?? stats.todays_followups ?? 0,
      },
      { label: "Overdue", value: stats.overdue ?? 0, danger: true },
      { label: "Hot", value: stats.hot ?? stats.by_temperature?.hot ?? 0 },
    ],
    [stats, meta, leads.length]
  );

  return (
    <AppLayout>
      <div className="space-y-5 pb-10">
        <PageHeader
          title={`Leads (${meta.total ?? leads.length})`}
          subtitle="CRM pipeline + AI integration prompts (same APIs as web)"
          actions={
            <div className="flex flex-wrap gap-2">
              <GlassButton
                type="button"
                variant="ghost"
                onClick={() =>
                  askEirmonAi("Show my leads and suggest what to do next")
                }
              >
                <Bot className="h-4 w-4" />
                Ask Eirmon AI
              </GlassButton>
              <GlassButton type="button" variant="ghost" onClick={loadList}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </GlassButton>
              {canCreate && (
                <GlassButton type="button" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New Lead
                </GlassButton>
              )}
            </div>
          }
        />

        <GlassCard className="space-y-3 border border-violet-400/20 bg-violet-500/5 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-300" />
            <p className="text-sm font-semibold theme-text">
              AI integration prompts
            </p>
          </div>
          <p className="text-xs text-glass-muted">
            Tap a prompt to filter the pipeline or open Eirmon AI with the same
            lead APIs as the web CRM.
          </p>
          <div className="flex flex-wrap gap-2">
            {LEAD_INTEGRATION_PROMPTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => runIntegrationPrompt(item)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                  item.kind === "filter" &&
                  filters.filter === (item.filter || "")
                    ? "border-violet-300 bg-violet-500/30 text-white"
                    : "border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20"
                }`}
              >
                {item.kind === "ai" ? (
                  <ExternalLink className="mr-1 inline h-3 w-3" />
                ) : (
                  <Sparkles className="mr-1 inline h-3 w-3" />
                )}
                {item.label}
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpi.map((card) => (
            <GlassCard key={card.label} className="p-4">
              <p className="text-xs text-glass-muted">{card.label}</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  card.danger ? "text-rose-400" : "theme-text"
                }`}
              >
                {card.value}
              </p>
            </GlassCard>
          ))}
        </div>

        <GlassCard className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {LEAD_QUICK_FILTERS.map((f) => (
              <button
                key={f.value || "all"}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({ ...prev, filter: f.value, page: 1 }))
                }
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filters.filter === f.value
                    ? "bg-indigo-500/90 text-white"
                    : "bg-white/5 text-glass-muted hover:bg-white/10"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-glass-muted" />
              <input
                className="glass-input w-full pl-9"
                placeholder="Search leads..."
                value={filters.q}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    q: e.target.value,
                    page: 1,
                  }))
                }
              />
            </label>
            <select
              className="glass-input"
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  status: e.target.value,
                  page: 1,
                }))
              }
            >
              <option value="">Status</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              className="glass-input"
              value={filters.temperature}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  temperature: e.target.value,
                  page: 1,
                }))
              }
            >
              <option value="">Temperature</option>
              {LEAD_TEMPERATURES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              className="glass-input"
              value={filters.priority}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  priority: e.target.value,
                  page: 1,
                }))
              }
            >
              <option value="">Priority</option>
              {LEAD_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </GlassCard>

        <GlassCard className="overflow-hidden p-0">
          {loading ? (
            <p className="p-6 text-sm text-glass-muted">Loading leads…</p>
          ) : leads.length === 0 ? (
            <p className="p-6 text-sm text-glass-muted">
              No leads match these filters.
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => openLead(lead.id)}
                  className={`flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-white/5 sm:flex-row sm:items-center sm:justify-between ${
                    selectedId === lead.id ? "bg-indigo-500/10" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold theme-text">
                        {lead.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          lead.is_overdue
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {lead.is_overdue ? "Overdue" : "On Track"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-glass-muted">
                      {[
                        lead.email,
                        lead.phone,
                        lead.company_name || lead.lead_company,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-glass-muted">
                        <TempIcon value={lead.lead_temperature} />
                        {lead.lead_temperature || "warm"}
                      </span>
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-200">
                        {statusLabel(lead.status)}
                      </span>
                      {lead.priority && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase text-amber-200">
                          {lead.priority}
                        </span>
                      )}
                      {lead.source && (
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-glass-muted">
                          {lead.source}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-left text-xs text-glass-muted sm:text-right">
                    <p>Next follow-up</p>
                    <p className="font-medium theme-text">
                      {formatFollowUp(
                        lead.next_followup || lead.next_followup_label
                      )}
                    </p>
                    <p className="mt-1">{lead.assignee || "Unassigned"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {meta.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs">
              <button
                type="button"
                disabled={filters.page <= 1}
                className="glass-btn glass-btn-ghost disabled:opacity-40"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: Math.max(1, prev.page - 1),
                  }))
                }
              >
                Previous
              </button>
              <span className="text-glass-muted">
                Page {meta.current_page || filters.page} / {meta.last_page}
              </span>
              <button
                type="button"
                disabled={filters.page >= (meta.last_page || 1)}
                className="glass-btn glass-btn-ghost disabled:opacity-40"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: Math.min(meta.last_page || 1, prev.page + 1),
                  }))
                }
              >
                Next
              </button>
            </div>
          )}
        </GlassCard>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[var(--theme-bg-elevated,#12141a)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold theme-text">
                  {detail?.name || "Lead"}
                </p>
                <p className="text-xs text-glass-muted">
                  {detailLoading ? "Loading…" : detail?.email || "No email"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-white/10"
                onClick={closeDrawer}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                {detail?.email && (
                  <a
                    className="glass-btn glass-btn-ghost text-xs"
                    href={`mailto:${detail.email}`}
                  >
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                )}
                {detail?.phone && (
                  <a
                    className="glass-btn glass-btn-ghost text-xs"
                    href={`tel:${detail.phone}`}
                  >
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                )}
                {detail?.phone && (
                  <a
                    className="glass-btn glass-btn-ghost text-xs"
                    href={`https://wa.me/${String(detail.phone).replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  className="glass-btn glass-btn-ghost text-xs"
                  onClick={() =>
                    askEirmonAi(
                      "Help me work this lead — suggest next steps",
                      detail
                    )
                  }
                >
                  <Bot className="h-3.5 w-3.5" /> Ask AI
                </button>
              </div>

              <GlassCard className="space-y-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-glass-muted">
                  Lead insights
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] text-glass-muted">Health</p>
                    <p
                      className={
                        detail?.is_overdue ? "text-rose-300" : "text-emerald-300"
                      }
                    >
                      {detail?.is_overdue ? "Overdue" : "On Track"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-glass-muted">Next follow-up</p>
                    <p className="theme-text">
                      {formatFollowUp(
                        detail?.next_followup || detail?.next_followup_label
                      )}
                    </p>
                  </div>
                </div>
              </GlassCard>

              {canEdit && detail && (
                <GlassCard className="space-y-3 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-glass-muted">
                    Update
                  </p>
                  <label className="block text-xs text-glass-muted">
                    Stage
                    <select
                      className="glass-input mt-1 w-full"
                      value={detail.status || "new"}
                      onChange={(e) => patchField({ status: e.target.value })}
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-glass-muted">
                    Temperature
                    <select
                      className="glass-input mt-1 w-full"
                      value={detail.lead_temperature || "warm"}
                      onChange={(e) =>
                        patchField({ lead_temperature: e.target.value })
                      }
                    >
                      {LEAD_TEMPERATURES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-glass-muted">
                    Next follow-up
                    <input
                      type="datetime-local"
                      className="glass-input mt-1 w-full"
                      value={
                        detail.next_followup
                          ? String(detail.next_followup)
                              .replace(" ", "T")
                              .slice(0, 16)
                          : ""
                      }
                      onChange={(e) =>
                        patchField({
                          next_followup: e.target.value
                            ? e.target.value.replace("T", " ")
                            : null,
                        })
                      }
                    />
                  </label>
                </GlassCard>
              )}

              <GlassCard className="space-y-3 p-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-300" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-glass-muted">
                    AI prompts
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {LEAD_DRAWER_AI_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={!!aiBusy || !canEdit}
                      onClick={() => runAiPrompt(prompt)}
                      className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium text-violet-100 disabled:opacity-40"
                    >
                      <Sparkles className="mr-1 inline h-3 w-3" />
                      {aiBusy && prompt.toLowerCase().includes(aiBusy)
                        ? "Working…"
                        : prompt}
                    </button>
                  ))}
                </div>
                {suggestion && (
                  <div className="rounded-lg bg-white/5 p-3 text-sm leading-relaxed theme-text">
                    <p className="mb-1 text-[11px] font-semibold uppercase text-violet-300">
                      Suggested next action
                    </p>
                    {suggestion}
                  </div>
                )}
                {insight && (
                  <div className="rounded-lg bg-white/5 p-3 text-sm leading-relaxed theme-text">
                    <p className="mb-1 text-[11px] font-semibold uppercase text-violet-300">
                      AI insight
                    </p>
                    {typeof insight === "string"
                      ? insight
                      : insight?.summary ||
                        insight?.recommendation ||
                        JSON.stringify(insight, null, 2)}
                  </div>
                )}
                {emailDraft && (
                  <div className="space-y-2 rounded-lg border border-white/10 p-3">
                    <p className="text-[11px] font-semibold uppercase text-violet-300">
                      Follow-up email draft
                    </p>
                    <input
                      className="glass-input w-full"
                      value={emailDraft.subject}
                      onChange={(e) =>
                        setEmailDraft((d) => ({ ...d, subject: e.target.value }))
                      }
                    />
                    <textarea
                      className="glass-input min-h-[140px] w-full"
                      value={emailDraft.body}
                      onChange={(e) =>
                        setEmailDraft((d) => ({ ...d, body: e.target.value }))
                      }
                    />
                    <div className="flex gap-2">
                      <GlassButton
                        type="button"
                        disabled={aiBusy === "send"}
                        onClick={sendDraft}
                      >
                        Send email
                      </GlassButton>
                      <GlassButton
                        type="button"
                        variant="ghost"
                        onClick={() => setEmailDraft(null)}
                      >
                        Discard
                      </GlassButton>
                    </div>
                  </div>
                )}
              </GlassCard>

              <GlassCard className="space-y-2 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-glass-muted">
                  About
                </p>
                <p>
                  <span className="text-glass-muted">Location: </span>
                  {detail?.full_location || detail?.location || "—"}
                </p>
                <p>
                  <span className="text-glass-muted">Source: </span>
                  {detail?.source || "—"}
                </p>
                <p>
                  <span className="text-glass-muted">Owner: </span>
                  {detail?.assignee || "—"}
                </p>
                <p>
                  <span className="text-glass-muted">Next action: </span>
                  {detail?.action_required || "—"}
                </p>
                {detail?.message && (
                  <p className="whitespace-pre-wrap text-glass-muted">
                    {detail.message}
                  </p>
                )}
              </GlassCard>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form
            onSubmit={submitCreate}
            className="w-full max-w-lg space-y-3 rounded-2xl border border-white/10 bg-[var(--theme-bg-elevated,#12141a)] p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">New lead</h3>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            {[
              ["name", "Name *", "text"],
              ["email", "Email", "email"],
              ["phone", "Phone", "text"],
              ["lead_company", "Company", "text"],
              ["location", "Location", "text"],
            ].map(([key, label, type]) => (
              <label key={key} className="block text-xs text-glass-muted">
                {label}
                <input
                  type={type}
                  className="glass-input mt-1 w-full"
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-glass-muted">
                Status
                <select
                  className="glass-input mt-1 w-full"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-glass-muted">
                Temperature
                <select
                  className="glass-input mt-1 w-full"
                  value={form.lead_temperature}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      lead_temperature: e.target.value,
                    }))
                  }
                >
                  {LEAD_TEMPERATURES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs text-glass-muted">
              Next follow-up
              <input
                type="datetime-local"
                className="glass-input mt-1 w-full"
                value={form.next_followup}
                onChange={(e) =>
                  setForm((f) => ({ ...f, next_followup: e.target.value }))
                }
              />
            </label>
            <label className="block text-xs text-glass-muted">
              Notes
              <textarea
                className="glass-input mt-1 min-h-[80px] w-full"
                value={form.message}
                onChange={(e) =>
                  setForm((f) => ({ ...f, message: e.target.value }))
                }
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <GlassButton
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </GlassButton>
              <GlassButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Create lead"}
              </GlassButton>
            </div>
          </form>
        </div>
      )}
    </AppLayout>
  );
}
