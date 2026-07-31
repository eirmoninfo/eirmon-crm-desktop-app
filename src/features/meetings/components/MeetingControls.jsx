import { Camera, CameraOff, Mic, MicOff, MonitorUp, PhoneOff, Settings } from "lucide-react";
import { GlassButton } from "../../../components/glass/Glass";

export default function MeetingControls({ participant, onMic, onCamera, onShare, onDevices, onLeave, onEnd, isHost }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-slate-900/95 p-3 text-white">
      <button className="rounded-xl p-3 hover:bg-slate-700" onClick={onMic}>{participant?.isMicrophoneEnabled ? <Mic /> : <MicOff />}</button>
      <button className="rounded-xl p-3 hover:bg-slate-700" onClick={onCamera}>{participant?.isCameraEnabled ? <Camera /> : <CameraOff />}</button>
      <button className="rounded-xl p-3 hover:bg-slate-700" onClick={onShare}><MonitorUp /></button>
      <button className="rounded-xl p-3 hover:bg-slate-700" onClick={onDevices}><Settings /></button>
      <GlassButton variant="danger" onClick={onLeave}><PhoneOff size={17} /> Leave</GlassButton>
      {isHost && <GlassButton variant="danger" onClick={onEnd}>End for everyone</GlassButton>}
    </div>
  );
}

