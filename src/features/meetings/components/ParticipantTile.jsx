import { useEffect, useRef } from "react";
import { Track } from "livekit-client";
import { MicOff, Monitor, Pin } from "lucide-react";

function getPublication(participant, source) {
  if (typeof participant?.getTrackPublication === "function") {
    return participant.getTrackPublication(source);
  }
  for (const pub of participant?.trackPublications?.values?.() || []) {
    if (pub.source === source) return pub;
  }
  return null;
}

function attachMedia(track, element) {
  if (!element || !track) return undefined;
  track.attach(element);
  element.playsInline = true;
  element.autoplay = true;
  void element.play?.().catch(() => {});
  return () => {
    track.detach(element);
  };
}

export function participantHasScreenShare(participant) {
  if (participant?.isScreenShareEnabled) return true;
  const pub = getPublication(participant, Track.Source.ScreenShare);
  return Boolean(pub?.track);
}

export default function ParticipantTile({
  participant,
  pinned,
  onPin,
  forceScreenShare = false,
  compact = false,
  highlightShare = false,
}) {
  const videoRef = useRef(null);
  const screenRef = useRef(null);
  const audioRef = useRef(null);

  const camera = getPublication(participant, Track.Source.Camera);
  const screen = getPublication(participant, Track.Source.ScreenShare);
  const microphone = getPublication(participant, Track.Source.Microphone);
  const showScreen = forceScreenShare || Boolean(screen?.track);
  const mirrorLocalCamera = participant.isLocal && !showScreen;
  const cameraOn = Boolean(camera?.track) && !camera?.isMuted && participant.isCameraEnabled !== false;

  useEffect(() => {
    if (showScreen) return undefined;
    return attachMedia(camera?.track, videoRef.current);
  }, [camera?.track, showScreen]);

  useEffect(() => {
    if (!showScreen) return undefined;
    return attachMedia(screen?.track, screenRef.current);
  }, [screen?.track, showScreen]);

  useEffect(() => {
    if (participant.isLocal) return undefined;
    return attachMedia(microphone?.track, audioRef.current);
  }, [microphone?.track, participant.isLocal]);

  const ringClass = highlightShare || showScreen
    ? "ring-2 ring-[#ff2d55] shadow-[0_0_0_1px_rgb(255_45_85_/_0.35)]"
    : pinned
      ? "ring-2 ring-indigo-400"
      : "";

  return (
    <div
      className={`group relative h-full overflow-hidden rounded-2xl bg-slate-800 text-left ${
        compact ? "min-h-24" : "min-h-48"
      } ${ringClass}`}
    >
      <button
        type="button"
        onClick={onPin}
        className="absolute inset-0 z-10"
        aria-label={pinned ? "Unpin participant" : "Pin participant"}
      />
      {showScreen ? (
        <video
          ref={screenRef}
          autoPlay
          playsInline
          muted
          disablePictureInPicture
          className="absolute inset-0 h-full w-full bg-black object-contain"
        />
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          disablePictureInPicture
          className={`absolute inset-0 h-full w-full bg-slate-800 object-cover ${
            cameraOn ? "" : "opacity-0"
          }`}
          style={mirrorLocalCamera ? { transform: "scaleX(-1)" } : undefined}
        />
      )}
      <audio ref={audioRef} autoPlay />
      {showScreen && !screen?.track && (
        <div className="absolute inset-0 z-[5] grid place-items-center text-sm text-slate-300">
          Sharing screen…
        </div>
      )}
      {!showScreen && !cameraOn && (
        <div className="absolute inset-0 grid place-items-center text-4xl font-semibold text-white">
          {participant.name?.[0] || participant.identity?.[0] || "?"}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-sm text-white">
        <span className="flex items-center gap-1.5 truncate">
          {showScreen ? <Monitor size={14} className="shrink-0 text-[#ff2d55]" /> : null}
          <span className="truncate">
            {participant.name || participant.identity}
            {participant.isLocal ? " (You)" : ""}
            {showScreen ? " · Sharing" : ""}
          </span>
        </span>
        <span className="flex gap-2">
          {!participant.isMicrophoneEnabled && <MicOff size={15} />}
          {pinned && <Pin size={15} />}
        </span>
      </div>
    </div>
  );
}
