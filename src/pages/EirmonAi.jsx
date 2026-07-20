import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaTrash } from "react-icons/fa";
import AppLayout from "../components/layout/AppLayout";
import { GlassButton } from "../components/glass/Glass";
import EirmonAiChatPanel from "../components/EirmonAi/EirmonAiChatPanel";
import { logoutSession } from "../utils/sessionLogout";
import { EIRMON_AI_NAME } from "../utils/eirmonAiBrand";
import { useEirmonAiChat } from "../hooks/useEirmonAiChat";

function readUserName() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return u?.user?.name ?? u?.name ?? "";
  } catch {
    return "";
  }
}

export default function EirmonAi() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState(readUserName);
  const chat = useEirmonAiChat({ userName });

  const {
    conversations,
    activeId,
    startNewChat,
    selectConversation,
    removeConversation,
  } = chat;

  useEffect(() => {
    setUserName(readUserName());
  }, []);

  const handleLogout = () => {
    logoutSession();
    navigate("/login");
  };

  return (
    <AppLayout
      onLogout={handleLogout}
      noPadding
      mainClassName="flex min-h-0 flex-1 overflow-hidden"
    >
      <div className="flex flex-1 min-h-0 overflow-hidden gap-3 p-3 sm:gap-4 sm:p-4 md:p-5">
        <aside className="eirmon-ai-sidebar hidden md:flex w-60 shrink-0 flex-col overflow-hidden lg:w-64">
          <div className="eirmon-ai-sidebar-header px-4 py-4">
            <h1 className="text-lg font-bold theme-text">{EIRMON_AI_NAME}</h1>
            <p className="mt-1 text-xs text-glass-muted">
              CRM agent — tasks, attendance, invoices
            </p>
            <GlassButton
              type="button"
              onClick={startNewChat}
              className="mt-3 flex w-full items-center justify-center gap-2 !py-2 text-sm"
            >
              <FaPlus className="text-xs" />
              New chat
            </GlassButton>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group mb-1 flex items-center gap-1 rounded-xl transition ${
                  conv.id === activeId
                    ? "eirmon-ai-conv-active"
                    : "hover:bg-[var(--theme-hover)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectConversation(conv.id)}
                  className={`flex-1 truncate px-3 py-2.5 text-left text-sm transition ${
                    conv.id === activeId
                      ? "font-medium theme-text"
                      : "text-glass-muted hover:text-[var(--theme-text)]"
                  }`}
                >
                  {conv.title || "New chat"}
                </button>
                <button
                  type="button"
                  onClick={() => removeConversation(conv.id)}
                  className="mr-1 rounded-lg p-2 text-glass-muted opacity-0 hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100 transition"
                  aria-label="Delete chat"
                >
                  <FaTrash className="text-xs" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="eirmon-ai-main flex min-w-0 flex-1 flex-col overflow-hidden">
          <EirmonAiChatPanel chat={chat} showFeatureGrid />
        </section>
      </div>
    </AppLayout>
  );
}
