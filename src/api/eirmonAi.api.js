import { getToken } from "../utils/storage";
import { getApiRoot } from "./api.config";
import { generateEirmonAiReply } from "../utils/eirmonAiEngine";
import { unwrapApiBody } from "../utils/unwrapApiBody";

function apiV1Url(path) {
  const root = getApiRoot();
  if (!root) return "";
  const base = /\/api$/i.test(root) ? root : `${root}/api`;
  return `${base}/v1${path.startsWith("/") ? path : `/${path}`}`;
}

export const EIRMON_AI_AGENT_PROMPTS = [
  "Check me in",
  "Show my attendance for today",
  "Show my tasks",
  "Show this month's attendance report",
  "Show overdue invoices",
  "Show my expenses",
  "Show today's team attendance",
];

function buildHistory(messages = []) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-16)
    .map((m) => ({
      role: m.role,
      content: String(m.content || "").trim(),
    }))
    .filter((m) => m.content);
}

function derivePrompts(result) {
  if (result?.pending?.action) {
    return ["Yes, continue", "Cancel", "1", "2", "3"];
  }
  if (result?.executed) {
    return EIRMON_AI_AGENT_PROMPTS.slice(0, 4);
  }
  return EIRMON_AI_AGENT_PROMPTS;
}

function parseAgentPayload(json) {
  const body = unwrapApiBody(json) ?? json?.data ?? json;
  const reply = String(body?.reply ?? body?.message ?? "").trim();
  if (!reply && json?.success === false) {
    throw { message: json?.message || "AI request failed" };
  }
  if (!reply) return null;

  const result = {
    text: reply,
    action: body?.action ?? null,
    executed: Boolean(body?.executed),
    pending: body?.pending ?? null,
    data: body?.data ?? null,
    source: "agent",
  };
  result.prompts = derivePrompts(result);
  return result;
}

async function postAgent({ message, history, pending }) {
  const token = getToken();
  const url = apiV1Url("/assistant/agent");
  if (!token || !url) return null;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      history,
      pending: pending || null,
    }),
  });

  const raw = await res.text();
  let json = {};
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      if (!res.ok) throw { message: "Invalid response from AI server" };
      return null;
    }
  }

  if (res.status === 404 || res.status === 501) return null;

  if (!res.ok) {
    const msg = json?.message || `AI request failed (${res.status})`;
    if (res.status === 503) {
      return { fallbackLocal: true, message: msg };
    }
    throw { message: msg, status: res.status };
  }

  return parseAgentPayload(json);
}

async function postChat({ message, history }) {
  const token = getToken();
  const url = apiV1Url("/assistant/chat");
  if (!token || !url) return null;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history }),
  });

  if (res.status === 404 || res.status === 501) return null;

  const raw = await res.text();
  let json = {};
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!res.ok) {
    if (res.status === 503) return { fallbackLocal: true, message: json?.message };
    return null;
  }

  const body = unwrapApiBody(json) ?? json;
  const text = String(body?.reply ?? body?.message ?? "").trim();
  if (!text) return null;

  return {
    text,
    source: "chat",
    prompts: EIRMON_AI_AGENT_PROMPTS,
    action: null,
    executed: false,
    pending: null,
    data: null,
  };
}

const ATTENDANCE_ACTIONS = new Set([
  "check_in",
  "check_out",
  "break_start",
  "break_end",
]);

export function notifyAttendanceChanged(action) {
  if (typeof window === "undefined" || !ATTENDANCE_ACTIONS.has(action)) return;
  window.dispatchEvent(
    new CustomEvent("collabflow:attendance-changed", { detail: { action } })
  );
}

/**
 * Send a message to Eirmon AI agent (same as eirmon-crm-app mobile).
 * Falls back to simple chat, then local in-app help.
 */
export async function sendEirmonAiMessage({
  message,
  messages = [],
  pending = null,
  context = {},
}) {
  const history = buildHistory(messages);

  try {
    const agentResult = await postAgent({ message, history, pending });
    if (agentResult?.fallbackLocal) {
      const local = generateEirmonAiReply(message, context);
      return {
        ...local,
        text: `${agentResult.message}\n\n${local.text}`,
        source: "local",
      };
    }
    if (agentResult) {
      if (agentResult.executed && agentResult.action) {
        notifyAttendanceChanged(agentResult.action);
      }
      return agentResult;
    }

    const chatResult = await postChat({ message, history });
    if (chatResult?.fallbackLocal) {
      return {
        ...generateEirmonAiReply(message, context),
        source: "local",
      };
    }
    if (chatResult) return chatResult;
  } catch (err) {
    if (err?.status === 401) throw err;
    const local = generateEirmonAiReply(message, context);
    return {
      ...local,
      text: err?.message
        ? `${err.message}\n\n${local.text}`
        : local.text,
      source: "local",
    };
  }

  return {
    ...generateEirmonAiReply(message, context),
    source: "local",
  };
}
