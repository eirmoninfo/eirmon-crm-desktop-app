import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ConnectionState } from "livekit-client";
import { getMeeting, endMeeting, unwrapMeeting } from "../api/meetingsApi";
import { useLiveKitMeeting } from "../hooks/useLiveKitMeeting";
import MeetingLobby from "../components/MeetingLobby";
import ParticipantGrid from "../components/ParticipantGrid";
import MeetingControls from "../components/MeetingControls";
import ConnectionIndicator from "../components/ConnectionIndicator";
import MeetingNotesPanel from "../components/MeetingNotesPanel";

function MeetingLoading({ onBack, backLabel = "Back" }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--theme-bg,#050505)] p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            ← {backLabel}
          </button>
        ) : null}
        <p className="text-slate-500">Loading meeting…</p>
      </div>
    </div>
  );
}

export default function MeetingRoomPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const joinSettings = location.state?.joinSettings;
  const autoJoin = Boolean(location.state?.autoJoin);
  const returnTo =
    location.state?.returnTo ??
    sessionStorage.getItem("collabflow:meeting-return-to");
  const initialCamera = joinSettings?.camera ?? true;
  const initialMicrophone = joinSettings?.microphone ?? true;
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const live = useLiveKitMeeting(uuid);
  const returnToRef = useRef(returnTo);
  const joinAttemptRef = useRef(0);
  const autoJoinCancelledRef = useRef(false);
  const autoJoinStartedRef = useRef(false);

  useEffect(() => {
    if (returnTo) returnToRef.current = returnTo;
  }, [returnTo]);

  useEffect(() => {
    autoJoinCancelledRef.current = false;
    autoJoinStartedRef.current = false;
    joinAttemptRef.current = 0;
  }, [uuid]);

  useEffect(() => {
    getMeeting(uuid).then((response) => setMeeting(unwrapMeeting(response))).catch((error) => toast.error(error?.message || "Could not load meeting.")).finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => {
    const onClose = () => { if (live.room) void live.disconnect(); };
    window.addEventListener("collabflow:meeting-app-close", onClose);
    return () => window.removeEventListener("collabflow:meeting-app-close", onClose);
  }, [live]);

  const join = async (settings) => {
    const attemptId = ++joinAttemptRef.current;
    setJoining(true);
    try {
      await live.connect(settings);
      if (
        attemptId !== joinAttemptRef.current ||
        autoJoinCancelledRef.current
      ) {
        await live.disconnect({ notifyBackend: false });
        return;
      }
    } catch (error) {
      if (!autoJoinCancelledRef.current) {
        toast.error(error?.message || "Could not join meeting.");
      }
    } finally {
      if (attemptId === joinAttemptRef.current) {
        setJoining(false);
      }
    }
  };

  useEffect(() => {
    if (
      autoJoinCancelledRef.current ||
      !autoJoin ||
      !joinSettings ||
      loading ||
      live.room ||
      autoJoinStartedRef.current
    ) {
      return;
    }
    autoJoinStartedRef.current = true;
    void join(joinSettings);
  }, [autoJoin, joinSettings, loading, live.room]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLobbyBack = useCallback(() => {
    autoJoinCancelledRef.current = true;
    joinAttemptRef.current += 1;
    setJoining(false);
    void live.disconnect({ notifyBackend: false });
    sessionStorage.removeItem("collabflow:meeting-return-to");
    const target = returnToRef.current || "/team-chat";
    navigate(target, { replace: true });
  }, [live, navigate]);

  const leave = async () => {
    await live.disconnect();
    navigate(returnToRef.current || "/meetings");
  };

  const endForEveryone = async () => {
    if (!window.confirm("End this meeting for everyone? This cannot be undone.")) return;
    try { await endMeeting(uuid); await live.disconnect({ notifyBackend: false }); navigate("/meetings"); }
    catch (error) { toast.error(error?.message || "Could not end the meeting."); }
  };
  // The meeting controller owns the current Room ref; this callback only forwards viewport priority.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const applyPriority = useCallback((pinned, visible) => live.applyVideoBudget(pinned, visible), [live.applyVideoBudget]);

  if (loading) {
    return (
      <MeetingLoading
        onBack={handleLobbyBack}
        backLabel={
          returnToRef.current?.includes("team-chat") ? "Back to chat" : "Back"
        }
      />
    );
  }
  if (!live.room || live.connectionState === ConnectionState.Disconnected) {
    return (
      <div className="min-h-screen bg-[var(--theme-bg,#050505)] p-6">
        <MeetingLobby
          meeting={meeting}
          joining={joining}
          onJoin={join}
          onBack={handleLobbyBack}
          backLabel={
            returnToRef.current?.includes("team-chat") ? "Back to chat" : "Back"
          }
          initialCamera={initialCamera}
          initialMicrophone={initialMicrophone}
        />
      </div>
    );
  }
  return (
    <main className="flex h-screen min-h-0 flex-col gap-3 bg-slate-950 p-3">
      <header className="flex items-center justify-between text-white">
        <div>
          <h1 className="font-semibold">{meeting?.title}</h1>
          <p className="text-xs text-slate-400">
            {live.participants.length} participant{live.participants.length === 1 ? "" : "s"}
          </p>
        </div>
        <ConnectionIndicator state={live.connectionState} quality={live.connectionQuality} />
      </header>
      {live.error && <div className="rounded-xl bg-red-900/60 p-3 text-sm text-red-100">{live.error.message}</div>}
      <div className="flex min-h-0 flex-1 gap-3">
        <ParticipantGrid
          participants={live.participants}
          activeSpeakers={live.activeSpeakers}
          onPriorityChange={applyPriority}
        />
        <MeetingNotesPanel uuid={uuid} open={notesOpen} onClose={() => setNotesOpen(false)} />
      </div>
      <MeetingControls
        participant={live.room.localParticipant}
        mediaRevision={live.mediaRevision}
        onMic={() =>
          live.toggleMicrophone().catch((error) =>
            toast.error(error?.message || "Could not toggle microphone.")
          )
        }
        onCamera={() =>
          live.toggleCamera().catch((error) =>
            toast.error(error?.message || "Could not toggle camera.")
          )
        }
        onShare={() =>
          live.toggleScreenShare().catch((error) =>
            toast.error(error?.message || "Screen sharing permission was denied.")
          )
        }
        onDevices={() => navigate(`/meetings/${uuid}`, { state: { devices: true } })}
        onNotes={() => setNotesOpen((value) => !value)}
        notesOpen={notesOpen}
        onLeave={leave}
        onEnd={endForEveryone}
        isHost={Boolean(meeting?.is_host)}
      />
    </main>
  );
}
