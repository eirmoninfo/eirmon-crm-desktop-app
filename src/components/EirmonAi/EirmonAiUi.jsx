import { FaPaperPlane, FaRobot, FaSpinner } from "react-icons/fa";
import { EIRMON_AI_LOGO_SRC, EIRMON_AI_NAME } from "../../utils/eirmonAiBrand";
import { EIRMON_AI_FEATURES } from "../../utils/eirmonAiKnowledge";
import AgentDataView from "./AgentDataView";
import { shouldShowAgentData } from "../../utils/formatAgentData";

function renderInline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={j} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={j}>{part}</span>;
  });
}

function renderMarkdownLite(text) {
  const lines = String(text || "").split("\n");
  const nodes = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (!trimmed) {
      nodes.push(<div key={`sp-${i}`} className="h-1" />);
      return;
    }

    if (trimmed.startsWith("• ")) {
      nodes.push(
        <li key={i} className="ml-4 list-disc text-sm leading-relaxed">
          {renderInline(trimmed.slice(2))}
        </li>
      );
      return;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      nodes.push(
        <p key={i} className="text-sm leading-relaxed">
          {renderInline(trimmed)}
        </p>
      );
      return;
    }

    if (/^(In:|Out:|Break:|Status:|Due:|Project:|👤)/i.test(trimmed) || trimmed.startsWith("   ")) {
      nodes.push(
        <p key={i} className="ai-text-subtle ml-1 text-xs leading-relaxed">
          {renderInline(trimmed)}
        </p>
      );
      return;
    }

    nodes.push(
      <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
        {renderInline(trimmed)}
      </p>
    );
  });

  return nodes;
}

export function EirmonAiAvatar({ size = "md", className = "" }) {
  const sz =
    size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-9 w-9";
  return (
    <img
      src={EIRMON_AI_LOGO_SRC}
      alt={EIRMON_AI_NAME}
      className={`${sz} rounded-full object-cover ring-2 ring-[#0a84ff]/30 shadow-sm bg-white/10 ${className}`}
    />
  );
}

export function EirmonAiMessageBubble({ message, onAction }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser ? <EirmonAiAvatar size="sm" className="mt-1 shrink-0" /> : null}
      <div className={`max-w-[min(100%,36rem)] ${isUser ? "items-end" : ""}`}>
        <div
          className={`eirmon-ai-bubble rounded-2xl px-4 py-3 ${
            isUser
              ? "eirmon-ai-bubble-user theme-keep-white rounded-br-md text-white"
              : "eirmon-ai-bubble-ai rounded-bl-md"
          }`}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          ) : (
            <div className="space-y-1.5">{renderMarkdownLite(message.content)}</div>
          )}
        </div>

        {!isUser && message.executed && message.action ? (
          <p className="mt-1.5 text-[11px] font-medium text-[#30d158]">
            ✓ {String(message.action).replace(/_/g, " ")}
          </p>
        ) : null}

        {!isUser && message.pending?.action ? (
          <p className="mt-1.5 text-[11px] font-medium text-[#b8860b]">
            Waiting: {String(message.pending.action).replace(/_/g, " ")} — reply to continue
          </p>
        ) : null}

        {!isUser && message.executed && shouldShowAgentData(message.data, message.action) ? (
          <AgentDataView data={message.data} action={message.action} />
        ) : null}

        {!isUser && message.actions?.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.actions.map((action, idx) => (
              <button
                key={`${action.label}-${idx}`}
                type="button"
                onClick={() => onAction?.(action)}
                className="rounded-full border border-[#0a84ff]/30 bg-[#0a84ff]/15 px-3 py-1 text-xs font-medium text-[#0071e3] transition hover:bg-[#0a84ff]/25"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EirmonAiTyping() {
  return (
    <div className="flex items-center gap-3">
      <EirmonAiAvatar size="sm" />
      <div className="eirmon-ai-bubble eirmon-ai-bubble-ai rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-glass-muted">
          <FaSpinner className="animate-spin text-[#0071e3]" />
          Eirmon AI is thinking…
        </div>
      </div>
    </div>
  );
}

export function EirmonAiFeatureGrid({ onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {EIRMON_AI_FEATURES.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onSelect?.(f)}
          className="glass-card-sm rounded-xl p-3 text-left transition hover:border-[#0a84ff]/30 hover:bg-[#0a84ff]/8"
        >
          <span className="text-xl">{f.icon}</span>
          <p className="mt-1 text-xs font-semibold theme-text">{f.title}</p>
          <p className="mt-0.5 text-[11px] text-glass-subtle line-clamp-2">{f.summary}</p>
        </button>
      ))}
    </div>
  );
}

export function EirmonAiComposer({
  value,
  onChange,
  onSend,
  sending,
  placeholder = "Ask Eirmon AI — check in, show tasks, invoice reminders…",
}) {
  return (
    <form
      className="eirmon-ai-composer flex items-end gap-2 rounded-2xl p-2 backdrop-blur-xl"
      onSubmit={(e) => {
        e.preventDefault();
        onSend?.();
      }}
    >
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend?.();
          }
        }}
        placeholder={placeholder}
        className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none"
      />
      <button
        type="submit"
        disabled={sending || !String(value).trim()}
        className="theme-keep-white flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] text-white shadow-lg shadow-[#0a84ff]/25 hover:opacity-90 disabled:opacity-50 transition"
        aria-label="Send message"
      >
        {sending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
      </button>
    </form>
  );
}

export function EirmonAiHeader({ compact = false, onNewChat }) {
  return (
    <div className="eirmon-ai-header flex items-center gap-3 px-4 py-3.5 backdrop-blur-xl">
      <EirmonAiAvatar size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-bold theme-text">{EIRMON_AI_NAME}</h2>
          <span className="glass-badge-blue text-[10px] uppercase tracking-wide">
            CRM Agent
          </span>
        </div>
        <p className="truncate text-xs text-glass-muted">
          English — tasks, attendance, invoices, clients
        </p>
      </div>
      {onNewChat ? (
        <button
          type="button"
          onClick={onNewChat}
          className="shrink-0 rounded-xl border border-[var(--theme-glass-border-soft)] px-3 py-1.5 text-xs font-medium text-glass-muted transition hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text)]"
        >
          New chat
        </button>
      ) : null}
    </div>
  );
}

export function EirmonAiEmptyHero() {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <div className="theme-keep-white mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] shadow-lg shadow-[#0a84ff]/30">
        <FaRobot className="text-2xl text-white" />
      </div>
      <h3 className="text-lg font-semibold theme-text">How can I help you today?</h3>
      <p className="mt-2 max-w-md text-sm text-glass-muted">
        Ask about punch in/out, tasks, expenses, team chat, leave, or desktop app tips.
      </p>
    </div>
  );
}
