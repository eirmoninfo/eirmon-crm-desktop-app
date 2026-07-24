import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FaComments,
  FaPaperPlane,
  FaPlus,
  FaSearch,
  FaTimes,
  FaSpinner,
} from "react-icons/fa";
import {
  createTeamChatChannel,
  listTeamChatMessages,
  markTeamChatChannelRead,
  searchTeamChat,
  sendTeamChatMessage,
  startTeamChatDirect,
  teamChatBootstrap,
} from "../api/teamChat.api";
import CreateChannelModal from "../components/TeamChat/CreateChannelModal";
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
  channelLabel,
  extractChatMessage,
  getMessageAttachments,
  getStoredUserId,
  groupMessagesByDate,
  isDirectChannel,
  mergeMessagesById,
  messagePreview,
  normalizeMessage,
  parseBootstrap,
  parseChannel,
  parseMessages,
} from "../utils/teamChatHelpers";

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
import { showAppNotification } from "../utils/appNotification";

const POLL_MS = 4000;

function patchChannelLastMessage(channels, channelId, msg) {
  return channels.map((c) =>
    Number(c.id) === Number(channelId)
      ? {
          ...c,
          last_message: msg,
          last_message_preview: messagePreview(msg),
        }
      : c
  );
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
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("channels");
  const [liveConnected, setLiveConnected] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesRef = useRef([]);
  const fileInputRef = useRef(null);
  const typingClearRef = useRef(null);
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

  const messageItems = useMemo(() => groupMessagesByDate(messages), [messages]);

  const otherUsers = useMemo(
    () => users.filter((u) => String(u.id) !== String(myId)),
    [users, myId]
  );

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const res = await teamChatBootstrap();
      const { channels: ch, users: us } = parseBootstrap(res);
      setChannels(ch);
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

  const applyIncomingMessage = useCallback(
    (rawMsg, channelId) => {
      const msg = normalizeMessage(rawMsg);
      if (!msg?.id) return;

      setMessages((prev) => {
        const next = mergeMessagesById(prev, [msg]);
        messagesRef.current = next;
        return next;
      });

      setChannels((prev) => patchChannelLastMessage(prev, channelId, msg));
    },
    []
  );

  const notifyIncomingMessage = useCallback(
    (msg) => {
      const senderName =
        msg?.user?.name ??
        msg?.sender?.name ??
        msg?.author_name ??
        msg?.user_name ??
        "Someone";
      const preview = String(msg?._displayBody || msg?.body || "").trim();
      const channelName = channelLabel(selectedChannel, usersById) || "Team chat";
      const body = preview
        ? `${senderName}: ${preview}`
        : `${senderName} sent a message`;

      showAppNotification({
        title: `New message · ${channelName}`,
        body,
        toastMessage: body,
        toastOptions: { duration: 6000 },
      }).catch(() => {});
    },
    [selectedChannel, usersById]
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
        } else {
          const next = mergeMessagesById([], list);
          messagesRef.current = next;
          setMessages(next);
        }
        if (!beforeId) {
          await markTeamChatChannelRead(channelId).catch(() => {});
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

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      leaveTeamChatChannel();
      return;
    }

    loadMessages(selectedId);

    const subscribed = subscribeTeamChatChannel(selectedId, {
      onMessage: (payload) => {
        const msg = normalizeIncomingTeamChatPayload(payload);
        if (!msg?.id) return;
        applyIncomingMessage(msg, selectedId);
        if (Number(msg.user_id ?? msg.user?.id) !== Number(myId)) {
          notifyIncomingMessage(msg);
          window.dispatchEvent(
            new CustomEvent("collabflow:team-chat-message", {
              detail: {
                message: msg,
                channelId: selectedId,
                channelName: channelLabel(selectedChannel, usersById),
              },
            })
          );
          markTeamChatChannelRead(selectedId).catch(() => {});
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
    });

    setLiveConnected(subscribed && isEchoConnected());

    return () => {
      leaveTeamChatChannel();
      setLiveConnected(false);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
    };
  }, [selectedId, loadMessages, myId, applyIncomingMessage, notifyIncomingMessage, selectedChannel, usersById]);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openChannel = (id) => navigate(`/team-chat/${id}`);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    const text = composer.trim();
    if (!text && !file) return;

    setSending(true);

    const pendingId = `pending-${Date.now()}`;
    let localPreviewUrl = null;
    if (file?.type?.startsWith("image/")) {
      localPreviewUrl = URL.createObjectURL(file);
      applyIncomingMessage(
        normalizeMessage({
          id: pendingId,
          body: text,
          user_id: myId,
          user: { id: myId },
          created_at: new Date().toISOString(),
          _attachments: [
            {
              url: localPreviewUrl,
              name: file.name,
              mime: file.type,
              isImage: true,
            },
          ],
          _displayBody: text,
        }),
        selectedId
      );
    }

    try {
      const res = await sendTeamChatMessage(selectedId, {
        body: text,
        file: file || undefined,
      });
      const sent =
        extractChatMessage(res) ??
        normalizeMessage(
          unwrapApiBody(res)?.message ?? res?.message ?? res?.data ?? res
        );

      setMessages((prev) => prev.filter((m) => m.id !== pendingId));

      if (sent?.id) {
        applyIncomingMessage(sent, selectedId);
        const hasPreview = getMessageAttachments(sent).length > 0;
        if (file && !hasPreview) {
          await loadMessages(selectedId, { silent: true });
        }
      } else if (file) {
        await loadMessages(selectedId, { silent: true });
      }

      setComposer("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      errToast(err, "Failed to send message");
    } finally {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      setSending(false);
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
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Conversations panel */}
          <aside className="flex w-full max-w-[340px] shrink-0 flex-col border-r border-white/10 bg-white/5 backdrop-blur-xl shadow-sm">
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

              <div className="relative mt-3">
                <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
                <input
                  type="search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Search people & channels…"
                  className="w-full rounded-xl border-0 bg-white/95 py-2.5 pl-9 pr-9 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-eirmon-400"
                />
                {searching ? (
                  <FaSpinner className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-eirmon-600" />
                ) : searchQ.trim() ? (
                  <button
                    type="button"
                    onClick={runSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-0.5 text-[10px] font-bold text-eirmon-700 hover:bg-eirmon-50"
                  >
                    Go
                  </button>
                ) : null}
              </div>
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
                      ? "bg-white text-eirmon-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
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
                  {otherUsers.length === 0 ? (
                    <p className="px-2 text-sm text-slate-500">No users listed.</p>
                  ) : (
                    otherUsers.map((u) => (
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
                  {directChannels.length > 0 && (
                    <section className="mb-3">
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
                  <section>
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
                <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-5 py-3.5 backdrop-blur-md">
                  <TeamChatAvatar
                    name={selectedTitle}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-white">
                      {selectedTitle}
                    </h2>
                    <TypingIndicator names={typingUsers} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
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

                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                  {hasMore && (
                    <div className="mb-4 flex justify-center">
                      <button
                        type="button"
                        disabled={messagesLoading}
                        onClick={() => {
                          const oldest = messages[0];
                          if (oldest?.id)
                            loadMessages(selectedId, {
                              beforeId: oldest.id,
                              append: true,
                            });
                        }}
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
                          />
                        );
                      })}
                    </div>
                  )}
                  <div ref={messagesEndRef} className="h-2" />
                </div>

                <div className="border-t border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:px-6">
                  <form onSubmit={handleSend} className="team-chat-composer p-2">
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
                    <div className="flex items-end gap-2">
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
                      <textarea
                        rows={1}
                        value={composer}
                        onChange={(e) => setComposer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend(e);
                          }
                        }}
                        placeholder="Write a message… (Enter to send)"
                        className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border-0 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-eirmon-400/60"
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
    </AppLayout>
  );
}
