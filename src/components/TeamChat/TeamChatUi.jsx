import { useEffect, useState } from "react";
import { FaDownload, FaHashtag, FaImage, FaSpinner, FaUser } from "react-icons/fa";
import { fetchTeamChatMessageFile } from "../../api/teamChat.api";
import {
  channelLabel,
  getMessageAttachments,
  initialsFromName,
  isDirectChannel,
  messagePreview,
} from "../../utils/teamChatHelpers";

const AVATAR_COLORS = [
  "from-blue-500 to-blue-700",
  "from-violet-500 to-violet-700",
  "from-emerald-500 to-emerald-700",
  "from-amber-500 to-amber-700",
  "from-rose-500 to-rose-700",
  "from-cyan-500 to-cyan-700",
];

function colorForName(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

export function TeamChatAvatar({ name, size = "md", className = "" }) {
  const initials = initialsFromName(name);
  const sz =
    size === "sm"
      ? "h-8 w-8 text-[10px]"
      : size === "lg"
        ? "h-11 w-11 text-sm"
        : "h-9 w-9 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-inner ${colorForName(name)} ${sz} ${className}`}
    >
      {initials}
    </span>
  );
}

export function TypingIndicator({ names = [] }) {
  if (!names.length) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-glass-muted">
      <span className="flex gap-0.5">
        <span className="team-chat-typing-dot h-1.5 w-1.5 rounded-full bg-eirmon-500" />
        <span className="team-chat-typing-dot h-1.5 w-1.5 rounded-full bg-eirmon-500" />
        <span className="team-chat-typing-dot h-1.5 w-1.5 rounded-full bg-eirmon-500" />
      </span>
      <span className="italic">
        {names.join(", ")} {names.length === 1 ? "is" : "are"} typing…
      </span>
    </div>
  );
}

export function DateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-white/10" />
      <span className="rounded-full bg-white/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-glass-muted ring-1 ring-white/10">
        {label}
      </span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

export function ChatEmptyState({ onCreateChannel }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-eirmon-500 to-eirmon-800 text-3xl text-white shadow-xl shadow-eirmon-500/25">
        💬
      </div>
      <h3 className="text-lg font-semibold theme-text">Start a conversation</h3>
      <p className="mt-2 max-w-sm text-sm text-glass-muted">
        Pick a channel from the list, message a teammate directly, or create a new
        team channel.
      </p>
      {onCreateChannel ? (
        <button
          type="button"
          onClick={onCreateChannel}
          className="mt-6 glass-btn glass-btn-primary px-5 py-2.5 text-sm font-semibold"
        >
          Create channel
        </button>
      ) : null}
    </div>
  );
}

