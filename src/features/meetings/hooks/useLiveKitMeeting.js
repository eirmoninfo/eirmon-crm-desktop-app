import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionQuality,
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  VideoPresets,
} from "livekit-client";
import { getConnectionDetails, leaveMeeting } from "../api/meetingsApi";
import { selectPriorityParticipants } from "../utils/videoPriority";
import { permissionHelp } from "./useMediaDevices";

const initialState = {
  room: null,
  participants: [],
  activeSpeakers: [],
  connectionState: ConnectionState.Disconnected,
  connectionQuality: ConnectionQuality.Unknown,
  error: null,
  mediaRevision: 0,
};

function mediaToggleError(error, kind) {
  const help = permissionHelp(error);
  if (help) return help;
  const name = error?.name ? `${error.name}: ` : "";
  const message = error?.message || `Could not toggle ${kind}.`;
  return `${name}${message}`.trim();
}

async function ensureMediaAccess({ audio = false, video = false } = {}) {
  if (!audio && !video) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera/microphone APIs are unavailable in this build.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
  stream.getTracks().forEach((track) => track.stop());
}

export function useLiveKitMeeting(uuid) {
  const [state, setState] = useState(initialState);
  const roomRef = useRef(null);
  const tokenRef = useRef(null);
  const listenersRef = useRef([]);

  const syncParticipants = useCallback((room) => {
    if (!room) return;
    setState((current) => ({
      ...current,
      // New array + room reference so controls re-render when mute/camera flips.
      room,
      participants: [room.localParticipant, ...room.remoteParticipants.values()],
      activeSpeakers: room.activeSpeakers.map((p) => p.identity),
      connectionState: room.state,
      connectionQuality: room.localParticipant.connectionQuality,
      mediaRevision: (current.mediaRevision || 0) + 1,
    }));
  }, []);

  const applyVideoBudget = useCallback((room, pinnedIdentity = null, visibleIds = []) => {
    const remote = [...room.remoteParticipants.values()];
    const selected = new Set(selectPriorityParticipants(remote, {
      pinnedIdentity,
      activeSpeakerIds: room.activeSpeakers.map((p) => p.identity),
      visibleIds,
    }));
    remote.forEach((participant) => {
      participant.videoTrackPublications.forEach((publication) => {
        const isScreen = publication.source === Track.Source.ScreenShare;
        // Always pull screen shares at high quality; never leave them unsubscribed.
        const subscribed = isScreen || selected.has(participant.identity);
        publication.setSubscribed(subscribed);
        if (subscribed) {
          publication.setVideoQuality(
            isScreen || participant.identity === pinnedIdentity || participant.isSpeaking
              ? VideoQuality.HIGH
              : VideoQuality.LOW
          );
        }
      });
      participant.audioTrackPublications.forEach((publication) => publication.setSubscribed(true));
    });
  }, []);

  const cleanup = useCallback(async ({ notifyBackend = true } = {}) => {
    const room = roomRef.current;
    listenersRef.current.forEach(([event, listener]) => room?.off(event, listener));
    listenersRef.current = [];
    if (room) {
      await room.localParticipant.setScreenShareEnabled(false).catch(() => {});
      await room.localParticipant.setCameraEnabled(false).catch(() => {});
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      room.disconnect();
    }
    roomRef.current = null;
    tokenRef.current = null;
    setState(initialState);
    if (notifyBackend && uuid) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1500);
      await leaveMeeting(uuid, { signal: controller.signal }).catch(() => {});
      window.clearTimeout(timeout);
    }
  }, [uuid]);

  const connect = useCallback(async ({ camera, microphone, selected }) => {
    setState((current) => ({ ...current, error: null, connectionState: ConnectionState.Connecting }));
    try {
      const response = await getConnectionDetails(uuid);
      const details = response?.data?.data ?? response?.data;
      if (!details?.url || !details?.token) throw new Error("Meeting connection details were incomplete.");
      tokenRef.current = details.token;
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        videoCaptureDefaults: {
          ...(selected?.videoinput ? { deviceId: selected.videoinput } : {}),
          resolution: { width: 640, height: 360, frameRate: 24 },
        },
        audioCaptureDefaults: {
          ...(selected?.audioinput ? { deviceId: selected.audioinput } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        publishDefaults: {
          simulcast: true,
          videoSimulcastLayers: [
            VideoPresets.h180,
            VideoPresets.h360,
          ],
          // Keep mic track alive on mute so unmute is reliable in Electron.
          stopMicTrackOnMute: false,
        },
      });
      roomRef.current = room;
      const sync = () => { syncParticipants(room); applyVideoBudget(room); };
      const onDisconnected = () => {
        tokenRef.current = null;
        setState((current) => ({ ...current, connectionState: ConnectionState.Disconnected }));
      };
      [
        RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackPublished, RoomEvent.TrackUnpublished,
        RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed,
        RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
        RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
        RoomEvent.ActiveSpeakersChanged, RoomEvent.ConnectionQualityChanged,
        RoomEvent.Reconnecting, RoomEvent.Reconnected,
      ].forEach((event) => {
        if (!event) return;
        room.on(event, sync);
        listenersRef.current.push([event, sync]);
      });
      room.on(RoomEvent.Disconnected, onDisconnected);
      listenersRef.current.push([RoomEvent.Disconnected, onDisconnected]);
      await room.connect(details.url, details.token, { autoSubscribe: false });
      tokenRef.current = null;
      if (selected?.audioinput) {
        await room.switchActiveDevice("audioinput", selected.audioinput).catch(() => {});
      }
      if (selected?.videoinput) {
        await room.switchActiveDevice("videoinput", selected.videoinput).catch(() => {});
      }
      if (selected?.audiooutput) {
        await room.switchActiveDevice("audiooutput", selected.audiooutput).catch(() => {});
      }
      if (microphone) {
        await ensureMediaAccess({ audio: true }).catch(() => {});
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      if (camera) {
        await ensureMediaAccess({ video: true }).catch(() => {});
        await room.localParticipant.setCameraEnabled(true);
      }
      sync();
      setState((current) => ({ ...current, room }));
      return room;
    } catch (error) {
      tokenRef.current = null;
      await cleanup({ notifyBackend: false });
      setState((current) => ({ ...current, error, connectionState: ConnectionState.Disconnected }));
      throw error;
    }
  }, [applyVideoBudget, cleanup, syncParticipants, uuid]);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    const local = room?.localParticipant;
    if (!local) throw new Error("Not connected to the meeting.");
    const next = !local.isMicrophoneEnabled;
    try {
      if (next) await ensureMediaAccess({ audio: true });
      await local.setMicrophoneEnabled(next);
      syncParticipants(room);
      return next;
    } catch (error) {
      syncParticipants(room);
      throw new Error(mediaToggleError(error, "microphone"));
    }
  }, [syncParticipants]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    const local = room?.localParticipant;
    if (!local) throw new Error("Not connected to the meeting.");
    const next = !local.isCameraEnabled;
    try {
      if (next) await ensureMediaAccess({ video: true });
      await local.setCameraEnabled(next);
      syncParticipants(room);
      return next;
    } catch (error) {
      syncParticipants(room);
      throw new Error(mediaToggleError(error, "camera"));
    }
  }, [syncParticipants]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    const local = room?.localParticipant;
    if (!local) throw new Error("Not connected to the meeting.");
    const next = !local.isScreenShareEnabled;
    try {
      if (next && typeof window.api?.selectLiveScreenSource === "function") {
        const selection = await window.api.selectLiveScreenSource();
        if (selection?.cancelled) {
          const macHint =
            navigator.userAgent.toLowerCase().includes("mac")
              ? " Enable Screen Recording for Electron (dev) or Eirmon One in System Settings → Privacy & Security, then restart the app."
              : "";
          throw new Error(`Could not access a screen to share.${macHint}`);
        }
      }
      await local.setScreenShareEnabled(
        next,
        next
          ? {
              audio: false,
              resolution: VideoPresets.h1080.resolution,
              contentHint: "detail",
            }
          : undefined
      );
      syncParticipants(room);
      return next;
    } catch (error) {
      syncParticipants(room);
      throw new Error(error?.message || "Screen sharing permission was denied.");
    }
  }, [syncParticipants]);

  return {
    ...state,
    connect,
    disconnect: cleanup,
    applyVideoBudget: (pinned, visible) => roomRef.current && applyVideoBudget(roomRef.current, pinned, visible),
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    switchDevice: (kind, id) => roomRef.current?.switchActiveDevice(kind, id),
    Track,
  };
}
