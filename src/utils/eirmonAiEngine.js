import {
  EIRMON_AI_FEATURES,
  EIRMON_AI_QUICK_PROMPTS,
  ROUTE_HINTS,
} from "./eirmonAiKnowledge";

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreFeature(feature, query) {
  let score = 0;
  for (const kw of feature.keywords) {
    const n = normalize(kw);
    if (!n) continue;
    if (query.includes(n)) score += n.split(" ").length >= 2 ? 4 : 2;
    for (const word of n.split(" ")) {
      if (word.length > 2 && query.includes(word)) score += 1;
    }
  }
  if (query.includes(normalize(feature.title))) score += 3;
  return score;
}

function findBestFeature(query) {
  let best = null;
  let bestScore = 0;
  for (const f of EIRMON_AI_FEATURES) {
    const s = scoreFeature(f, query);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  return bestScore >= 2 ? best : null;
}

function greetingReply(name) {
  const who = name ? `, ${name.split(" ")[0]}` : "";
  return {
    text: `Hello${who}! I'm **Eirmon AI**, your workspace assistant.

I can help with:
• Attendance & punch in/out
• Tasks & kanban board
• Expenses & budgets
• Team chat
• Leave requests
• Desktop app tips

Pick a suggestion below or ask your question in plain English.`,
    actions: EIRMON_AI_FEATURES.slice(0, 4).map((f) => ({
      type: "navigate",
      label: f.title,
      route: f.route,
    })),
    prompts: EIRMON_AI_QUICK_PROMPTS,
  };
}

function helpOverview() {
  const lines = EIRMON_AI_FEATURES.map(
    (f) => `• **${f.title}** — ${f.summary}`
  ).join("\n");
  return {
    text: `Here's what I can help you with in **Eirmon CRM**:\n\n${lines}\n\nAsk about any topic, e.g. "How do I punch in?" or "Tasks board help".`,
    actions: EIRMON_AI_FEATURES.map((f) => ({
      type: "navigate",
      label: f.title,
      route: f.route,
    })),
    prompts: EIRMON_AI_QUICK_PROMPTS,
  };
}

function routeContextLine(pathname) {
  if (!pathname) return "";
  const exact = ROUTE_HINTS[pathname];
  if (exact) return exact;
  for (const [route, hint] of Object.entries(ROUTE_HINTS)) {
    if (route !== "/" && pathname.startsWith(route)) return hint;
  }
  return "";
}

/**
 * Local help engine — used when backend AI is unavailable.
 */
export function generateEirmonAiReply(message, { userName, pathname } = {}) {
  const query = normalize(message);
  const context = routeContextLine(pathname);

  if (!query) {
    return greetingReply(userName);
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|namaste)\b/.test(query)) {
    const reply = greetingReply(userName);
    if (context) reply.text += `\n\n_${context}_`;
    return reply;
  }

  if (/help|what can you|features|capabilities|support/.test(query)) {
    const reply = helpOverview();
    if (context) reply.text += `\n\n_${context}_`;
    return reply;
  }

  const feature = findBestFeature(query);
  if (feature) {
    let text = feature.answer;
    if (context && !pathname?.startsWith(feature.route)) {
      text += `\n\n_${context}_`;
    }
    return {
      text,
      actions: [{ type: "navigate", label: `Open ${feature.title}`, route: feature.route }],
      prompts: EIRMON_AI_QUICK_PROMPTS.filter((p) => !normalize(p).includes(normalize(feature.title))),
    };
  }

  if (/thank|thanks|dhanyavad|shukriya/.test(query)) {
    return {
      text: "You're welcome! Ask anytime if you need more help with Eirmon CRM.",
      prompts: ["How do I punch in?", "Explain the Tasks board"],
    };
  }

  return {
    text: `I'm not sure about that yet, but I can help with Eirmon CRM features:

${EIRMON_AI_FEATURES.map((f) => `• **${f.title}**`).join("\n")}

Try asking something like "How do I punch in?" or tap a suggestion below.`,
    actions: EIRMON_AI_FEATURES.slice(0, 3).map((f) => ({
      type: "navigate",
      label: f.title,
      route: f.route,
    })),
    prompts: EIRMON_AI_QUICK_PROMPTS,
  };
}

export function getWelcomeMessage(userName, pathname) {
  const reply = greetingReply(userName);
  const context = routeContextLine(pathname);
  if (context) reply.text += `\n\n_${context}_`;
  return reply;
}

/** Welcome for CRM agent mode (matches eirmon-crm-app). */
export function getAgentWelcomeMessage(userName) {
  const who = userName ? ` ${userName.split(" ")[0]}` : "";
  return {
    text: `Namaste${who}! Main **Eirmon AI** hoon — aapka CRM assistant.

Boliye Hinglish ya English mein. Main ye kar sakta hoon:

• **Attendance** — check in/out, break, aaj ki attendance, monthly report
• **Tasks** — list karo, naya task banao, assign karo
• **Expenses** — list aur create
• **Clients & Leads** — search, create, update
• **Invoices** — list, due invoices, reminders
• **Email** — compose, reply, drafts

Examples:
• "Check me in"
• "Show my tasks"
• "Show this month's attendance report"`,
    prompts: [
      "Check me in",
      "Show my attendance for today",
      "Show my tasks",
      "Show overdue invoices",
    ],
  };
}
