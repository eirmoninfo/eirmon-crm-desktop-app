import { useEffect, useMemo, useState } from "react";
import ParticipantTile from "./ParticipantTile";

const PAGE_SIZE = 6;

export default function ParticipantGrid({ participants, activeSpeakers, onPriorityChange }) {
  const [page, setPage] = useState(0);
  const [pinned, setPinned] = useState(null);
  const ordered = useMemo(() => [...participants].sort((a, b) =>
    Number(b.identity === pinned) - Number(a.identity === pinned) ||
    Number(activeSpeakers.includes(b.identity)) - Number(activeSpeakers.includes(a.identity))
  ), [activeSpeakers, participants, pinned]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const visible = ordered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    onPriorityChange(pinned, visible.map((participant) => participant.identity));
  }, [onPriorityChange, pinned, visible]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className={`grid min-h-0 flex-1 gap-3 ${visible.length <= 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
        {visible.map((participant) => <ParticipantTile key={participant.identity} participant={participant} pinned={participant.identity === pinned} onPin={() => setPinned((value) => value === participant.identity ? null : participant.identity)} />)}
      </div>
      {pageCount > 1 && <div className="flex justify-center gap-3 text-sm text-white"><button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button><span>{page + 1} / {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button></div>}
    </div>
  );
}

