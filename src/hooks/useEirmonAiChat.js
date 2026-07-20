import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { sendEirmonAiMessage, EIRMON_AI_AGENT_PROMPTS } from "../api/eirmonAi.api";
import { getAgentWelcomeMessage } from "../utils/eirmonAiEngine";
import {
  createConversation,
  createMessage,
  deleteConversation,
  getActiveConversationId,
  loadConversations,
  setActiveConversationId,
  titleFromMessage,
  upsertConversation,
} from "../utils/eirmonAiStorage";

export function useEirmonAiChat({ userName, autoWelcome = true } = {}) {
  const location = useLocation();
  const [conversations, setConversations] = useState(() => loadConversations());
  const [activeId, setActiveId] = useState(() => getActiveConversationId());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [prompts, setPrompts] = useState(EIRMON_AI_AGENT_PROMPTS);
  const endRef = useRef(null);
  const bootstrappedRef = useRef(false);

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null;

  const messages = activeConversation?.messages ?? [];
  const pending = activeConversation?.pending ?? null;

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, sending, scrollToEnd]);

  const persist = useCallback((conv) => {
    const saved = upsertConversation(conv);
    setConversations(loadConversations());
    return saved;
  }, []);

  const startNewChat = useCallback(() => {
    const conv = createConversation();
    if (autoWelcome) {
      const welcome = getAgentWelcomeMessage(userName);
      conv.messages = [
        createMessage("assistant", welcome.text, {
          prompts: welcome.prompts,
          source: "agent",
        }),
      ];
      conv.pending = null;
      setPrompts(welcome.prompts ?? EIRMON_AI_AGENT_PROMPTS);
    }
    persist(conv);
    setActiveId(conv.id);
    setActiveConversationId(conv.id);
    setInput("");
    return conv;
  }, [autoWelcome, userName, persist]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const list = loadConversations();
    if (list.length > 0) {
      const id = getActiveConversationId() || list[0].id;
      setActiveId(id);
      setActiveConversationId(id);
      setConversations(list);
      const current = list.find((c) => c.id === id);
      const lastMsg = current?.messages?.[current.messages.length - 1];
      setPrompts(
        lastMsg?.prompts?.length
          ? lastMsg.prompts
          : EIRMON_AI_AGENT_PROMPTS
      );
      return;
    }
    startNewChat();
  }, [startNewChat]);

  const selectConversation = useCallback((id) => {
    setActiveId(id);
    setActiveConversationId(id);
    const conv = loadConversations().find((c) => c.id === id);
    const lastMsg = conv?.messages?.[conv.messages.length - 1];
    setPrompts(
      lastMsg?.prompts?.length ? lastMsg.prompts : EIRMON_AI_AGENT_PROMPTS
    );
  }, []);

  const removeConversation = useCallback(
    (id) => {
      const list = deleteConversation(id);
      setConversations(list);
      if (activeId === id) {
        if (list.length > 0) selectConversation(list[0].id);
        else startNewChat();
      }
    },
    [activeId, selectConversation, startNewChat]
  );

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = String(text ?? input).trim();
      if (!trimmed || sending) return;

      if (/^cancel$/i.test(trimmed)) {
        let conv =
          activeConversation ??
          conversations.find((c) => c.id === activeId) ??
          startNewChat();
        conv = { ...conv, pending: null };
        const cancelMsg = createMessage("assistant", "Theek hai, cancel kar diya. Aur kuch?", {
          prompts: EIRMON_AI_AGENT_PROMPTS,
          source: "agent",
        });
        conv.messages = [...(conv.messages || []), cancelMsg];
        persist(conv);
        setPrompts(EIRMON_AI_AGENT_PROMPTS);
        setInput("");
        return;
      }

      let conv =
        activeConversation ??
        conversations.find((c) => c.id === activeId) ??
        startNewChat();

      const userMsg = createMessage("user", trimmed);
      const nextMessages = [...(conv.messages || []), userMsg];
      conv = {
        ...conv,
        title: conv.messages?.length ? conv.title : titleFromMessage(trimmed),
        messages: nextMessages,
      };
      persist(conv);
      setInput("");
      setSending(true);
      setPrompts([]);

      try {
        const reply = await sendEirmonAiMessage({
          message: trimmed,
          messages: nextMessages,
          pending: conv.pending,
          context: {
            userName,
            pathname: location.pathname,
          },
        });

        const assistantMsg = createMessage(
          "assistant",
          reply.text || "I couldn't generate a reply. Please try again.",
          {
            prompts: reply.prompts,
            source: reply.source,
            action: reply.action,
            executed: reply.executed,
            pending: reply.pending,
            data: reply.data,
          }
        );

        conv = {
          ...conv,
          messages: [...nextMessages, assistantMsg],
          pending: reply.pending ?? null,
        };
        persist(conv);
        setPrompts(reply.prompts ?? EIRMON_AI_AGENT_PROMPTS);
      } catch {
        const errMsg = createMessage(
          "assistant",
          "Something went wrong. Please try again in a moment.",
          { prompts: EIRMON_AI_AGENT_PROMPTS }
        );
        conv = {
          ...conv,
          messages: [...nextMessages, errMsg],
          pending: null,
        };
        persist(conv);
        setPrompts(EIRMON_AI_AGENT_PROMPTS);
      } finally {
        setSending(false);
      }
    },
    [
      input,
      sending,
      activeConversation,
      conversations,
      activeId,
      startNewChat,
      persist,
      userName,
      location.pathname,
    ]
  );

  const clearCurrentChat = useCallback(() => {
    if (!activeId) return;
    removeConversation(activeId);
  }, [activeId, removeConversation]);

  return {
    conversations,
    activeId,
    activeConversation,
    messages,
    pending,
    input,
    setInput,
    sending,
    prompts,
    endRef,
    sendMessage,
    startNewChat,
    selectConversation,
    removeConversation,
    clearCurrentChat,
  };
}
