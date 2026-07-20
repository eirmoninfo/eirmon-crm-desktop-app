// src/pages/AttendanceDashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Coffee } from 'lucide-react';
import { apiRequest } from '../api/http';
import { syncElectronBreakState } from '../utils/electronBreakSync';
import { refreshAttendanceScreenshots } from '../utils/attendanceScreenshotSync';
import { breakStart, breakEnd } from '../utils/breakTime';
import Pagination from '../components/Pagination';
import AppLayout from '../components/layout/AppLayout';
import { GlassCard, GlassButton, PageHeader } from '../components/glass/Glass';

const AttendanceDashboard = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null); // You might get this from auth context
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [todayAttendance, setTodayAttendance] = useState(null);
  const [hasActiveBreak, setHasActiveBreak] = useState(false);
  const [checkOutConfirmOpen, setCheckOutConfirmOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [breakBusy, setBreakBusy] = useState(false);

  const [attendances, setAttendances] = useState([]);
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [filters, setFilters] = useState({
    user_id: '',
    month: new Date().toISOString().slice(0, 7),
  });

  const [employees, setEmployees] = useState([]);

  const canViewAll = user?.can?.('view all attendance') ?? false;
  const canMarkOthers = user?.can?.('mark attendance for others') ?? false;

  // Load initial data
  const loadData = async (page = 1, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      // 1. Today's attendance
      const todayRes = await apiRequest('/attendance/today');
      
      if (todayRes?.status === 'success') {
        const attendance = todayRes.data;
        setTodayAttendance(attendance);

        const activeBreak =
          todayRes.has_active_break ??
          attendance?.has_active_break ??
          (Array.isArray(attendance?.breaks) &&
            attendance.breaks.some((b) => breakStart(b) && !breakEnd(b)));

        setHasActiveBreak(!!activeBreak);
      }

      // 2. Attendance list
      const params = {
        page,
        per_page: 20,
        ...(filters.user_id && { user_id: filters.user_id }),
        ...(filters.month && { month: filters.month }),
      };

      const listRes = await apiRequest('/attendance', { params });
      if (listRes?.status === 'success') {
        setAttendances(listRes.data || []);
        setPagination({
          current_page: listRes.meta?.current_page || 1,
          last_page: listRes.meta?.last_page || 1,
          per_page: listRes.meta?.per_page || 20,
          total: listRes.meta?.total || 0,
        });
      }

      // 3. Employees (for admins/managers)
      if ((canViewAll || canMarkOthers) && employees.length === 0) {
        const empRes = await apiRequest('/users?role=employee');
        setEmployees(empRes?.data || []);
      }
    } catch (err) {
      console.error('Data load error:', err);
      setError('Failed to load attendance data');
      if (!silent) toast.error('Failed to load attendance data');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // You might want to load current user here if not using context
    // loadCurrentUser();
  }, []);

  useEffect(() => {
    syncElectronBreakState(hasActiveBreak);
  }, [hasActiveBreak]);

  // Filter handlers
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const applyFilters = (e) => {
    e.preventDefault();
    loadData(1);
  };

  const resetFilters = () => {
    setFilters({
      user_id: '',
      month: new Date().toISOString().slice(0, 7),
    });
    loadData(1);
  };

  const isCheckedIn =
    todayAttendance?.check_in != null && todayAttendance.check_in !== '';
  const isCheckedOut =
    todayAttendance?.check_out != null && todayAttendance.check_out !== '';
  const canControlSession = isCheckedIn && !isCheckedOut;

  const handleBreakToggle = async () => {
    if (!canControlSession || breakBusy) return;

    const isStarting = !hasActiveBreak;
    setBreakBusy(true);
    const toastId = toast.loading(isStarting ? 'Starting break...' : 'Ending break...');

    try {
      const endpoint = isStarting
        ? '/attendance/break/start'
        : '/attendance/break/end';
      const res = await apiRequest(endpoint, { method: 'POST' });

      if (res?.status === 'success') {
        toast.success(
          res.message || (isStarting ? 'Break started' : 'Break ended'),
          { id: toastId }
        );
        await loadData(pagination.current_page || 1, true);
        syncElectronBreakState(isStarting, { force: !isStarting });
      } else {
        throw new Error(res?.message || 'Break action failed');
      }
    } catch (err) {
      toast.error(err?.message || 'Break action failed', { id: toastId });
    } finally {
      setBreakBusy(false);
    }
  };

  const handleCheckOut = async () => {
    if (!canControlSession || checkingOut) return;
    setCheckingOut(true);
    try {
      await apiRequest('/attendance/check-out', { method: 'POST' });
      setCheckOutConfirmOpen(false);
      toast.success('Checked out successfully');
      await loadData(pagination.current_page || 1, true);
      refreshAttendanceScreenshots();
    } catch (err) {
      toast.error(err?.message || 'Check-out failed');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleCheckIn = async () => {
    try {
      await apiRequest('/attendance/check-in', { method: 'POST' });
      toast.success('Checked in successfully');
      await loadData(pagination.current_page || 1, true);
      refreshAttendanceScreenshots();
    } catch (err) {
      toast.error(err?.message || 'Check-in failed');
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '—';
    }
  };

  if (loading && !todayAttendance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600 animate-pulse">Loading attendance dashboard...</div>
      </div>
    );
  }

  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const currentDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <AppLayout loading={loading} loadingLabel="Loading attendance…">
      <div className="mx-auto max-w-[1400px] space-y-8">
        <PageHeader
          title="Attendance"
          subtitle="Session history"
          actions={
            canMarkOthers ? (
              <GlassButton onClick={() => navigate('/attendance/mark')}>
                Mark attendance
              </GlassButton>
            ) : null
          }
        />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <GlassCard className="hero-gradient-card !p-6 text-white" style={{
            background: 'linear-gradient(135deg, rgb(10 132 255 / 0.35), rgb(94 92 230 / 0.25))',
          }}>
            <div className="text-5xl font-bold tabular-nums">{currentTime}</div>
            <div className="mt-1 text-white/70">{currentDateStr}</div>
            <div className="mt-4 text-sm text-white/50">Live clock</div>
          </GlassCard>

          <GlassCard className="!p-6">
            <div className="flex h-full flex-col justify-between gap-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold theme-text">Live session</h3>
                  <span
                    className={`glass-badge inline-flex items-center gap-2 ${
                      isCheckedOut
                        ? ''
                        : hasActiveBreak
                          ? 'glass-badge-amber'
                          : isCheckedIn
                            ? 'glass-badge-blue'
                            : ''
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isCheckedOut
                          ? 'bg-white/40'
                          : hasActiveBreak
                            ? 'bg-[#ffd60a]'
                            : isCheckedIn
                              ? 'bg-[#64d2ff] animate-pulse'
                              : 'bg-white/40'
                      }`}
                    />
                    {!isCheckedIn
                      ? 'Not punched in'
                      : isCheckedOut
                        ? 'Checked out'
                        : hasActiveBreak
                          ? 'On break'
                          : 'Working'}
                  </span>
                </div>
                {hasActiveBreak && (
                  <p className="mt-2 text-sm text-glass-muted">
                    Break since{' '}
                    {formatTime(
                      breakStart(
                        todayAttendance?.breaks?.find(
                          (b) => breakStart(b) && !breakEnd(b)
                        )
                      )
                    )}
                  </p>
                )}
                {isCheckedIn && !isCheckedOut && todayAttendance?.check_in && (
                  <p className="mt-2 text-sm text-glass-muted">
                    Checked in at {formatTime(todayAttendance.check_in)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {!isCheckedIn && (
                  <GlassButton onClick={handleCheckIn}>Punch in</GlassButton>
                )}
                {canControlSession && (
                  <>
                    <GlassButton
                      variant="secondary"
                      onClick={handleBreakToggle}
                      disabled={breakBusy}
                      className={hasActiveBreak ? '!border-[#ff9f0a]/40' : ''}
                    >
                      <Coffee className="h-4 w-4" />
                      {breakBusy
                        ? 'Please wait…'
                        : hasActiveBreak
                          ? 'End break'
                          : 'Start break'}
                    </GlassButton>
                    <GlassButton
                      variant="danger"
                      onClick={() => setCheckOutConfirmOpen(true)}
                    >
                      Check out
                    </GlassButton>
                  </>
                )}
                {isCheckedOut && (
                  <p className="text-sm text-glass-muted">
                    Finished for today
                    {todayAttendance?.check_out
                      ? ` · checked out at ${formatTime(todayAttendance.check_out)}`
                      : ''}
                  </p>
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="!p-6">
          <form onSubmit={applyFilters} className="grid grid-cols-1 items-end gap-6 md:grid-cols-4">
            {(canViewAll || canMarkOthers) && employees.length > 0 && (
              <label className="glass-field">
                <span className="glass-field-label">Employee</span>
                <select
                  name="user_id"
                  value={filters.user_id}
                  onChange={handleFilterChange}
                  className="glass-select"
                >
                  <option value="">All employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name || emp.email}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="glass-field">
              <span className="glass-field-label">Month</span>
              <input
                type="month"
                name="month"
                value={filters.month}
                onChange={handleFilterChange}
                className="glass-input"
              />
            </label>

            <div className="flex gap-3 md:col-span-2">
              <GlassButton type="submit">Apply</GlassButton>
              <GlassButton type="button" variant="secondary" onClick={resetFilters}>
                Reset
              </GlassButton>
            </div>
          </form>
        </GlassCard>

        <div className="glass-table-wrap overflow-hidden">
          <div className="overflow-x-auto">
            <table className="glass-table min-w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attendances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-glass-muted">
                      No records found for the selected period
                    </td>
                  </tr>
                ) : (
                  attendances.map((record) => (
                    <tr key={record.id}>
                      <td className="whitespace-nowrap font-medium">
                        {new Date(record.date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0a84ff]/20 font-bold text-[#64d2ff]">
                            {record.user?.name?.slice(0, 2)?.toUpperCase() || '??'}
                          </div>
                          <span>{record.user?.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        {record.check_in ? formatTime(record.check_in) : '—'}
                      </td>
                      <td className="whitespace-nowrap">
                        {record.check_out ? formatTime(record.check_out) : '—'}
                      </td>
                      <td className="whitespace-nowrap font-medium">
                        {record.working_hours ? `${record.working_hours} hrs` : '—'}
                      </td>
                      <td className="whitespace-nowrap">
                        <span
                          className={`glass-badge ${
                            {
                              present: 'glass-badge-green',
                              late: 'glass-badge-amber',
                              half_day: 'glass-badge-amber',
                              absent: 'glass-badge-red',
                            }[record.status?.toLowerCase()] || ''
                          }`}
                        >
                          {record.status
                            ? record.status.charAt(0).toUpperCase() + record.status.slice(1)
                            : 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.total > 0 && (
            <Pagination
              currentPage={pagination.current_page}
              totalPages={pagination.last_page}
              onPageChange={(page) => loadData(page)}
            />
          )}
        </div>
      </div>

      {checkOutConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !checkingOut && setCheckOutConfirmOpen(false)}
        >
          <GlassCard
            className="mx-4 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-bold theme-text">
              Confirm check out?
            </h3>
            <p className="mb-6 text-glass-muted">
              Are you sure you want to punch out for today? You can check in
              again later if needed.
            </p>
            <div className="flex justify-end gap-3">
              <GlassButton
                variant="secondary"
                disabled={checkingOut}
                onClick={() => setCheckOutConfirmOpen(false)}
              >
                Cancel
              </GlassButton>
              <GlassButton
                variant="danger"
                disabled={checkingOut}
                onClick={handleCheckOut}
              >
                {checkingOut ? 'Checking out…' : 'Yes, check out'}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </AppLayout>
  );
};

export default AttendanceDashboard;