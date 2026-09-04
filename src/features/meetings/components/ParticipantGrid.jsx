import { useEffect, useMemo, useState } from "react";
import ParticipantTile, { participantHasScreenShare } from "./ParticipantTile";

const PAGE_SIZE = 6;

export default function ParticipantGrid({ participants, activeSpeakers, onPriorityChange }) {
  const [page, setPage] = useState(0);
  const [pinned, setPinned] = useState(null);

  const screenSharer = useMemo(
    () => participants.find((participant) => participantHasScreenShare(participant)) || null,
    [participants]
  );

  // Auto-focus the person sharing screen (pink highlight + fullscreen content).
  useEffect(() => {
    if (screenSharer?.identity) {
      setPinned(screenSharer.identity);
    }
  }, [screenSharer?.identity]);

  const ordered = useMemo(
    () =>
      [...participants].sort(
        (a, b) =>
          Number(participantHasScreenShare(b)) - Number(participantHasScreenShare(a)) ||
          Number(b.identity === pinned) - Number(a.identity === pinned) ||
          Number(activeSpeakers.includes(b.identity)) - Number(activeSpeakers.includes(a.identity))
      ),
    [activeSpeakers, participants, pinned]
  );

  const filmstrip = useMemo(() => {
    if (!screenSharer) return ordered;
    return ordered.filter((participant) => participant.identity !== screenSharer.identity);
  }, [ordered, screenSharer]);

  const pageCount = Math.max(1, Math.ceil((screenSharer ? filmstrip : ordered).length / PAGE_SIZE));
  const visible = (screenSharer ? filmstrip : ordered).slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE
  );

  useEffect(() => {
    const visibleIds = screenSharer
      ? [screenSharer.identity, ...visible.map((participant) => participant.identity)]
      : visible.map((participant) => participant.identity);
    onPriorityChange(pinned || screenSharer?.identity || null, visibleIds);
  }, [onPriorityChange, pinned, screenSharer, visible]);

  if (screenSharer) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="relative min-h-0 min-w-0 flex-[3] overflow-hidden">
          <ParticipantTile
            participant={screenSharer}
            pinned
            forceScreenShare
            highlightShare
            onPin={() => setPinned(screenSharer.identity)}
          />
        </div>
        <div className="flex max-h-40 gap-2 overflow-x-auto lg:max-h-none lg:w-44 lg:flex-col lg:overflow-y-auto">
          {filmstrip.map((participant) => (
            <div key={participant.identity} className="min-w-[140px] shrink-0 lg:min-w-0">
              <ParticipantTile
                participant={participant}
                compact
                pinned={participant.identity === pinned}
                onPin={() =>
                  setPinned((value) => (value === participant.identity ? screenSharer.identity : participant.identity))
                }
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        className={`grid min-h-0 h-full flex-1 gap-3 ${
          visible.length <= 1
            ? "grid-cols-1"
            : visible.length === 2
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
        }`}
      >
        {visible.map((participant) => (
          <ParticipantTile
            key={participant.identity}
            participant={participant}
            pinned={participant.identity === pinned}
            onPin={() =>
              setPinned((value) => (value === participant.identity ? null : participant.identity))
            }
          />
        ))}
      </div>
      {pageCount > 1 && (
        <div className="flex justify-center gap-3 text-sm text-white">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            {page + 1} / {pageCount}
          </span>
          <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
