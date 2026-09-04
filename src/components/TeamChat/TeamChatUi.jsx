import { useEffect, useState } from "react";
import {
  FaDownload,
  FaHashtag,
  FaImage,
  FaReply,
  FaShare,
  FaSpinner,
  FaUser,
  FaSmile,
} from "react-icons/fa";
import EmojiPickerPopover from "./EmojiPickerPopover";
import { fetchTeamChatMessageFile } from "../../api/teamChat.api";
import {
  channelLabel,
  getForwardedContext,
  getMessageAttachments,
  initialsFromName,
  isDirectChannel,
  messagePreview,
  readReceiptLabel,
} from "../../utils/teamChatHelpers";
import {
  isEmojiOnlyMessage,
  normalizeReactions,
  QUICK_REACTIONS,
} from "../../utils/teamChatReactions";

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
            <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
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

function downloadImageFile(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "image";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function AuthImage({ att, msg, mine }) {
  const [src, setSrc] = useState(att.url);
  const [loading, setLoading] = useState(Boolean(att.needsAuth));
  const [failed, setFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [downloading, setDownloading] = useState(false);

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

  const handleDownload = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (downloading) return;

    const filename = att.name || "image.png";
    setDownloading(true);
    try {
      if (blobUrl) {
        downloadImageFile(blobUrl, filename);
        return;
      }

      if (msg?.id) {
        const localBlob = await fetchTeamChatMessageFile(msg.id);
        if (localBlob) {
          downloadImageFile(localBlob, filename);
          URL.revokeObjectURL(localBlob);
          return;
        }
      }

      const response = await fetch(src);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      downloadImageFile(objectUrl, filename);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(src, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
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
    <div className="team-chat-image-wrap group/image relative inline-block max-w-full overflow-hidden rounded-xl ring-1 ring-black/10">
      <a href={src} target="_blank" rel="noreferrer" className="block">
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
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="team-chat-image-download absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white opacity-0 shadow-lg backdrop-blur-sm transition hover:bg-black/80 focus:opacity-100 group-hover/image:opacity-100 disabled:opacity-70"
        title="Download image"
        aria-label="Download image"
      >
        {downloading ? (
          <FaSpinner className="animate-spin text-xs" />
        ) : (
          <FaDownload className="text-xs" />
        )}
      </button>
    </div>
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

export function ReadReceipt({ receipt }) {
  const status = receipt?.status || "sent";
  const label = readReceiptLabel(receipt || { status: "sent" });
  const isDouble = status === "delivered" || status === "read";

  return (
    <span
      className={`team-chat-read-receipt team-chat-read-receipt--${status}`}
      title={label}
      aria-label={label}
    >
      {isDouble ? (
        <span className="team-chat-tick-double">
          <span className="team-chat-tick team-chat-tick--a">✓</span>
          <span className="team-chat-tick team-chat-tick--b">✓</span>
        </span>
      ) : (
        <span className="team-chat-tick">✓</span>
      )}
    </span>
  );
}

export function MessageBubble({
  msg,
  mine,
  showAuthor,
  onReply,
  onForward,
  onReact,
  currentUserId,
}) {
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [allReactionsOpen, setAllReactionsOpen] = useState(false);
  const author = msg?.user?.name ?? msg?.author_name ?? "User";
  const time = msg.created_at;
  const text = msg._displayBody ?? msg.body ?? "";
  const attachments = msg._attachments ?? getMessageAttachments(msg);
  const filenameOnly =
    !attachments.length &&
    text &&
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(text);
  const repliedMessage =
    msg.reply_to ??
    msg.reply_to_message ??
    msg.replied_message ??
    msg.parent_message ??
    null;
  const repliedAuthor =
    repliedMessage?.user?.name ??
    repliedMessage?.author_name ??
    repliedMessage?.user_name ??
    "Message";
  const repliedText = messagePreview(repliedMessage);
  const forwardedContext = getForwardedContext(msg);
  const reactions = normalizeReactions(msg);

  return (
    <div className={`group flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
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
          {forwardedContext ? (
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-75">
              <FaShare className="text-[10px]" />
              Forwarded
            </div>
          ) : null}
          {forwardedContext?.preview ? (
            <div className="mb-2 rounded-lg border-l-2 border-current bg-black/10 px-3 py-2 text-xs opacity-80">
              <p className="font-semibold">{forwardedContext.author}</p>
              <p className="mt-0.5 max-w-72 truncate">
                {forwardedContext.preview || "Attachment"}
              </p>
            </div>
          ) : null}
          {repliedMessage ? (
            <div className="mb-2 rounded-lg border-l-2 border-current bg-black/10 px-3 py-2 text-xs opacity-80">
              <p className="font-semibold">{repliedAuthor}</p>
              <p className="mt-0.5 max-w-72 truncate">
                {repliedText || "Attachment"}
              </p>
            </div>
          ) : null}
          {text ? (
            <p
              className={`whitespace-pre-wrap break-words leading-relaxed ${
                isEmojiOnlyMessage(text) && !attachments.length
                  ? "text-4xl tracking-wide"
                  : "text-[15px]"
              }`}
            >
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
          {mine ? (
            <div className="mt-1 flex items-end justify-end gap-1.5 self-end">
              {time ? (
                <span className="text-[10px] tabular-nums text-blue-100/80">
                  {new Date(time).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
              <ReadReceipt receipt={msg.read_receipt} />
            </div>
          ) : null}
        </div>
        {reactions.length ? (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
            {reactions.map((reaction) => {
              const reacted = reaction.users.some(
                (user) => String(user.id) === String(currentUserId)
              );
              const names = reaction.users.map((user) => user.name || "User").join(", ");
              return (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => onReact?.(reaction.emoji)}
                  className={`team-chat-reaction-pill ${reacted ? "is-mine" : ""}`}
                  title={names || `${reaction.count} reaction${reaction.count === 1 ? "" : "s"}`}
                  aria-label={`${reaction.emoji}, ${reaction.count} reaction${reaction.count === 1 ? "" : "s"}${reacted ? ", selected by you" : ""}`}
                >
                  <span>{reaction.emoji}</span>
                  <span>{reaction.count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <p
          className={`mt-1 flex items-center gap-1 px-1 text-[10px] tabular-nums ${
            mine ? "hidden" : "text-glass-muted"
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
      {onForward ? (
        <button
          type="button"
          onClick={() => onForward(msg)}
          className="mt-7 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-glass-muted opacity-0 transition hover:bg-white/10 hover:text-eirmon-500 focus:opacity-100 group-hover:opacity-100"
          title="Forward"
          aria-label="Forward message"
        >
          <FaShare className="text-xs" />
        </button>
      ) : null}
      {onReply ? (
        <button
          type="button"
          onClick={() => onReply(msg)}
          className="mt-7 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-glass-muted opacity-0 transition hover:bg-white/10 hover:text-eirmon-500 focus:opacity-100 group-hover:opacity-100"
          title="Reply"
          aria-label="Reply to message"
        >
          <FaReply className="text-xs" />
        </button>
      ) : null}
      {onReact ? (
        <div className="relative mt-7">
          <button
            type="button"
            onClick={() => setReactionMenuOpen((open) => !open)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-glass-muted opacity-0 transition hover:bg-white/10 hover:text-eirmon-500 focus:opacity-100 group-hover:opacity-100"
            title="React"
            aria-label="React to message"
            aria-expanded={reactionMenuOpen}
          >
            <FaSmile className="text-xs" />
          </button>
          {reactionMenuOpen ? (
            <div className={`team-chat-quick-reactions ${mine ? "right-0" : "left-0"}`}>
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(emoji);
                    setReactionMenuOpen(false);
                  }}
                  title={`React with ${emoji}`}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setReactionMenuOpen(false);
                  setAllReactionsOpen(true);
                }}
                className="more"
                aria-label="More reactions"
                title="More reactions"
              >
                +
              </button>
            </div>
          ) : null}
          <EmojiPickerPopover
            open={allReactionsOpen}
            onClose={() => setAllReactionsOpen(false)}
            onSelect={(emoji) => {
              onReact(emoji);
              setAllReactionsOpen(false);
            }}
            userId={currentUserId}
            title="React to message"
            className={`team-chat-reaction-picker ${mine ? "right-0" : "left-0"}`}
          />
        </div>
      ) : null}
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
