import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../../../components/layout/AppLayout";
import { GlassButton, GlassPanel, LoadingScreen, PageHeader } from "../../../components/glass/Glass";
import MeetingCard from "../components/MeetingCard";
import { listMeetings } from "../api/meetingsApi";

const sections = [["active", "Active now"], ["scheduled", "Upcoming"], ["ended", "Ended"]];

export default function MeetingsPage() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await listMeetings();
      const data = response?.data?.data ?? response?.data ?? [];
      setMeetings(Array.isArray(data) ? data : []);
    } catch (nextError) {
      setError(nextError?.message || "Could not load meetings.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // Load the server-backed collection when the route mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <AppLayout>
      <main className="space-y-7 p-4 md:p-7">
        <PageHeader title="Meetings" subtitle="Video collaboration" actions={<div className="flex gap-2"><GlassButton variant="secondary" onClick={load}><RefreshCw size={17} /> Refresh</GlassButton><GlassButton onClick={() => navigate("/meetings/create")}><Plus size={17} /> New meeting</GlassButton></div>} />
        {loading ? <LoadingScreen label="Loading meetings…" /> : error ? <GlassPanel className="p-8 text-center"><p className="text-red-600">{error}</p><GlassButton className="mt-4" onClick={load}>Try again</GlassButton></GlassPanel> :
          meetings.length === 0 ? <GlassPanel className="grid place-items-center gap-3 p-14 text-center"><Video size={42} className="text-indigo-500" /><h2 className="text-lg font-semibold">No meetings yet</h2><p className="text-sm text-slate-500">Create a meeting to bring your team together.</p></GlassPanel> :
          sections.map(([status, label]) => {
            const items = meetings.filter((meeting) => meeting.status === status);
            if (!items.length) return null;
            return <section key={status}><h2 className="mb-3 text-lg font-semibold">{label}</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((meeting) => <MeetingCard key={meeting.uuid} meeting={meeting} onJoin={(item) => navigate(`/meetings/${item.uuid}`)} />)}</div></section>;
          })}
      </main>
    </AppLayout>
  );
}
