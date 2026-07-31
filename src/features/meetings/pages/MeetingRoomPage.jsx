import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ConnectionState } from "livekit-client";
import { getMeeting, endMeeting, unwrapMeeting } from "../api/meetingsApi";
import { useLiveKitMeeting } from "../hooks/useLiveKitMeeting";
import MeetingLobby from "../components/MeetingLobby";
import ParticipantGrid from "../components/ParticipantGrid";
import MeetingControls from "../components/MeetingControls";
import ConnectionIndicator from "../components/ConnectionIndicator";

export default function MeetingRoomPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const live = useLiveKitMeeting(uuid);

  useEffect(() => {
    getMeeting(uuid).then((response) => setMeeting(unwrapMeeting(response))).catch((error) => toast.error(error?.message || "Could not load meeting.")).finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => {
    const onClose = () => { if (live.room) void live.disconnect(); };
    window.addEventListener("collabflow:meeting-app-close", onClose);
    return () => window.removeEventListener("collabflow:meeting-app-close", onClose);
  }, [live]);

  const join = async (settings) => {
    setJoining(true);
    try { await live.connect(settings); } catch (error) { toast.error(error?.message || "Could not join meeting."); }
    finally { setJoining(false); }
  };
  const leave = async () => { await live.disconnect(); navigate("/meetings"); };
  const endForEveryone = async () => {
    if (!window.confirm("End this meeting for everyone? This cannot be undone.")) return;
    try { await endMeeting(uuid); await live.disconnect({ notifyBackend: false }); navigate("/meetings"); }
    catch (error) { toast.error(error?.message || "Could not end the meeting."); }
  };
  // The meeting controller owns the current Room ref; this callback only forwards viewport priority.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const applyPriority = useCallback((pinned, visible) => live.applyVideoBudget(pinned, visible), [live.applyVideoBudget]);

  if (loading) return <div className="grid h-screen place-items-center">Loading meeting…</div>;
  if (!live.room || live.connectionState === ConnectionState.Disconnected) return <div className="min-h-screen bg-[var(--app-bg)] p-6"><MeetingLobby meeting={meeting} joining={joining} onJoin={join} /></div>;
  return (
    <main className="flex h-screen flex-col gap-3 bg-slate-950 p-3">
      <header className="flex items-center justify-between text-white"><div><h1 className="font-semibold">{meeting?.title}</h1><p className="text-xs text-slate-400">{live.participants.length} participant{live.participants.length === 1 ? "" : "s"}</p></div><ConnectionIndicator state={live.connectionState} quality={live.connectionQuality} /></header>
      {live.error && <div className="rounded-xl bg-red-900/60 p-3 text-sm text-red-100">{live.error.message}</div>}
      <ParticipantGrid participants={live.participants} activeSpeakers={live.activeSpeakers} onPriorityChange={applyPriority} />
      <MeetingControls participant={live.room.localParticipant} onMic={live.toggleMicrophone} onCamera={live.toggleCamera} onShare={() => live.toggleScreenShare().catch((error) => toast.error(error?.message || "Screen sharing permission was denied."))} onDevices={() => navigate(`/meetings/${uuid}`, { state: { devices: true } })} onLeave={leave} onEnd={endForEveryone} isHost={Boolean(meeting?.is_host)} />
    </main>
  );
}
