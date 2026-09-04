import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FaArrowDown,
  FaComments,
  FaPaperPlane,
  FaPhone,
  FaPlus,
  FaSearch,
  FaSmile,
  FaTimes,
  FaSpinner,
  FaVideo,
} from "react-icons/fa";
import {
  createTeamChatChannel,
  forwardTeamChatMessage,
  listTeamChatMessages,
  markTeamChatChannelRead,
  markTeamChatMessageDelivered,
  searchTeamChat,
  sendTeamChatMessage,
  startTeamChatDirect,
  teamChatBootstrap,
  toggleTeamChatMessageReaction,
} from "../api/teamChat.api";
import CreateChannelModal from "../components/TeamChat/CreateChannelModal";
import ForwardMessageModal from "../components/TeamChat/ForwardMessageModal";
import EmojiPickerPopover from "../components/TeamChat/EmojiPickerPopover";
import {
  ChannelListItem,
  ChatEmptyState,
  DateSeparator,
  DmUserRow,
  MessageBubble,
  TeamChatAvatar,
  TypingIndicator,
} from "../components/TeamChat/TeamChatUi";
import AppLayout from "../components/layout/AppLayout";
import { logoutSession } from "../utils/sessionLogout";
import { isReverbConfigured } from "../api/api.config";
import { getEcho, isEchoConnected } from "../utils/echo";
import {
  leaveTeamChatChannel,
  subscribeTeamChatChannel,
} from "../utils/teamChatEcho";
import {
  applyMessageDeliveredEvent,
  applyMessageReadEvent,
  channelLabel,
  extractChatMessage,
  getMessageAttachments,
  getStoredUserId,
  groupMessagesByDate,
  isDirectChannel,
  mergeMessagesById,
  messageIdKey,
  messagePreview,
  normalizeMessage,
  parseBootstrap,
  parseChannel,
  parseMessages,
  sortMessagesChronologically,
} from "../utils/teamChatHelpers";
import { toggleReactionLocally } from "../utils/teamChatReactions";
import { startChatCall } from "../utils/teamChatCall";

function normalizeIncomingTeamChatPayload(payload) {
  const direct = extractChatMessage(payload);
  if (direct?.id) return direct;

  const possibleMessage =
    payload?.message ??
    payload?.data?.message ??
    payload?.data ??
    payload;
  const msg = extractChatMessage(possibleMessage);
  if (msg?.id) return msg;

  const fallback = payload?.message ?? payload?.data ?? payload;
  if (fallback && typeof fallback === "object") {
    return normalizeMessage({
      id: fallback.id ?? fallback.message_id ?? fallback.message?.id,
      body: fallback.body ?? fallback.message?.body ?? fallback.preview ?? "",
      user_id: fallback.user_id ?? fallback.user?.id ?? fallback.sender_id,
      user: fallback.user ?? fallback.sender ?? fallback.author ?? null,
      created_at: fallback.created_at ?? fallback.timestamp ?? new Date().toISOString(),
      channel_id: fallback.channel_id ?? fallback.channel?.id ?? null,
      ...fallback,
    });
  }

  return null;
}
import { unwrapApiBody } from "../utils/unwrapApiBody";

const POLL_MS = 4000;
const NEAR_BOTTOM_THRESHOLD = 120;
function patchChannelLastMessage(channels, channelId, msg) {
  const index = channels.findIndex((c) => Number(c.id) === Number(channelId));
  if (index < 0) return channels;
  const current = channels[index];
  const updated = {
    ...current,
    last_message: msg,
    last_message_preview: messagePreview(msg),
  };
  return [updated, ...channels.slice(0, index), ...channels.slice(index + 1)];
}

function sortChannelsByLatest(channels) {
  return [...channels].sort((a, b) => {
    const aTime = new Date(
      a.last_message?.created_at ?? a.last_message_at ?? a.updated_at ?? 0
    ).getTime();
    const bTime = new Date(
      b.last_message?.created_at ?? b.last_message_at ?? b.updated_at ?? 0
    ).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) -
      (Number.isFinite(aTime) ? aTime : 0);
  });
}

function errToast(e, fallback) {
  const msg = e?.message || fallback;
  if (e?.errors && typeof e.errors === "object") {
    const first = Object.values(e.errors).flat()[0];
    if (first) return toast.error(String(first));
  }
  toast.error(msg);
}

