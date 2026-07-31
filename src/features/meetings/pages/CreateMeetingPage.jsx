import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Search, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../../../components/layout/AppLayout";
import { GlassButton, GlassPanel, PageHeader } from "../../../components/glass/Glass";
import { createMeeting, searchEmployees, unwrapMeeting } from "../api/meetingsApi";

export default function CreateMeetingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", scheduled_at: "", max_participants: 10 });
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const loadEmployees = useCallback(async () => {
    try { setEmployees(await searchEmployees(search)); } catch { setEmployees([]); }
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(loadEmployees, 250);
    return () => window.clearTimeout(timer);
  }, [loadEmployees]);

  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setErrors({});
    try {
      const response = await createMeeting({
        title: form.title,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        max_participants: Number(form.max_participants),
        participant_ids: selected,
      });
      const meeting = unwrapMeeting(response);
      navigate(form.scheduled_at ? "/meetings" : `/meetings/${meeting.uuid}`);
    } catch (error) {
      setErrors(error?.errors || { form: [error?.message || "Could not create meeting."] });
    } finally { setSubmitting(false); }
  };

  const fieldError = (key) => errors?.[key]?.[0];
  return (
    <AppLayout>
      <main className="p-4 md:p-7">
        <PageHeader title="Create meeting" subtitle="Meetings" actions={<GlassButton variant="ghost" onClick={() => navigate("/meetings")}><ArrowLeft size={17} /> Back</GlassButton>} />
        <GlassPanel as="form" className="mx-auto mt-6 max-w-3xl space-y-6 p-6" onSubmit={submit}>
          {fieldError("form") && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{fieldError("form")}</div>}
          <label className="glass-field"><span className="glass-field-label">Title</span><input className="glass-input" value={form.title} required onChange={(e) => setForm({ ...form, title: e.target.value })} />{fieldError("title") && <span className="text-xs text-red-600">{fieldError("title")}</span>}</label>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="glass-field"><span className="glass-field-label">Schedule (optional)</span><input type="datetime-local" className="glass-input" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />{fieldError("scheduled_at") && <span className="text-xs text-red-600">{fieldError("scheduled_at")}</span>}</label>
            <label className="glass-field"><span className="glass-field-label">Participant limit</span><input type="number" min="2" max="100" className="glass-input" value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} />{fieldError("max_participants") && <span className="text-xs text-red-600">{fieldError("max_participants")}</span>}</label>
          </div>
          <div>
            <label className="glass-field"><span className="glass-field-label">Invite employees</span><span className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input className="glass-input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees" /></span></label>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
              {employees.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-indigo-50 dark:hover:bg-slate-800"><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])} /><Users size={16} /><span>{employee.name || employee.email}</span></label>)}
              {!employees.length && <p className="p-3 text-sm text-slate-500">No employees found.</p>}
            </div>
          </div>
          <GlassButton type="submit" className="w-full justify-center" disabled={submitting}>{submitting ? "Creating…" : form.scheduled_at ? "Schedule meeting" : "Create and continue"}</GlassButton>
        </GlassPanel>
      </main>
    </AppLayout>
  );
}

