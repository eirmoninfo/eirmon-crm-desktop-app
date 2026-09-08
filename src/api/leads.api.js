import { getToken } from "../utils/storage";
import { getApiRoot } from "./api.config";
import { unwrapApiBody } from "../utils/unwrapApiBody";

function apiV1Url(path) {
  const root = getApiRoot();
  if (!root) return "";
  const base = /\/api$/i.test(root) ? root : `${root}/api`;
  return `${base}/v1${path.startsWith("/") ? path : `/${path}`}`;
}

async function v1Request(path, { method = "GET", body, params } = {}) {
  const token = getToken();
  if (!token) throw { message: "Not authenticated", status: 401 };

  let url = apiV1Url(path);
  if (!url) throw { message: "API base URL missing", status: 0 };

  if (params && typeof params === "object") {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      qs.set(k, String(v));
    });
    const q = qs.toString();
    if (q) url += (url.includes("?") ? "&" : "?") + q;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.message ||
      (json?.errors ? Object.values(json.errors).flat().join(" ") : null) ||
      `Request failed (${res.status})`;
    throw { status: res.status, message: msg, errors: json?.errors };
  }

  return json;
}

function listFrom(json) {
  const body = unwrapApiBody(json) ?? json?.data ?? json;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(json?.data?.data)) return json.data.data;
  return [];
}

function metaFrom(json) {
  return (
    json?.meta ||
    json?.data?.meta ||
    unwrapApiBody(json)?.meta || {
      current_page: 1,
      last_page: 1,
      total: listFrom(json).length,
    }
  );
}

export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal_sent", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "converted", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const LEAD_TEMPERATURES = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

export const LEAD_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const LEAD_QUICK_FILTERS = [
  { value: "", label: "All" },
  { value: "hot", label: "Hot" },
  { value: "overdue", label: "Overdue" },
  { value: "followup_today", label: "Follow-up today" },
  { value: "ai_suggested", label: "AI suggested" },
];

export const LEAD_AI_PROMPTS = [
  "Suggest next follow-up action",
  "Analyze this lead",
  "Draft a follow-up email",
];

/** List-level integration prompts (filters + open Eirmon AI). */
export const LEAD_INTEGRATION_PROMPTS = [
  {
    id: "hot",
    label: "Show hot leads",
    kind: "filter",
    filter: "hot",
    aiMessage: "Show hot leads",
  },
  {
    id: "overdue",
    label: "Show overdue leads",
    kind: "filter",
    filter: "overdue",
    aiMessage: "Show overdue leads",
  },
  {
    id: "followup",
    label: "Follow-ups due today",
    kind: "filter",
    filter: "followup_today",
    aiMessage: "Show follow-ups due today",
  },
  {
    id: "ai_suggested",
    label: "AI suggested leads",
    kind: "filter",
    filter: "ai_suggested",
    aiMessage: "Show AI suggested leads",
  },
  {
    id: "list",
    label: "Show all leads",
    kind: "filter",
    filter: "",
    aiMessage: "Show my leads",
  },
  {
    id: "create",
    label: "Create a new lead",
    kind: "ai",
    aiMessage: "Create a new lead",
  },
  {
    id: "analyze_named",
    label: "Analyze a lead with AI",
    kind: "ai",
    aiMessage: "Analyze my hottest overdue lead",
  },
  {
    id: "draft_email",
    label: "Draft follow-up email",
    kind: "ai",
    aiMessage: "Draft a follow-up email for my top hot lead",
  },
  {
    id: "next_action",
    label: "Suggest next pipeline action",
    kind: "ai",
    aiMessage: "Suggest next follow-up actions for overdue leads",
  },
];

export const LEAD_DRAWER_AI_PROMPTS = [
  ...LEAD_AI_PROMPTS,
  "Update status to contacted",
  "Mark as hot lead",
];

export async function fetchLeadStats() {
  const json = await v1Request("/leads/stats");
  return unwrapApiBody(json) ?? json?.data ?? json;
}

export async function fetchLeads(params = {}) {
  const json = await v1Request("/leads", { params });
  return { leads: listFrom(json), meta: metaFrom(json), raw: json };
}

export async function searchLeads(q) {
  const json = await v1Request("/leads/search", { params: { q } });
  return listFrom(json);
}

export async function fetchLead(id) {
  const json = await v1Request(`/leads/${id}`);
  return unwrapApiBody(json) ?? json?.data ?? json;
}

export async function createLead(payload) {
  const json = await v1Request("/leads", { method: "POST", body: payload });
  return unwrapApiBody(json) ?? json?.data ?? json;
}

export async function updateLead(id, payload) {
  const json = await v1Request(`/leads/${id}`, { method: "PATCH", body: payload });
  return unwrapApiBody(json) ?? json?.data ?? json;
}

export async function assignLead(id, assigned_to) {
  const json = await v1Request(`/leads/${id}/assign`, {
    method: "POST",
    body: { assigned_to },
  });
  return unwrapApiBody(json) ?? json?.data ?? json;
}

export async function analyzeLead(id) {
  const json = await v1Request(`/leads/${id}/ai/analyze`, { method: "POST", body: {} });
  return unwrapApiBody(json) ?? json?.data ?? json;
}

export async function suggestLeadNextAction(id, context) {
  const json = await v1Request(`/leads/${id}/ai/suggest`, {
    method: "POST",
    body: context ? { context } : {},
  });
  const body = unwrapApiBody(json) ?? json?.data ?? json;
  return body?.suggestion ?? body;
}

export async function generateLeadEmail(id, context) {
  const json = await v1Request(`/leads/${id}/ai/generate-email`, {
    method: "POST",
    body: context ? { context } : {},
  });
  return unwrapApiBody(json) ?? json?.data ?? json;
}

export async function sendLeadEmail(id, { subject, body, log_id }) {
  const json = await v1Request(`/leads/${id}/ai/send-email`, {
    method: "POST",
    body: { subject, body, log_id },
  });
  return unwrapApiBody(json) ?? json?.data ?? json;
}
