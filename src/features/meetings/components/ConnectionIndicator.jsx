import { ConnectionState } from "livekit-client";

export default function ConnectionIndicator({ state, quality }) {
  const reconnecting = state === ConnectionState.Reconnecting;
  return <div className={`rounded-full px-3 py-1 text-xs ${reconnecting ? "bg-amber-400 text-amber-950" : "bg-slate-800 text-slate-200"}`}>{reconnecting ? "Reconnecting…" : `Connection: ${quality || "unknown"}`}</div>;
}

