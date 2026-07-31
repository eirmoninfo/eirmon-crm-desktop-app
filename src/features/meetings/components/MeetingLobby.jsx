import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import { GlassButton, GlassPanel } from "../../../components/glass/Glass";
import DeviceSelector from "./DeviceSelector";
import { permissionHelp, useMediaDevices } from "../hooks/useMediaDevices";

export default function MeetingLobby({ meeting, onJoin, joining }) {
  const [camera, setCamera] = useState(true);
  const [microphone, setMicrophone] = useState(true);
  const [previewError, setPreviewError] = useState(null);
  const videoRef = useRef(null);
  const media = useMediaDevices();

  useEffect(() => {
    let current;
    media.startPreview({ camera, microphone }).then((stream) => {
      current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream || null;
      setPreviewError(null);
    }).catch(setPreviewError);
    return () => current?.getTracks().forEach((track) => track.stop());
  }, [camera, microphone, media.selected.audioinput, media.selected.videoinput]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="relative min-h-80 overflow-hidden rounded-3xl bg-slate-950">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        {!camera && <div className="absolute inset-0 grid place-items-center text-slate-400"><CameraOff size={52} /></div>}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
          <button className="rounded-full bg-slate-900/80 p-4 text-white" onClick={() => setMicrophone((v) => !v)}>{microphone ? <Mic /> : <MicOff />}</button>
          <button className="rounded-full bg-slate-900/80 p-4 text-white" onClick={() => setCamera((v) => !v)}>{camera ? <Camera /> : <CameraOff />}</button>
        </div>
      </div>
      <GlassPanel className="space-y-5 p-6">
        <div><p className="text-sm text-slate-500">Ready to join?</p><h1 className="text-2xl font-semibold">{meeting?.title || "Meeting"}</h1></div>
        {(previewError || media.error) && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{permissionHelp(previewError || media.error)}</div>}
        <DeviceSelector label="Microphone" devices={media.devices.audioinput} value={media.selected.audioinput} onChange={(id) => media.setSelected("audioinput", id)} />
        <DeviceSelector label="Camera" devices={media.devices.videoinput} value={media.selected.videoinput} onChange={(id) => media.setSelected("videoinput", id)} />
        <DeviceSelector label="Speaker" devices={media.devices.audiooutput} value={media.selected.audiooutput} onChange={(id) => media.setSelected("audiooutput", id)} disabled={!HTMLMediaElement.prototype.setSinkId} />
        <GlassButton className="w-full justify-center" disabled={joining} onClick={() => { media.stopPreview(); onJoin({ camera, microphone, selected: media.selected }); }}>
          {joining ? "Connecting…" : "Join now"}
        </GlassButton>
      </GlassPanel>
    </div>
  );
}
