import { CalendarClock, Users } from "lucide-react";
import { GlassButton, GlassCard, GlassPill } from "../../../components/glass/Glass";

function meetingTime(meeting) {
  const value = meeting.scheduled_at || meeting.started_at || meeting.ended_at;
  return value ? new Date(value).toLocaleString() : "Start anytime";
}

export default function MeetingCard({ meeting, onJoin }) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">{meeting.title}</h3>
          <p className="mt-1 text-sm text-slate-500">Hosted by {meeting.creator?.name || "Unknown"}</p>
        </div>
        <GlassPill active={meeting.status === "active"}>{meeting.status}</GlassPill>
      </div>
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <p className="flex items-center gap-2"><CalendarClock size={16} />{meetingTime(meeting)}</p>
        <p className="flex items-center gap-2"><Users size={16} />{meeting.joined_count ?? meeting.participant_count ?? 0} / {meeting.max_participants}</p>
      </div>
      <GlassButton
        className="mt-auto"
        variant={meeting.status === "ended" ? "secondary" : "primary"}
        disabled={meeting.status === "ended"}
        onClick={() => onJoin(meeting)}
      >
        {meeting.status === "ended" ? "Meeting ended" : "Join meeting"}
      </GlassButton>
    </GlassCard>
  );
}

