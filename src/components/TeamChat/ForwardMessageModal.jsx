import { useMemo, useState } from "react";
import {
  FaCheck,
  FaHashtag,
  FaSearch,
  FaShare,
  FaTimes,
} from "react-icons/fa";
import { channelLabel, isDirectChannel, messagePreview } from "../../utils/teamChatHelpers";
import { TeamChatAvatar } from "./TeamChatUi";

function ForwardChannelRow({ channel, usersById, selected, onSelect }) {
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
      className={`forward-message-row group mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
        selected ? "forward-message-row-selected" : "forward-message-row-default"
      }`}
    >
      {direct ? (
        <TeamChatAvatar name={label} size="md" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#dbeafe] text-[#1d4ed8] ring-1 ring-[#bfdbfe]">
          <FaHashtag className="text-sm" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="forward-message-row-title block truncate text-sm font-semibold">
          {label}
        </span>
        <span className="forward-message-row-preview mt-0.5 block truncate text-xs">
          {preview || "No messages yet"}
        </span>
      </span>
      <span
        className={`forward-message-check flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          selected ? "forward-message-check-selected" : "forward-message-check-default"
        }`}
        aria-hidden="true"
      >
        {selected ? <FaCheck className="text-[11px]" /> : null}
      </span>
    </button>
  );
}

export default function ForwardMessageModal({
  open,
  message,
  channels = [],
  usersById,
  currentChannelId,
  onClose,
  onForward,
  submitting,
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  const filteredChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((channel) => {
      if (Number(channel.id) === Number(currentChannelId)) return false;
      if (!q) return true;
      return channelLabel(channel, usersById).toLowerCase().includes(q);
    });
  }, [channels, currentChannelId, query, usersById]);

  if (!open || !message) return null;

  const toggleChannel = (channelId) => {
    setSelectedIds((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId]
    );
  };

  const handleClose = () => {
    setQuery("");
    setSelectedIds([]);
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedIds.length) return;
    await onForward(selectedIds);
    setQuery("");
    setSelectedIds([]);
  };

  return (
    <div className="forward-message-backdrop fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="forward-message-modal flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-5 py-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200/90">
                Forward message
              </p>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                <FaShare className="text-sm text-blue-300" />
                Choose chats
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20"
              aria-label="Close forward dialog"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats…"
              className="forward-message-search w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:border-[#2563eb] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30"
            />
          </div>
          {selectedIds.length > 0 ? (
            <p className="mt-2 text-xs font-semibold text-[#1d4ed8]">
              {selectedIds.length} chat{selectedIds.length === 1 ? "" : "s"} selected
            </p>
          ) : null}
        </div>

        <div className="forward-message-list min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] py-2">
          {filteredChannels.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-600">
              No other chats available.
            </p>
          ) : (
            filteredChannels.map((channel) => (
              <ForwardChannelRow
                key={channel.id}
                channel={channel}
                usersById={usersById}
                selected={selectedIds.includes(channel.id)}
                onSelect={() => toggleChannel(channel.id)}
              />
            ))
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            disabled={submitting || selectedIds.length === 0}
            onClick={handleSubmit}
            className="forward-message-submit flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-md transition disabled:opacity-50"
          >
            <FaShare className="text-xs" />
            {submitting
              ? "Forwarding…"
              : `Forward${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
