import { Camera, CameraOff, Mic, MicOff, MonitorUp, PhoneOff, Settings, StickyNote } from "lucide-react";
import { GlassButton } from "../../../components/glass/Glass";

export default function MeetingControls({
  participant,
  mediaRevision = 0,
  onMic,
  onCamera,
  onShare,
  onDevices,
  onLeave,
  onEnd,
  onNotes,
  notesOpen,
  isHost,
}) {
  const sharing = Boolean(participant?.isScreenShareEnabled);
  const micOn = Boolean(participant?.isMicrophoneEnabled);
  const camOn = Boolean(participant?.isCameraEnabled);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-slate-900/95 p-3 text-white">
      <button
        type="button"
        className={`rounded-xl p-3 hover:bg-slate-700 ${!micOn ? "bg-white/10 text-red-300" : ""}`}
        onClick={onMic}
        title={micOn ? "Mute" : "Unmute"}
        data-media-rev={mediaRevision}
      >
        {micOn ? <Mic /> : <MicOff />}
      </button>
      <button
        type="button"
        className={`rounded-xl p-3 hover:bg-slate-700 ${!camOn ? "bg-white/10 text-red-300" : ""}`}
        onClick={onCamera}
        title={camOn ? "Turn camera off" : "Turn camera on"}
        data-media-rev={mediaRevision}
      >
        {camOn ? <Camera /> : <CameraOff />}
      </button>
      <button
        type="button"
        className={`rounded-xl p-3 hover:bg-slate-700 ${sharing ? "bg-[#ff2d55]/25 text-[#ff2d55] ring-1 ring-[#ff2d55]/50" : ""}`}
        onClick={onShare}
        title={sharing ? "Stop sharing" : "Share screen"}
      >
        <MonitorUp />
      </button>
      <button
        type="button"
        className={`rounded-xl p-3 hover:bg-slate-700 ${notesOpen ? "bg-amber-500/20 text-amber-300" : ""}`}
        onClick={onNotes}
        title="Meeting notes"
      >
        <StickyNote />
      </button>
      <button type="button" className="rounded-xl p-3 hover:bg-slate-700" onClick={onDevices} title="Devices">
        <Settings />
      </button>
      <GlassButton variant="danger" onClick={onLeave}>
        <PhoneOff size={17} /> Leave
      </GlassButton>
      {isHost && (
        <GlassButton variant="danger" onClick={onEnd}>
          End for everyone
        </GlassButton>
      )}
    </div>
  );
}