export function ChannelListItem({ channel, usersById, active, unread, onSelect }) {
  const label = channelLabel(channel, usersById);
  const direct = isDirectChannel(channel);
  const preview =
    messagePreview(channel.last_message) ||
    channel.last_message_preview ||
    channel.preview ||
    "";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
        active
          ? "team-chat-channel-active"
          : "hover:bg-white/10 hover:shadow-sm"
      }`}
    >
      {direct ? (
        <TeamChatAvatar name={label} size="md" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#64d2ff] ring-1 ring-white/10 group-hover:bg-[#0a84ff]/20">
          <FaHashtag className="text-sm" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold theme-text">
            {label}
          </span>
          {unread > 0 ? (
            <span className="shrink-0 rounded-full bg-gradient-to-r from-eirmon-600 to-eirmon-700 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </span>
        {preview ? (
          <span className="mt-0.5 block truncate text-xs text-glass-muted">
            {preview}
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-glass-muted">No messages yet</span>
        )}
      </span>
    </button>
  );
}

function AuthImage({ att, msg, mine }) {
  const [src, setSrc] = useState(att.url);
  const [loading, setLoading] = useState(Boolean(att.needsAuth));
  const [failed, setFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    let localBlob = null;
    let cancelled = false;

    async function loadAuth() {
      if (!att.needsAuth || !msg?.id) return;
      setLoading(true);
      localBlob = await fetchTeamChatMessageFile(msg.id);
      if (cancelled) return;
      if (localBlob) {
        setBlobUrl(localBlob);
        setSrc(localBlob);
      }
      setLoading(false);
    }

    loadAuth();
    return () => {
      cancelled = true;
      if (localBlob) URL.revokeObjectURL(localBlob);
    };
  }, [att.needsAuth, msg?.id]);

  useEffect(
    () => () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    [blobUrl]
  );

  const tryAuthFallback = async () => {
    if (!msg?.id) {
      setFailed(true);
      return;
    }
    setLoading(true);
    const next = await fetchTeamChatMessageFile(msg.id);
    setLoading(false);
    if (next) {
      setBlobUrl(next);
      setSrc(next);
      return;
    }
    setFailed(true);
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl bg-white/5">
        <FaSpinner className="animate-spin text-eirmon-600" />
      </div>
    );
  }

  if (failed) {
    return (
      <p className={`flex items-center gap-2 text-sm ${mine ? "text-blue-100" : "text-glass-muted"}`}>
        <FaImage />
        {att.name}
      </p>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-xl ring-1 ring-black/10"
    >
      <img
        src={src}
        alt={att.name}
        className="max-h-64 max-w-full object-contain bg-slate-900/5"
        loading="lazy"
        onError={() => {
          void tryAuthFallback();
        }}
      />
    </a>
  );
}

function MessageAttachments({ msg, mine }) {
  const attachments = msg._attachments ?? getMessageAttachments(msg);
  if (!attachments.length) return null;

  return (
    <div className={`space-y-2 ${msg._displayBody ?? msg.body ? "mt-2" : ""}`}>
      {attachments.map((att) =>
        att.isImage ? (
          <AuthImage key={`${att.url}-${att.name}`} att={att} msg={msg} mine={mine} />
        ) : (
          <a
            key={att.url}
            href={att.url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
              mine
                ? "bg-white/15 text-white hover:bg-white/25"
                : "bg-white/10 text-[#64d2ff] hover:bg-white/15"
            }`}
          >
            <FaDownload className="opacity-80" />
            {att.name}
          </a>
        )
      )}
    </div>
  );
}

export function MessageBubble({ msg, mine, showAuthor }) {
  const author = msg?.user?.name ?? msg?.author_name ?? "User";
  const time = msg.created_at;
  const text = msg._displayBody ?? msg.body ?? "";
  const attachments = msg._attachments ?? getMessageAttachments(msg);
  const filenameOnly =
    !attachments.length &&
    text &&
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(text);

  return (
    <div className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && showAuthor ? (
        <TeamChatAvatar name={author} size="sm" className="mt-1" />
      ) : !mine ? (
        <span className="w-8 shrink-0" />
      ) : null}
      <div className={`max-w-[min(78%,28rem)] ${mine ? "items-end" : ""}`}>
        {!mine && showAuthor ? (
          <p className="mb-1 px-1 text-xs font-semibold text-glass-muted">{author}</p>
        ) : null}
        <div className={mine ? "team-chat-bubble-mine" : "team-chat-bubble-theirs"}>
          {text ? (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              {text}
            </p>
          ) : null}
          <MessageAttachments msg={msg} mine={mine} />
          {filenameOnly ? (
            <p
              className={`flex items-center gap-2 text-sm ${
                mine ? "text-blue-100" : "text-slate-500"
              }`}
            >
              <FaImage />
              {text}
              <span className="text-xs opacity-75">(preview unavailable)</span>
            </p>
          ) : null}
        </div>
        <p
          className={`mt-1 px-1 text-[10px] tabular-nums ${
            mine ? "text-right text-glass-muted" : "text-glass-muted"
          }`}
        >
          {time
            ? new Date(time).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </p>
      </div>
    </div>
  );
}

export function DmUserRow({ user, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-white/10"
    >
      <TeamChatAvatar name={user.name ?? user.email} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium theme-text">
        {user.name ?? user.email}
      </span>
      <FaUser className="shrink-0 text-[10px] text-glass-muted" />
    </button>
  );
}
