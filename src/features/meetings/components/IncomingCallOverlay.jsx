import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { playNotificationSound } from "@/utils/notificationSound";

const RING_MS = 1800;

function phoneIcon() {
  return (
    <svg
      className="h-8 w-8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
    </svg>
  );
}

/**
 * Global incoming Team Chat / meeting call UI + repeating ring.
 * Listens for `collabflow:meeting-call-incoming`.
 */
export default function IncomingCallOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  const [incoming, setIncoming] = useState(null);
  const ringRef = useRef(null);

  pathRef.current = location.pathname;

  const stopRing = () => {
    if (ringRef.current) {
      window.clearInterval(ringRef.current);
      ringRef.current = null;
    }
  };

  const dismiss = () => {
    stopRing();
    setIncoming(null);
  };

  useEffect(() => {
    const onIncoming = (event) => {
      const detail = event?.detail;
      const meetingId = detail?.meeting_id ?? detail?.meetingId ?? detail?.uuid;
      if (!meetingId) return;

      const path = pathRef.current || "";
      if (path.includes(`/meetings/${meetingId}`)) return;

      setIncoming({
        meetingId: String(meetingId),
        title: detail?.title || "Team Chat call",
        callerName: detail?.caller?.name || detail?.caller_name || "Team member",
        callMode: detail?.call_mode === "audio" ? "audio" : "video",
      });
    };

    window.addEventListener("collabflow:meeting-call-incoming", onIncoming);
    return () => {
      window.removeEventListener("collabflow:meeting-call-incoming", onIncoming);
      stopRing();
    };
  }, []);

  useEffect(() => {
    if (!incoming) {
      stopRing();
      return undefined;
    }

    stopRing();
    try {
      playNotificationSound({ volume: 0.4 });
    } catch {
      /* ignore */
    }
    ringRef.current = window.setInterval(() => {
      try {
        playNotificationSound({ volume: 0.4 });
      } catch {
        /* ignore */
      }
    }, RING_MS);

    return () => stopRing();
  }, [incoming]);

  if (!incoming) return null;

  const kindLabel =
    incoming.callMode === "audio" ? "Incoming voice call" : "Incoming video call";

  const accept = () => {
    const meetingId = incoming.meetingId;
    const video = incoming.callMode !== "audio";
    dismiss();
    navigate(`/meetings/${meetingId}`, {
      state: {
        autoJoin: true,
        joinSettings: {
          camera: video,
          microphone: true,
          selected: {},
        },
        returnTo: "/team-chat",
      },
    });
    try {
      sessionStorage.setItem("collabflow:meeting-return-to", "/team-chat");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 p-5 backdrop-blur-[5px]"
      role="dialog"
      aria-modal="true"
      aria-label={kindLabel}
    >
      <div className="w-full max-w-[390px] rounded-3xl border border-white/20 bg-white px-7 py-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid h-[74px] w-[74px] place-items-center rounded-full bg-indigo-50 text-indigo-600 animate-pulse">
          {phoneIcon()}
        </div>
        <p className="m-0 text-xs font-extrabold uppercase tracking-wider text-indigo-500">
          {kindLabel}
        </p>
        <h2 className="mt-2 mb-1 text-2xl font-extrabold text-slate-900">
          {incoming.callerName}
        </h2>
        <p className="mb-6 text-sm text-slate-500">{incoming.title}</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="min-h-12 rounded-[13px] border-0 bg-red-100 font-extrabold text-red-700 cursor-pointer"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="min-h-12 rounded-[13px] border-0 bg-green-600 font-extrabold text-white cursor-pointer"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
