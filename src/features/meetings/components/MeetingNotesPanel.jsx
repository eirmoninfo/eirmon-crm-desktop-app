import { useEffect, useState } from "react";
import { StickyNote, X } from "lucide-react";

function storageKey(uuid) {
  return `collabflow:meeting-notes:${uuid}`;
}

export function readMeetingNotes(uuid) {
  if (!uuid) return "";
  try {
    return localStorage.getItem(storageKey(uuid)) || "";
  } catch {
    return "";
  }
}

export function writeMeetingNotes(uuid, value) {
  if (!uuid) return;
  try {
    localStorage.setItem(storageKey(uuid), value);
  } catch {
    /* ignore quota */
  }
}

export default function MeetingNotesPanel({ uuid, open, onClose }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    setText(readMeetingNotes(uuid));
  }, [open, uuid]);

  useEffect(() => {
    if (!open || !uuid) return;
    const timer = window.setTimeout(() => writeMeetingNotes(uuid, text), 300);
    return () => window.clearTimeout(timer);
  }, [open, text, uuid]);

  if (!open) return null;

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <StickyNote size={16} className="text-[#ffd60a]" />
          Meeting notes
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close notes"
        >
          <X size={16} />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Jot action items, decisions, or follow-ups…"
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
        Saved on this device for this meeting.
      </p>
    </aside>
  );
}
