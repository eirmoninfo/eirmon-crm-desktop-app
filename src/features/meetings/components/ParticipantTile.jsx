import { useEffect, useRef } from "react";
import { MicOff, Pin } from "lucide-react";

export default function ParticipantTile({ participant, pinned, onPin }) {
  const mediaRef = useRef(null);
  const audioRef = useRef(null);
  const camera = participant.getTrackPublication?.("camera");
  const microphone = participant.getTrackPublication?.("microphone");

  useEffect(() => {
    const element = mediaRef.current;
    const track = camera?.track;
    if (element && track) track.attach(element);
    return () => { if (element && track) track.detach(element); };
  }, [camera?.track]);

  useEffect(() => {
    const element = audioRef.current;
    const track = microphone?.track;
    if (element && track && !participant.isLocal) track.attach(element);
    return () => { if (element && track) track.detach(element); };
  }, [microphone?.track, participant.isLocal]);

  return (
    <button type="button" onClick={onPin} className={`group relative min-h-48 overflow-hidden rounded-2xl bg-slate-900 text-left ${pinned ? "ring-2 ring-indigo-400" : ""}`}>
      <video ref={mediaRef} autoPlay playsInline muted={participant.isLocal} className="h-full w-full object-cover" />
      <audio ref={audioRef} autoPlay />
      {!camera?.isSubscribed && <div className="absolute inset-0 grid place-items-center text-4xl font-semibold text-white">{participant.name?.[0] || participant.identity?.[0] || "?"}</div>}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-sm text-white">
        <span>{participant.name || participant.identity}{participant.isLocal ? " (You)" : ""}</span>
        <span className="flex gap-2">{!participant.isMicrophoneEnabled && <MicOff size={15} />}{pinned && <Pin size={15} />}</span>
      </div>
    </button>
  );
}
