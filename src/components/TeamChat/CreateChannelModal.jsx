import { useState } from "react";
import { FaHashtag, FaLock, FaTimes } from "react-icons/fa";
import { TeamChatAvatar } from "./TeamChatUi";

export default function CreateChannelModal({
  open,
  onClose,
  users = [],
  currentUserId,
  onSubmit,
  submitting,
}) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  if (!open) return null;

  const selectable = users.filter(
    (u) => String(u.id) !== String(currentUserId)
  );

  const toggleUser = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim().replace(/\s+/g, "-").toLowerCase();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      is_private: isPrivate,
      participant_ids: selectedIds,
      default_participant_role: "member",
    });
  };

  const handleClose = () => {
    setName("");
    setIsPrivate(true);
    setSelectedIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80">
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200/90">
                New conversation
              </p>
              <h2 className="text-lg font-semibold">Create channel</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-2 hover:bg-white/10"
              aria-label="Close"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
              <FaHashtag className="text-eirmon-600" />
              Channel name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="marketing-team"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition focus:border-eirmon-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-eirmon-400/40"
              required
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 transition hover:border-eirmon-200">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-slate-300 text-eirmon-600 focus:ring-eirmon-500"
            />
            <FaLock className="text-slate-500" />
            <span className="text-sm font-medium text-slate-700">
              Private channel
            </span>
          </label>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Invite members
            </p>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50">
              {selectable.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No other users listed.</p>
              ) : (
                selectable.map((u) => (
                  <label
                    key={u.id}
                    className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0 transition ${
                      selectedIds.includes(u.id) ? "bg-eirmon-50/80" : "hover:bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="rounded border-slate-300 text-eirmon-600"
                    />
                    <TeamChatAvatar name={u.name ?? u.email} size="sm" />
                    <span className="text-sm font-medium text-slate-800">
                      {u.name ?? u.email}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded-xl bg-gradient-to-r from-eirmon-600 to-eirmon-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:from-eirmon-700 hover:to-eirmon-800 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
