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

const initialState = {
  room: null,
  participants: [],
  activeSpeakers: [],
  connectionState: ConnectionState.Disconnected,
  connectionQuality: ConnectionQuality.Unknown,
  error: null,
};

export function useLiveKitMeeting(uuid) {
  const [state, setState] = useState(initialState);
  const roomRef = useRef(null);
  const tokenRef = useRef(null);
  const listenersRef = useRef([]);

  const syncParticipants = useCallback((room) => {
    setState((current) => ({
      ...current,
      participants: [room.localParticipant, ...room.remoteParticipants.values()],
      activeSpeakers: room.activeSpeakers.map((p) => p.identity),
      connectionState: room.state,
      connectionQuality: room.localParticipant.connectionQuality,
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
        const subscribed = selected.has(participant.identity);
        publication.setSubscribed(subscribed);
        if (subscribed) {
          publication.setVideoQuality(
            participant.identity === pinnedIdentity || participant.isSpeaking
              ? VideoQuality.MEDIUM
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
          deviceId: selected.videoinput || undefined,
          resolution: { width: 640, height: 360, frameRate: 24 },
        },
        audioCaptureDefaults: { deviceId: selected.audioinput || undefined },
        publishDefaults: {
          simulcast: true,
          videoSimulcastLayers: [
            VideoPresets.h180,
            VideoPresets.h360,
          ],
          stopMicTrackOnMute: true,
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
        RoomEvent.ActiveSpeakersChanged, RoomEvent.ConnectionQualityChanged,
        RoomEvent.Reconnecting, RoomEvent.Reconnected,
      ].forEach((event) => {
        room.on(event, sync);
        listenersRef.current.push([event, sync]);
      });
      room.on(RoomEvent.Disconnected, onDisconnected);
      listenersRef.current.push([RoomEvent.Disconnected, onDisconnected]);
      await room.connect(details.url, details.token, { autoSubscribe: false });
      tokenRef.current = null;
      await room.switchActiveDevice("audioinput", selected.audioinput).catch(() => {});
      await room.switchActiveDevice("videoinput", selected.videoinput).catch(() => {});
      if (selected.audiooutput) await room.switchActiveDevice("audiooutput", selected.audiooutput).catch(() => {});
      await room.localParticipant.setMicrophoneEnabled(Boolean(microphone));
      await room.localParticipant.setCameraEnabled(Boolean(camera));
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

  return {
    ...state,
    connect,
    disconnect: cleanup,
    applyVideoBudget: (pinned, visible) => roomRef.current && applyVideoBudget(roomRef.current, pinned, visible),
    toggleMicrophone: () => state.room?.localParticipant.setMicrophoneEnabled(!state.room.localParticipant.isMicrophoneEnabled),
    toggleCamera: () => state.room?.localParticipant.setCameraEnabled(!state.room.localParticipant.isCameraEnabled),
    toggleScreenShare: () => state.room?.localParticipant.setScreenShareEnabled(!state.room.localParticipant.isScreenShareEnabled),
    switchDevice: (kind, id) => state.room?.switchActiveDevice(kind, id),
    Track,
  };
}
