import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "collabflow:meeting-devices";

function readPreferences() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function permissionHelp(error) {
  if (!error) return "";
  if (error.name !== "NotAllowedError" && error.name !== "SecurityError") {
    return error.message || "Could not access your camera or microphone.";
  }
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes("mac")) {
    return "Camera or microphone access is blocked. Open System Settings → Privacy & Security → Camera and Microphone, allow Eirmon One, then restart the app.";
  }
  if (platform.includes("windows")) {
    return "Camera or microphone access is blocked. Open Windows Settings → Privacy & security → Camera/Microphone and allow desktop apps.";
  }
  return "Allow camera and microphone access in your system privacy settings, then try again.";
}

export function useMediaDevices() {
  const preferences = readPreferences();
  const [devices, setDevices] = useState({ audioinput: [], videoinput: [], audiooutput: [] });
  const [selected, setSelectedState] = useState({
    audioinput: preferences.audioinput || "",
    videoinput: preferences.videoinput || "",
    audiooutput: preferences.audiooutput || "",
  });
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  const refresh = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices({
      audioinput: list.filter((device) => device.kind === "audioinput"),
      videoinput: list.filter((device) => device.kind === "videoinput"),
      audiooutput: list.filter((device) => device.kind === "audiooutput"),
    });
  }, []);

  useEffect(() => {
    // Initial device discovery is an external media-device synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, [refresh]);

  const setSelected = useCallback((kind, deviceId) => {
    setSelectedState((current) => {
      const next = { ...current, [kind]: deviceId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const startPreview = useCallback(async ({ camera = true, microphone = true } = {}) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (!camera && !microphone) {
      setError(null);
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camera
          ? { deviceId: selected.videoinput ? { exact: selected.videoinput } : undefined, height: { ideal: 360, max: 720 } }
          : false,
        audio: microphone
          ? { deviceId: selected.audioinput ? { exact: selected.audioinput } : undefined }
          : false,
      });
      streamRef.current = stream;
      setError(null);
      await refresh();
      return stream;
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    }
  }, [refresh, selected.audioinput, selected.videoinput]);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopPreview, [stopPreview]);

  return { devices, selected, setSelected, startPreview, stopPreview, error };
}
