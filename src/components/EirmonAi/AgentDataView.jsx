import { formatMinutesLabel, formatTimeValue } from "../../utils/formatAgentData";

function Stat({ label, value }) {
  return (
    <div className="glass-card-sm px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-glass-subtle">{label}</p>
      <p className="text-sm font-semibold theme-text">{value ?? "—"}</p>
    </div>
  );
}

function AttendanceReportView({ data }) {
  const summary = data.summary ?? data;
  const days = Array.isArray(data.days) ? data.days : [];

  return (
    <div className="mt-2 space-y-3 glass-card-sm !rounded-xl !p-3">
      <p className="text-xs font-semibold text-glass-muted">
        {summary.employee || "Employee"} · {summary.month || "Month"}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Present" value={summary.present} />
        <Stat label="Late" value={summary.late} />
        <Stat label="Absent" value={summary.absent} />
        <Stat label="Half day" value={summary.half_day} />
        <Stat label="Total hours" value={summary.total_hours} />
        <Stat label="Break time" value={summary.total_break_time} />
        <Stat label="Attended days" value={summary.attended_days} />
        <Stat label="Working days" value={summary.working_days} />
        <Stat label="Avg / day" value={summary.avg_hours} />
      </div>
      {days.length > 0 ? (
        <div className="glass-table-wrap overflow-x-auto !rounded-lg">
          <table className="glass-table min-w-full text-xs">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">In</th>
                <th className="px-3 py-2 text-left font-semibold">Out</th>
                <th className="px-3 py-2 text-left font-semibold">Hours</th>
                <th className="px-3 py-2 text-left font-semibold">Break</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--theme-glass-border-soft)]">
              {days.slice(0, 15).map((day, idx) => (
                <tr key={`${day.date}-${idx}`}>
                  <td className="px-3 py-2 font-medium theme-text">{day.date ?? "—"}</td>
                  <td className="px-3 py-2 capitalize text-glass-muted">
                    {String(day.status ?? "—").replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2 text-glass-muted">{formatTimeValue(day.check_in)}</td>
                  <td className="px-3 py-2 text-glass-muted">{formatTimeValue(day.check_out)}</td>
                  <td className="px-3 py-2 text-glass-muted">
                    {day.hours ?? day.production_hours ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-glass-muted">
                    {day.break_total_label ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {days.length > 15 ? (
            <p className="px-3 py-2 text-[11px] text-glass-subtle">
              +{days.length - 15} more day(s)
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BreakRow({ br, idx }) {
  const start = br.start ?? br.break_start ?? br.started_at ?? "—";
  const end = br.end ?? br.break_end ?? br.ended_at ?? (br.active ? "Active" : "—");
  const mins = br.duration_minutes ?? br.duration;
  const dur =
    mins != null && mins !== ""
      ? formatMinutesLabel(mins)
      : null;

  return (
    <div className="glass-card-sm flex items-center justify-between px-3 py-2 text-xs">
      <span className="font-medium theme-text">
        {idx + 1}. {formatTimeValue(start)} → {formatTimeValue(end)}
      </span>
      {dur ? <span className="text-glass-subtle">{dur}</span> : null}
    </div>
  );
}

function AttendanceTodayView({ data }) {
  const record = data.record ?? data;
  if (!record || (record.check_in == null && record.status == null)) {
    return (
      <p className="mt-2 glass-card-sm px-3 py-2 text-xs text-glass-muted">
        No attendance record for today.
      </p>
    );
  }

  const breaks = Array.isArray(record.breaks) ? record.breaks : [];

  return (
    <div className="mt-2 space-y-2 glass-card-sm !rounded-xl !p-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Status" value={String(record.status ?? "—").replace(/_/g, " ")} />
        <Stat label="Date" value={record.date} />
        <Stat label="Check in" value={formatTimeValue(record.check_in)} />
        <Stat label="Check out" value={formatTimeValue(record.check_out)} />
        <Stat label="Hours" value={record.hours ?? record.production_hours ?? record.working_hours} />
        <Stat label="Break" value={record.break_total_label ?? "0h 0m"} />
      </div>
      {breaks.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-glass-subtle">
            Breaks
          </p>
          {breaks.map((br, idx) => (
            <BreakRow key={br.id ?? idx} br={br} idx={idx} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TasksView({ data }) {
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
  if (!items.length) {
    return (
      <p className="mt-2 text-xs text-glass-subtle">No tasks found.</p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {items.slice(0, 10).map((task, idx) => (
        <div
          key={task.id ?? idx}
          className="glass-card-sm px-3 py-2.5 text-xs"
        >
          <p className="font-semibold theme-text">{task.title ?? "Untitled"}</p>
          <p className="mt-1 text-glass-muted">
            {task.assignee?.name ?? task.assignee ?? "Unassigned"} ·{" "}
            <span className="capitalize">{String(task.status ?? "—").replace(/_/g, " ")}</span> ·{" "}
            <span className="capitalize">{task.priority ?? "medium"}</span>
          </p>
          {task.due_date ? (
            <p className="mt-0.5 text-glass-subtle">Due: {task.due_date}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TeamAttendanceView({ data }) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return null;

  return (
    <div className="glass-table-wrap mt-2 overflow-x-auto !rounded-xl">
      <table className="glass-table min-w-full text-xs">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-left">Check in</th>
            <th className="px-3 py-2 text-left">Check out</th>
            <th className="px-3 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--theme-glass-border-soft)]">
          {items.map((row, idx) => (
            <tr key={row.id ?? idx}>
              <td className="px-3 py-2 font-medium theme-text">{row.name ?? "—"}</td>
              <td className="px-3 py-2 text-glass-muted">{formatTimeValue(row.check_in)}</td>
              <td className="px-3 py-2 text-glass-muted">{formatTimeValue(row.check_out)}</td>
              <td className="px-3 py-2 capitalize text-glass-muted">
                {row.check_in ? "Present" : "Absent"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AgentDataView({ data, action }) {
  if (data == null) return null;

  const type =
    data.type ??
    (action === "list_attendance" || action === "attendance_report"
      ? "attendance_report"
      : action === "attendance_today" || data.check_in != null
        ? "attendance_today"
        : action === "list_tasks"
          ? "tasks"
          : data.id && (data.start || data.break_start)
            ? "break"
            : null);

  if (type === "attendance_report") {
    return <AttendanceReportView data={data} />;
  }
  if (type === "attendance_today") {
    return <AttendanceTodayView data={data} />;
  }
  if (type === "tasks" || type === "task_created") {
    return <TasksView data={data} />;
  }
  if (type === "team_attendance") {
    return <TeamAttendanceView data={data} />;
  }
  if (type === "break") {
    return (
      <div className="mt-2">
        <BreakRow br={data} idx={0} />
      </div>
    );
  }

  return null;
}