export default function TeamChat() {
  const navigate = useNavigate();
  const { channelId: channelIdParam } = useParams();
  const selectedId = channelIdParam ? Number(channelIdParam) : null;

  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("channels");
  const [liveConnected, setLiveConnected] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [forwarding, setForwarding] = useState(false);
  const [callStarting, setCallStarting] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [newMessagesBelow, setNewMessagesBelow] = useState(0);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messagesRef = useRef([]);
  const backgroundMessageIdsRef = useRef(new Set());
  const sendingRef = useRef(false);
  const recentlySentMessageIdsRef = useRef(new Set());
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const typingClearRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const preserveScrollRef = useRef(null);
  const lastTailIdRef = useRef(null);
  const selectedChannelRef = useRef(null);
  const usersByIdRef = useRef(new Map());
  const myId = getStoredUserId();

  const usersById = useMemo(() => {
    const m = new Map();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const selectedChannel = useMemo(
    () => channels.find((c) => Number(c.id) === Number(selectedId)),
    [channels, selectedId]
  );

  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  useEffect(() => {
    usersByIdRef.current = usersById;
  }, [usersById]);

  const { directChannels, groupChannels } = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const list = channels.filter((c) => {
      if (!q) return true;
      return channelLabel(c, usersById).toLowerCase().includes(q);
    });
    return {
      directChannels: list.filter((c) => isDirectChannel(c)),
      groupChannels: list.filter((c) => !isDirectChannel(c)),
    };
  }, [channels, searchQ, usersById]);

  const messageItems = useMemo(
    () => groupMessagesByDate(sortMessagesChronologically(messages)),
    [messages]
  );

  const otherUsers = useMemo(
    () => users.filter((u) => String(u.id) !== String(myId)),
    [users, myId]
  );

  const filteredUsers = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return otherUsers;
    return otherUsers.filter((user) =>
      [user.name, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [otherUsers, searchQ]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    setNewMessagesBelow(0);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distance < NEAR_BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (nearBottom) {
      setNewMessagesBelow(0);
    }
  }, []);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const res = await teamChatBootstrap();
      const { channels: ch, users: us } = parseBootstrap(res);
      setChannels(sortChannelsByLatest(ch));
      setUsers(us);
    } catch (e) {
      errToast(e, "Failed to load team chat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    getEcho();
  }, []);

  useEffect(() => {
    const onGlobalMessage = (event) => {
      const { message, channelId } = event?.detail || {};
      if (!message?.id || channelId == null) return;
      const key = String(message.id);
      if (backgroundMessageIdsRef.current.has(key)) return;
      backgroundMessageIdsRef.current.add(key);
      if (backgroundMessageIdsRef.current.size > 250) {
        backgroundMessageIdsRef.current = new Set(
          [...backgroundMessageIdsRef.current].slice(-150)
        );
      }
      const isActive = Number(channelId) === Number(selectedId);
      setChannels((prev) =>
        patchChannelLastMessage(prev, channelId, message).map((channel) =>
          !isActive && Number(channel.id) === Number(channelId)
            ? {
                ...channel,
                unread_count: (Number(channel.unread_count) || 0) + 1,
              }
            : channel
        )
      );
    };
    window.addEventListener("collabflow:team-chat-message", onGlobalMessage);
    return () =>
      window.removeEventListener("collabflow:team-chat-message", onGlobalMessage);
  }, [selectedId]);

  const applyIncomingMessage = useCallback(
    (rawMsg, channelId) => {
      const msg = normalizeMessage(rawMsg);
      if (!msg?.id) return;

      const messageKey = messageIdKey(msg.id);

      setMessages((prev) => {
        if (messageKey && prev.some((item) => messageIdKey(item.id) === messageKey)) {
          return prev;
        }
        const next = mergeMessagesById(prev, [msg]);
        messagesRef.current = next;
        return next;
      });

      setChannels((prev) => patchChannelLastMessage(prev, channelId, msg));
    },
    []
  );

  const loadMessages = useCallback(
    async (channelId, { beforeId, append, silent } = {}) => {
      if (!channelId) return;
      if (!silent) setMessagesLoading(true);
      try {
        const res = await listTeamChatMessages(channelId, {
          limit: 50,
          ...(beforeId ? { before_id: beforeId } : {}),
        });
        const list = parseMessages(res);
        setHasMore(list.length >= 50);
        if (append) {
          setMessages((prev) => {
            const older = list.filter(
              (m) => !prev.some((p) => p.id === m.id)
            );
            const next = mergeMessagesById(older, prev);
            messagesRef.current = next;
            return next;
          });
        } else if (silent) {
          setMessages((prev) => {
            const next = mergeMessagesById(prev, list);
            const unchanged =
              next.length === prev.length &&
              next.every(
                (message, index) =>
                  String(message.id) === String(prev[index]?.id)
              );
            if (unchanged) return prev;
            messagesRef.current = next;
            return next;
          });
        } else {
          const next = mergeMessagesById([], list);
          messagesRef.current = next;
          setMessages(next);
        }
        if (!beforeId) {
          const lastMsg = list.length ? list[list.length - 1] : null;
          await markTeamChatChannelRead(channelId, lastMsg?.id).catch(() => {});
          setChannels((prev) =>
            prev.map((c) =>
              Number(c.id) === Number(channelId) ? { ...c, unread_count: 0 } : c
            )
          );
        }
      } catch (e) {
        if (!silent) errToast(e, "Failed to load messages");
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    []
  );

  const loadOlderMessages = useCallback(() => {
    if (!messages.length || !selectedId) return;
    const oldest = sortMessagesChronologically(messages)[0];
    if (!oldest?.id) return;
    const container = messagesContainerRef.current;
    preserveScrollRef.current = container
      ? { prevHeight: container.scrollHeight }
      : null;
    loadMessages(selectedId, {
      beforeId: oldest.id,
      append: true,
    });
  }, [messages, selectedId, loadMessages]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setShowScrollToBottom(false);
      setNewMessagesBelow(0);
      lastTailIdRef.current = null;
      isNearBottomRef.current = true;
      leaveTeamChatChannel();
      return;
    }

    forceScrollRef.current = true;
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    setNewMessagesBelow(0);
    lastTailIdRef.current = null;

    loadMessages(selectedId);

    const subscribed = subscribeTeamChatChannel(selectedId, {
      onMessage: (payload) => {
        const msg = normalizeIncomingTeamChatPayload(payload);
        if (!msg?.id) return;

        const messageKey = messageIdKey(msg.id);
        if (messageKey && recentlySentMessageIdsRef.current.has(messageKey)) {
          recentlySentMessageIdsRef.current.delete(messageKey);
          return;
        }

        applyIncomingMessage(msg, selectedId);
        if (Number(msg.user_id ?? msg.user?.id) !== Number(myId)) {
          window.dispatchEvent(
            new CustomEvent("collabflow:team-chat-message", {
              detail: {
                message: msg,
                channelId: selectedId,
                channelName: channelLabel(
                  selectedChannelRef.current,
                  usersByIdRef.current
                ),
              },
            })
          );
          markTeamChatMessageDelivered(selectedId, msg.id).catch(() => {});
          markTeamChatChannelRead(selectedId, msg.id).catch(() => {});
        }
      },
      onTyping: (payload) => {
        const name =
          payload?.user?.name ?? payload?.name ?? payload?.user_name ?? "Someone";
        const uid = payload?.user_id ?? payload?.user?.id;
        if (uid != null && Number(uid) === Number(myId)) return;
        setTypingUsers((prev) =>
          prev.includes(name) ? prev : [...prev, name]
        );
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        typingClearRef.current = setTimeout(() => setTypingUsers([]), 3000);
      },
      onReaction: (payload) => {
        const updated =
          payload?.message ?? payload?.data?.message ?? payload?.data ?? payload;
        if (!updated?.id) return;
        setMessages((current) =>
          current.map((message) =>
            String(message.id) === String(updated.id)
              ? normalizeMessage({ ...message, ...updated })
              : message
          )
        );
      },
      onMessageRead: (payload) => {
        setMessages((current) => {
          const next = applyMessageReadEvent(current, payload, myId);
          messagesRef.current = next;
          return next;
        });
      },
      onMessageDelivered: (payload) => {
        setMessages((current) => {
          const next = applyMessageDeliveredEvent(current, payload, myId);
          messagesRef.current = next;
          return next;
        });
      },
    });

    setLiveConnected(subscribed && isEchoConnected());

    return () => {
      leaveTeamChatChannel();
      setLiveConnected(false);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
    };
  }, [selectedId, loadMessages, myId, applyIncomingMessage]);

  /** Global Echo read/delivery receipts (works even when channel subscription races). */
  useEffect(() => {
    if (!selectedId) return;

    const onRead = (event) => {
      const detail = event?.detail ?? {};
      if (Number(detail.channel_id) !== Number(selectedId)) return;
      setMessages((current) => {
        const next = applyMessageReadEvent(current, detail, myId);
        messagesRef.current = next;
        return next;
      });
    };

    const onDelivered = (event) => {
      const detail = event?.detail ?? {};
      if (Number(detail.channel_id) !== Number(selectedId)) return;
      setMessages((current) => {
        const next = applyMessageDeliveredEvent(current, detail, myId);
        messagesRef.current = next;
        return next;
      });
    };

    window.addEventListener("collabflow:team-chat-read", onRead);
    window.addEventListener("collabflow:team-chat-delivered", onDelivered);
    return () => {
      window.removeEventListener("collabflow:team-chat-read", onRead);
      window.removeEventListener("collabflow:team-chat-delivered", onDelivered);
    };
  }, [selectedId, myId]);

  /** Poll when WebSocket is off or as backup so chat stays near real-time. */
  useEffect(() => {
    if (!selectedId) return;

    const poll = () => {
      loadMessages(selectedId, { silent: true }).catch(() => {});
      setLiveConnected(isReverbConfigured() && isEchoConnected());
    };

    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const tailMessage = messages[messages.length - 1];
    const tailId = tailMessage?.id ?? null;
    const tailChanged =
      tailId != null && String(tailId) !== String(lastTailIdRef.current);
    lastTailIdRef.current = tailId;

    if (preserveScrollRef.current && messagesContainerRef.current) {
      const { prevHeight } = preserveScrollRef.current;
      preserveScrollRef.current = null;
      const container = messagesContainerRef.current;
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight - prevHeight;
      });
      return;
    }

    if (forceScrollRef.current) {
      forceScrollRef.current = false;
      requestAnimationFrame(() => scrollToBottom("auto"));
      return;
    }

    if (!tailChanged) return;

    if (isNearBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
      return;
    }

    setNewMessagesBelow((count) => count + 1);
    setShowScrollToBottom(true);
  }, [messages, scrollToBottom]);

  const openChannel = (id) => {
    setReplyingTo(null);
    setForwardingMessage(null);
    setEmojiOpen(false);
    navigate(`/team-chat/${id}`);
  };

  const insertEmoji = (emoji) => {
    const input = composerRef.current;
    const start = input?.selectionStart ?? selectionRef.current.start ?? composer.length;
    const end = input?.selectionEnd ?? selectionRef.current.end ?? start;
    const next = `${composer.slice(0, start)}${emoji}${composer.slice(end)}`;
    const cursor = start + emoji.length;
    setComposer(next);
    selectionRef.current = { start: cursor, end: cursor };
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const handleReaction = async (message, emoji) => {
    if (!message?.id || String(message.id).startsWith("pending-")) return;
    const user = usersById.get(Number(myId)) ?? { id: myId, name: "You" };
    setMessages((current) =>
      current.map((item) =>
        String(item.id) === String(message.id)
          ? toggleReactionLocally(item, emoji, user)
          : item
      )
    );
    try {
      await toggleTeamChatMessageReaction(message.id, emoji);
    } catch (error) {
      setMessages((current) =>
        current.map((item) =>
          String(item.id) === String(message.id)
            ? toggleReactionLocally(item, emoji, user)
            : item
        )
      );
      errToast(error, "Reactions are not available on this server yet");
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedId || sendingRef.current) return;
    const text = composer.trim();
    if (!text && !file) return;

    sendingRef.current = true;
    setSending(true);
    forceScrollRef.current = true;

    const pendingId = `pending-${Date.now()}`;
    let localPreviewUrl = null;
    const pendingMessage = normalizeMessage({
      id: pendingId,
      body: text,
      user_id: myId,
      user: { id: myId },
      created_at: new Date().toISOString(),
      read_receipt: {
        status: "sent",
        read_count: 0,
        delivered_count: 0,
        total_recipients: 1,
      },
      ...(replyingTo
        ? {
            reply_to_id: replyingTo.id,
            reply_to: replyingTo,
          }
        : {}),
      _displayBody: text,
    });

    if (file?.type?.startsWith("image/")) {
      localPreviewUrl = URL.createObjectURL(file);
      applyIncomingMessage(
        normalizeMessage({
          ...pendingMessage,
          _attachments: [
            {
              url: localPreviewUrl,
              name: file.name,
              mime: file.type,
              isImage: true,
            },
          ],
        }),
        selectedId
      );
    } else if (text) {
      applyIncomingMessage(pendingMessage, selectedId);
    }

    try {
      const res = await sendTeamChatMessage(selectedId, {
        body: text,
        file: file || undefined,
        replyToId: replyingTo?.id ?? null,
      });
      const sent =
        extractChatMessage(res) ??
        normalizeMessage(
          unwrapApiBody(res)?.message ?? res?.message ?? res?.data ?? res
        );

      setMessages((prev) => prev.filter((m) => m.id !== pendingId));

      if (sent?.id) {
        recentlySentMessageIdsRef.current.add(messageIdKey(sent.id));
        applyIncomingMessage(
          normalizeMessage({
            ...sent,
            read_receipt: sent.read_receipt ?? {
              status: "sent",
              read_count: 0,
              delivered_count: 0,
              total_recipients: 1,
            },
          }),
          selectedId
        );
        const hasPreview = getMessageAttachments(sent).length > 0;
        if (file && !hasPreview) {
          await loadMessages(selectedId, { silent: true });
        }
      } else if (file) {
        await loadMessages(selectedId, { silent: true });
      }

      setComposer("");
      setFile(null);
      setReplyingTo(null);
      setEmojiOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      errToast(err, "Failed to send message");
    } finally {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleForwardToChannels = async (channelIds) => {
    if (!forwardingMessage?.id || !channelIds.length) return;
    setForwarding(true);
    try {
      for (const channelId of channelIds) {
        await forwardTeamChatMessage(forwardingMessage, channelId);
      }
      toast.success(
        channelIds.length === 1
          ? "Message forwarded"
          : `Forwarded to ${channelIds.length} chats`
      );
      setForwardingMessage(null);
      await loadBootstrap();
      if (channelIds.some((id) => Number(id) === Number(selectedId))) {
        await loadMessages(selectedId, { silent: true });
        forceScrollRef.current = true;
      }
    } catch (error) {
      errToast(error, "Failed to forward message");
    } finally {
      setForwarding(false);
    }
  };

  const handleCreateChannel = async (payload) => {
    setCreating(true);
    try {
      const res = await createTeamChatChannel(payload);
      const ch = parseChannel(res);
      const id = ch?.id ?? res?.channel?.id ?? res?.data?.id;
      toast.success("Channel created");
      setCreateOpen(false);
      await loadBootstrap();
      if (id) openChannel(id);
    } catch (err) {
      errToast(err, "Failed to create channel");
    } finally {
      setCreating(false);
    }
  };

  const handleStartDm = async (userId) => {
    try {
      const res = await startTeamChatDirect(userId);
      const ch = parseChannel(res);
      const id = ch?.id ?? res?.channel?.id;
      await loadBootstrap();
      if (id) openChannel(id);
      else toast.error("Could not open direct message");
    } catch (err) {
      errToast(err, "Failed to start direct message");
    }
  };

  const handleStartCall = async (video) => {
    if (!selectedChannel || callStarting) return;
    setCallStarting(true);
    try {
      const { meeting, joinSettings } = await startChatCall({
        channel: selectedChannel,
        video,
      });
      navigate(`/meetings/${meeting.uuid}`, {
        state: {
          autoJoin: true,
          joinSettings,
          returnTo: selectedId ? `/team-chat/${selectedId}` : "/team-chat",
        },
      });
      sessionStorage.setItem(
        "collabflow:meeting-return-to",
        selectedId ? `/team-chat/${selectedId}` : "/team-chat"
      );
    } catch (error) {
      errToast(error, video ? "Could not start video call" : "Could not start audio call");
    } finally {
      setCallStarting(false);
    }
  };

  const runSearch = async () => {
    const q = searchQ.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await searchTeamChat(q);
      const raw = unwrapApiBody(res) ?? res;
      setSearchResults(
        raw?.results ?? raw?.messages ?? raw?.channels ?? raw ?? []
      );
    } catch (err) {
      errToast(err, "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleLogout = () => {
    logoutSession();
    navigate("/login");
  };

  const selectedTitle = channelLabel(selectedChannel, usersById);

  const shouldShowAuthor = (index, msg) => {
    const authorId = msg.user_id ?? msg.user?.id;
    for (let i = index - 1; i >= 0; i--) {
      const it = messageItems[i];
      if (it.kind === "date") return true;
      if (it.kind === "message") {
        const prevId = it.msg.user_id ?? it.msg.user?.id;
        return authorId !== prevId;
      }
    }
    return true;
  };

  return (
    <AppLayout
      onLogout={handleLogout}
      noPadding
      mainClassName="flex min-h-0 flex-1 overflow-hidden"
    >
        <div className="team-chat-page flex min-h-0 flex-1 overflow-hidden">
          {/* Conversations panel */}
          <aside className="team-chat-sidebar flex w-full max-w-[340px] shrink-0 flex-col backdrop-blur-xl shadow-sm">
            <div className="border-b border-slate-200/70 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-4 py-4 text-white">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200/90">
                    Workspace
                  </p>
                  <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                    <FaComments className="text-blue-300" />
                    Team chat
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20"
                  title="Create channel"
                >
                  <FaPlus />
                </button>
              </div>

              <form
                className="relative mt-3"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  runSearch();
                }}
              >
                <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
                <input
                  type="search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search people & channels…"
                  aria-label="Search people, channels, and messages"
                  className="w-full rounded-xl border-0 bg-white/95 py-2.5 pl-9 pr-9 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-eirmon-400"
                />
                {searching ? (
                  <FaSpinner className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-eirmon-600" />
                ) : searchQ.trim() ? (
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-0.5 text-[10px] font-bold text-eirmon-700 hover:bg-eirmon-50"
                  >
                    Go
                  </button>
                ) : null}
              </form>
            </div>

            {searchResults != null && (
              <div className="border-b border-eirmon-100 bg-eirmon-50/80 px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-eirmon-800">
                    Search
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchResults(null)}
                    className="rounded p-1 text-slate-500 hover:bg-white"
                  >
                    <FaTimes />
                  </button>
                </div>
                <ul className="max-h-28 space-y-0.5 overflow-y-auto">
                  {(Array.isArray(searchResults) ? searchResults : []).map(
                    (item, i) => (
                      <li key={item.id ?? i}>
                        <button
                          type="button"
                          className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-white"
                          onClick={() => {
                            const cid =
                              item.channel_id ?? item.channel?.id ?? item.id;
                            if (cid) openChannel(cid);
                            setSearchResults(null);
                          }}
                        >
                          {item.body ?? item.name ?? item.title ?? "Result"}
                        </button>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            <div className="flex border-b border-slate-200/80 px-2 pt-2">
              {[
                { id: "channels", label: "Channels" },
                { id: "people", label: "People" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSidebarTab(tab.id)}
                  className={`flex-1 rounded-t-lg px-3 py-2 text-xs font-semibold transition ${
                    sidebarTab === tab.id
                      ? "team-chat-tab-active shadow-sm"
                      : "team-chat-tab-inactive"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {loading ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <FaSpinner className="animate-spin text-2xl text-eirmon-600" />
                  <p className="text-sm text-slate-500">Loading conversations…</p>
                </div>
              ) : sidebarTab === "people" ? (
                <div className="px-2">
                  <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Start direct message
                  </p>
                  {filteredUsers.length === 0 ? (
                    <p className="px-2 text-sm text-slate-500">No users listed.</p>
                  ) : (
                    filteredUsers.map((u) => (
                      <DmUserRow
                        key={u.id}
                        user={u}
                        onSelect={() => handleStartDm(u.id)}
                      />
                    ))
                  )}
                </div>
              ) : (
                <>
                  <section className="mb-3">
                    <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Channels
                    </p>
                    {groupChannels.length === 0 && directChannels.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-slate-500">
                        No conversations yet.
                        <br />
                        <button
                          type="button"
                          onClick={() => setCreateOpen(true)}
                          className="mt-2 font-semibold text-eirmon-600 hover:underline"
                        >
                          Create one
                        </button>
                      </p>
                    ) : (
                      groupChannels.map((ch) => (
                        <ChannelListItem
                          key={ch.id}
                          channel={ch}
                          usersById={usersById}
                          active={Number(ch.id) === Number(selectedId)}
                          unread={Number(ch.unread_count) || 0}
                          onSelect={() => openChannel(ch.id)}
                        />
                      ))
                    )}
                  </section>
                  {directChannels.length > 0 && (
                    <section>
                      <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Direct
                      </p>
                      {directChannels.map((ch) => (
                        <ChannelListItem
                          key={ch.id}
                          channel={ch}
                          usersById={usersById}
                          active={Number(ch.id) === Number(selectedId)}
                          unread={Number(ch.unread_count) || 0}
                          onSelect={() => openChannel(ch.id)}
                        />
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          </aside>

          {/* Chat thread */}
          <main className="team-chat-shell flex min-w-0 flex-1 flex-col">
            {!selectedId ? (
              <ChatEmptyState onCreateChannel={() => setCreateOpen(true)} />
            ) : (
              <>
                <div className="team-chat-thread-header flex items-center gap-3 px-5 py-3.5 backdrop-blur-md">
                  <TeamChatAvatar
                    name={selectedTitle}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold theme-text">
                      {selectedTitle}
                    </h2>
                    <TypingIndicator names={typingUsers} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartCall(true)}
                      disabled={callStarting}
                      className="team-chat-call-btn"
                      title="Video call"
                      aria-label="Start video call"
                    >
                      {callStarting ? (
                        <FaSpinner className="animate-spin text-sm" />
                      ) : (
                        <FaVideo className="text-sm" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartCall(false)}
                      disabled={callStarting}
                      className="team-chat-call-btn"
                      title="Audio call"
                      aria-label="Start audio call"
                    >
                      <FaPhone className="text-sm" />
                    </button>
                    <div className="flex flex-col items-end gap-1">
                    {isDirectChannel(selectedChannel) ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200/80">
                        Direct
                      </span>
                    ) : (
                      <span className="rounded-full bg-eirmon-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-eirmon-700 ring-1 ring-eirmon-200/80">
                        Channel
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        liveConnected
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                      title={
                        liveConnected
                          ? "Connected to live updates"
                          : "Polling every few seconds (configure Reverb for instant updates)"
                      }
                    >
                      {liveConnected ? "● Live" : "↻ Syncing"}
                    </span>
                    </div>
                  </div>
                </div>

                <div className="relative min-h-0 flex-1">
                  <div
                    ref={messagesContainerRef}
                    onScroll={handleMessagesScroll}
                    className="h-full overflow-y-auto px-4 py-4 sm:px-6"
                  >
                    {hasMore && (
                      <div className="mb-4 flex justify-center">
                        <button
                          type="button"
                          disabled={messagesLoading}
                          onClick={loadOlderMessages}
                          className="rounded-full bg-white/90 px-4 py-1.5 text-xs font-semibold text-eirmon-700 shadow-sm ring-1 ring-slate-200/80 hover:bg-eirmon-50 disabled:opacity-50"
                        >
                          {messagesLoading ? "Loading…" : "Load older messages"}
                        </button>
                      </div>
                    )}

                  {messagesLoading && messages.length === 0 ? (
                    <div className="flex justify-center py-16">
                      <FaSpinner className="animate-spin text-2xl text-eirmon-600" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-16 text-center">
                      <p className="text-sm font-medium text-slate-600">
                        No messages yet
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Send the first message below
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messageItems.map((item, index) => {
                        if (item.kind === "date") {
                          return (
                            <DateSeparator key={item.key} label={item.label} />
                          );
                        }
                        const msg = item.msg;
                        const mine =
                          Number(msg.user_id ?? msg.user?.id) === Number(myId);

                        return (
                          <MessageBubble
                            key={item.key}
                            msg={msg}
                            mine={mine}
                            showAuthor={!mine && shouldShowAuthor(index, msg)}
                            currentUserId={myId}
                            onReact={(emoji) => handleReaction(msg, emoji)}
                            onReply={(message) => {
                              setReplyingTo(message);
                              window.requestAnimationFrame(() => {
                                document
                                  .querySelector(".team-chat-message-input")
                                  ?.focus();
                              });
                            }}
                            onForward={(message) => setForwardingMessage(message)}
                          />
                        );
                      })}
                    </div>
                  )}
                  <div ref={messagesEndRef} className="h-2" />
                  </div>

                  {showScrollToBottom ? (
                    <button
                      type="button"
                      onClick={() => scrollToBottom("smooth")}
                      className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-eirmon-600 px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-eirmon-700"
                    >
                      <FaArrowDown className="text-[10px]" />
                      {newMessagesBelow > 0
                        ? `${newMessagesBelow} new message${newMessagesBelow === 1 ? "" : "s"}`
                        : "Jump to latest"}
                    </button>
                  ) : null}
                </div>

                <div className="team-chat-composer-wrap p-4 backdrop-blur-sm sm:px-6">
                  <form onSubmit={handleSend} className="team-chat-composer p-2">
                    {replyingTo ? (
                      <div className="mb-2 flex items-center gap-3 rounded-xl border-l-4 border-eirmon-500 bg-black/5 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-eirmon-600">
                            Replying to{" "}
                            {replyingTo?.user?.name ??
                              replyingTo?.author_name ??
                              "message"}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-glass-muted">
                            {messagePreview(replyingTo) || "Attachment"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingTo(null)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-glass-muted hover:bg-black/10"
                          title="Cancel reply"
                          aria-label="Cancel reply"
                        >
                          <FaTimes />
                        </button>
                      </div>
                    ) : null}
                    {file ? (
                      <div className="mb-2 flex items-center justify-between rounded-lg bg-eirmon-50 px-3 py-2 text-xs text-eirmon-900">
                        <span className="truncate font-medium">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                          className="text-eirmon-700 hover:text-eirmon-900"
                        >
                          <FaTimes />
                        </button>
                      </div>
                    ) : null}
                    <div className="relative flex items-end gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                      >
                        Attach
                      </button>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            const input = composerRef.current;
                            selectionRef.current = {
                              start: input?.selectionStart ?? composer.length,
                              end: input?.selectionEnd ?? composer.length,
                            };
                            setEmojiOpen((open) => !open);
                          }}
                          className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg transition ${
                            emojiOpen
                              ? "bg-eirmon-100 text-eirmon-700"
                              : "text-slate-500 hover:bg-slate-100 hover:text-eirmon-600"
                          }`}
                          title="Add emoji"
                          aria-label="Add emoji"
                          aria-expanded={emojiOpen}
                        >
                          <FaSmile />
                        </button>
                        <EmojiPickerPopover
                          open={emojiOpen}
                          onClose={() => setEmojiOpen(false)}
                          onSelect={insertEmoji}
                          userId={myId}
                        />
                      </div>
                      <textarea
                        ref={composerRef}
                        rows={1}
                        value={composer}
                        onChange={(e) => {
                          setComposer(e.target.value);
                          selectionRef.current = {
                            start: e.target.selectionStart,
                            end: e.target.selectionEnd,
                          };
                        }}
                        onSelect={(e) => {
                          selectionRef.current = {
                            start: e.currentTarget.selectionStart,
                            end: e.currentTarget.selectionEnd,
                          };
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (!sendingRef.current) {
                              handleSend(e);
                            }
                          }
                        }}
                        placeholder="Write a message… (Enter to send)"
                        className="team-chat-message-input max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border-0 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-eirmon-400/60"
                      />
                      <button
                        type="submit"
                        disabled={sending || (!composer.trim() && !file)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-eirmon-600 to-eirmon-800 text-white shadow-md transition hover:from-eirmon-700 hover:to-eirmon-900 disabled:opacity-40"
                        title="Send"
                      >
                        {sending ? (
                          <FaSpinner className="animate-spin" />
                        ) : (
                          <FaPaperPlane className="text-sm" />
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </main>
        </div>

      <CreateChannelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        users={users}
        currentUserId={myId}
        onSubmit={handleCreateChannel}
        submitting={creating}
      />
      <ForwardMessageModal
        open={Boolean(forwardingMessage)}
        message={forwardingMessage}
        channels={channels}
        usersById={usersById}
        currentChannelId={selectedId}
        onClose={() => setForwardingMessage(null)}
        onForward={handleForwardToChannels}
        submitting={forwarding}
      />
    </AppLayout>
  );
}
