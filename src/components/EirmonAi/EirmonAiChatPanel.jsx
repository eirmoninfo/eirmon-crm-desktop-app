import { useNavigate } from "react-router-dom";
import {
  EirmonAiComposer,
  EirmonAiFeatureGrid,
  EirmonAiHeader,
  EirmonAiMessageBubble,
  EirmonAiTyping,
} from "./EirmonAiUi";

export default function EirmonAiChatPanel({
  chat,
  compact = false,
  showFeatureGrid = false,
  onClose,
}) {
  const navigate = useNavigate();
  const {
    messages,
    pending,
    input,
    setInput,
    sending,
    prompts,
    endRef,
    sendMessage,
    startNewChat,
  } = chat;

  const handleAction = (action) => {
    if (action?.type === "navigate" && action.route) {
      navigate(action.route);
      onClose?.();
    }
  };

  const handleFeatureSelect = (feature) => {
    sendMessage(`Help me with ${feature.title.toLowerCase()}`);
  };

  return (
    <div className="eirmon-ai-chat flex h-full min-h-0 flex-col">
      <EirmonAiHeader compact={compact} onNewChat={startNewChat} />

      {pending?.action ? (
        <div className="shrink-0 border-b border-[#ffd60a]/25 bg-[#ffd60a]/12 px-4 py-2.5 text-xs text-[#8a6d00]">
          <span className="font-semibold theme-text">In progress:</span>{" "}
          {String(pending.action).replace(/_/g, " ")} — reply to continue or type{" "}
          <button
            type="button"
            onClick={() => sendMessage("cancel")}
            className="font-semibold theme-text underline decoration-[#ffd60a]/50 hover:decoration-[#ffd60a]"
          >
            cancel
          </button>
        </div>
      ) : null}

      <div className="eirmon-ai-messages flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-5 sm:px-6">
        {showFeatureGrid && messages.length <= 1 ? (
          <EirmonAiFeatureGrid onSelect={handleFeatureSelect} />
        ) : null}

        {messages.map((msg) => (
          <EirmonAiMessageBubble
            key={msg.id}
            message={msg}
            onAction={handleAction}
          />
        ))}

        {sending ? <EirmonAiTyping /> : null}
        <div ref={endRef} />
      </div>

      {prompts?.length > 0 && !sending ? (
        <div className="eirmon-ai-strip shrink-0 px-4 py-3 backdrop-blur-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-glass-subtle">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-2">
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => sendMessage(p)}
                className="eirmon-ai-suggestion rounded-full px-3 py-1.5 text-xs transition"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="eirmon-ai-strip shrink-0 p-3 backdrop-blur-xl sm:p-4">
        <EirmonAiComposer
          value={input}
          onChange={setInput}
          onSend={() => sendMessage()}
          sending={sending}
        />
      </div>
    </div>
  );
}
