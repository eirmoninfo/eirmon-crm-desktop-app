import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiRequest } from '../api/http'; // adjust path
import { getCurrentUser } from '../api/auth.api';
import AppLayout from '../components/layout/AppLayout';
import { GlassButton, GlassCard, PageHeader } from '../components/glass/Glass';
import Pagination from '../components/Pagination';
import {
  getUserPayload,
  canApproveExpenses,
  canCreateExpenses,
  canDeleteExpenses,
  canEditExpenses,
} from '../utils/permissions';

const Expenses = () => {
  const [user, setUser] = useState(null);

  const [expenses, setExpenses] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [stats, setStats] = useState({
    total_amount: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    this_month: 0,
  });

  const [filters, setFilters] = useState({
    search: '',
    status: '',
    category_id: '',
    start_date: '',
    end_date: '',
  });

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectIds, setRejectIds] = useState([]); // for bulk or single

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        per_page: 20,
        ...filters,
      };

      const res = await apiRequest('/expenses', { params });

      if (res?.status === 'success') {
        setExpenses(res.data || []);
        setMeta(res.meta || {});
        setStats(res.stats || {});
      }
    } catch (err) {
      console.error('Failed to load expenses:', err);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const r = await getCurrentUser();
      if (r.success) setUser(getUserPayload(r.data));
    })();
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [page, filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1); // reset to page 1 on filter change
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      status: '',
      category_id: '',
      start_date: '',
      end_date: '',
    });
    setPage(1);
  };

  // Checkbox logic
  const handleSelectAll = (e) => {
    const checked = e.target.checked;
    setSelectAll(checked);
    if (checked) {
      const selectable = expenses
        .filter((exp) => !exp.trashed && exp.status === 'pending')
        .map((exp) => exp.id);
      setSelectedIds(selectable);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds((prev) => [...new Set([...prev, id])]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  useEffect(() => {
    // Update select all checkbox state
    const selectableCount = expenses.filter(
      (exp) => !exp.trashed && exp.status === 'pending'
    ).length;
    setSelectAll(
      selectableCount > 0 && selectedIds.length === selectableCount
    );
  }, [selectedIds, expenses]);

  // Bulk actions
  const handleBulkDelete = async () => {
    if (!window.confirm(`Move ${selectedIds.length} expense(s) to trash?`)) return;

    try {
      await apiRequest('/expenses/bulk-delete', {
        method: 'POST',
        body: { ids: selectedIds },
      });
      toast.success(`${selectedIds.length} expenses moved to trash`);
      setSelectedIds([]);
      fetchExpenses();
    } catch {
      toast.error('Failed to delete selected expenses');
    }
  };

  const handleBulkApprove = async () => {
    if (!window.confirm(`Approve ${selectedIds.length} expense(s)?`)) return;

    try {
      await apiRequest('/expenses/bulk-approve', {
        method: 'POST',
        body: { ids: selectedIds },
      });
      toast.success('Selected expenses approved');
      setSelectedIds([]);
      fetchExpenses();
    } catch {
      toast.error('Failed to approve selected expenses');
    }
  };

  const openRejectModal = (ids = []) => {
    setRejectIds(ids.length ? ids : selectedIds);
    setRejectNote('');
    setRejectModalOpen(true);
  };

  const handleBulkReject = async () => {
    if (!rejectNote.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await apiRequest('/expenses/bulk-reject', {
        method: 'POST',
        body: {
          ids: rejectIds,
          verification_note: rejectNote,
        },
      });
      toast.success('Selected expenses rejected');
      setRejectModalOpen(false);
      setSelectedIds([]);
      setRejectIds([]);
      fetchExpenses();
    } catch {
      toast.error('Failed to reject selected expenses');
    }
  };

  const formatCurrency = (amount) => {
    return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  };

  return (
    <AppLayout user={user} loading={loading} loadingLabel="Loading expenses…">
          <div className="max-w-[1400px] mx-auto space-y-8">
            <PageHeader
              title="Expenses Management"
              actions={
                canCreateExpenses(user) ? (
                  <Link
                    to="/expense/create"
                    className="glass-btn glass-btn-primary inline-flex items-center px-6 py-3 font-semibold"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    New Expense
                  </Link>
                ) : null
              }
            />

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {[
                { label: 'Total Expenses', value: formatCurrency(stats.total_amount), color: 'text-teal-600' },
                { label: 'Pending Approval', value: stats.pending, color: 'text-yellow-600' },
                { label: 'Approved', value: stats.approved, color: 'text-green-600' },
                { label: 'Rejected', value: stats.rejected, color: 'text-red-600' },
                { label: 'This Month', value: formatCurrency(stats.this_month), color: 'text-emerald-600' },
              ].map((item, idx) => (
                <div key={idx} className="glass-card-sm p-6">
                  <p className="text-sm text-gray-600">{item.label}</p>
                  <p className={`text-2xl font-bold mt-2 ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Filters */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                fetchExpenses();
              }}
              className="glass-card"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Search</label>
                  <input
                    type="text"
                    name="search"
                    value={filters.search}
                    onChange={handleFilterChange}
                    placeholder="Employee, description..."
                    className="block w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select
                    name="status"
                    value={filters.status}
                    onChange={handleFilterChange}
                    className="block w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
                  <select
                    name="category_id"
                    value={filters.category_id}
                    onChange={handleFilterChange}
                    className="block w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">All Categories</option>
                    {/* You'll need to fetch categories from apiCreateData or separate endpoint */}
                    {/* For now placeholder - replace with real data */}
                    <option value="1">Travel</option>
                    <option value="2">Food</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
                  <input
                    type="date"
                    name="start_date"
                    value={filters.start_date}
                    onChange={handleFilterChange}
                    className="block w-full p-2.5 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
                  <input
                    type="date"
                    name="end_date"
                    value={filters.end_date}
                    onChange={handleFilterChange}
                    className="block w-full p-2.5 border border-gray-300 rounded-lg"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-lg hover:shadow-lg transition"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </form>

            {/* Bulk Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 glass-card !py-4">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="w-5 h-5 text-teal-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">
                  {selectedIds.length} selected
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                {canDeleteExpenses(user) && (
                  <button
                    disabled={selectedIds.length === 0}
                    onClick={handleBulkDelete}
                    className="px-5 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 7l-.867 12.142A2.2 2.2 0 0116.138 21H7.862a2.2 2.2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Delete Selected
                  </button>
                )}

                {canApproveExpenses(user) && (
                  <>
                    <button
                      disabled={selectedIds.length === 0}
                      onClick={handleBulkApprove}
                      className="px-5 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition"
                    >
                      Approve Selected
                    </button>

                    <button
                      disabled={selectedIds.length === 0}
                      onClick={() => openRejectModal()}
                      className="px-5 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition"
                    >
                      Reject Selected
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Expenses Table */}
            <div className="glass-card !p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-white/5 text-glass-muted">
                    <tr>
                      <th className="px-6 py-3 text-left w-12">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-16 text-gray-500">
                          <svg
                            className="w-16 h-16 mx-auto text-gray-300 mb-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M9 14l6-6m0 0l6 6m-6-6v10"
                            />
                          </svg>
                          <p className="text-lg">No expenses found</p>
                        </td>
                      </tr>
                    ) : (
                      expenses.map((expense) => (
                        <tr
                          key={expense.id}
                          className={`hover:bg-white/5 transition ${
                            expense.trashed ? 'bg-red-50 opacity-75' : ''
                          }`}
                        >
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(expense.id)}
                              onChange={(e) => handleSelectOne(expense.id, e.target.checked)}
                              disabled={expense.trashed || expense.status !== 'pending'}
                              className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                            />
                          </td>

                          <td className="px-6 py-4 text-sm text-white">
                            {new Date(expense.date).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                            <span className="block text-xs text-gray-500">
                              {new Date(expense.date).toLocaleDateString('en-GB', { weekday: 'short' })}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <div>
                              <p className="font-semibold text-white">
                                {expense.user?.name || 'Unknown User'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {expense.user?.email || '—'}
                              </p>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {expense.category ? (
                              <span className="px-3 py-1 bg-teal-100 text-teal-800 text-xs font-semibold rounded-full">
                                {expense.category.name}
                              </span>
                            ) : (
                              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                                No Category
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                            {expense.description
                              ? expense.description.length > 60
                                ? expense.description.substring(0, 60) + '...'
                                : expense.description
                              : '—'}
                          </td>

                          <td className="px-6 py-4 text-right">
                            <span className="text-lg font-bold text-white">
                              ₹{Number(expense.amount).toLocaleString('en-IN')}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex px-4 py-1.5 text-xs font-bold rounded-full ${
                                expense.status === 'approved'
                                  ? 'bg-green-100 text-green-800'
                                  : expense.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {expense.status ? expense.status.charAt(0).toUpperCase() + expense.status.slice(1) : 'Pending'}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center space-x-3 text-sm">
                            <Link
                              to={`/expense/${expense.id}`}
                              className="text-teal-600 hover:text-teal-800 font-medium"
                            >
                              View
                            </Link>

                            {canEditExpenses(user) && !expense.trashed && expense.status === 'pending' && (
                              <Link
                                to={`/expense/${expense.id}/edit`}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Edit
                              </Link>
                            )}

                            {canApproveExpenses(user) && expense.status === 'pending' && (
  <>
    <button
      onClick={() =>
        apiRequest(`/expenses/${expense.id}/approve`, { method: 'POST' })
          .then(() => {
            toast.success('Expense approved');
            fetchExpenses();
          })
          .catch(() => toast.error('Failed to approve'))
      }
      className="text-green-600 hover:text-green-800 font-medium"
    >
      Approve
    </button>

    <button
      onClick={() => openRejectModal([expense.id])}
      className="text-red-600 hover:text-red-800 font-medium"
    >
      Reject
    </button>
  </>
)}

                            {!expense.trashed ? (
                              canDeleteExpenses(user) && (
                                <button
                                  onClick={async () => {
                                    if (!window.confirm('Move to trash?')) return;
                                    await apiRequest(`/expenses/${expense.id}`, { method: 'DELETE' });
                                    toast.success('Moved to trash');
                                    fetchExpenses();
                                  }}
                                  className="text-gray-600 hover:text-gray-800 font-medium"
                                >
                                  Trash
                                </button>
                              )
                            ) : (
                              canDeleteExpenses(user) && (
                                <>
                                  <button
                                    onClick={async () => {
                                      await apiRequest(`/expenses/${expense.id}/restore`, { method: 'POST' });
                                      toast.success('Restored');
                                      fetchExpenses();
                                    }}
                                    className="text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    Restore
                                  </button>

                                  <button
                                    onClick={async () => {
                                      if (!window.confirm('Permanently delete?')) return;
                                      await apiRequest(`/expenses/${expense.id}/force`, { method: 'DELETE' });
                                      toast.success('Permanently deleted');
                                      fetchExpenses();
                                    }}
                                    className="text-red-600 hover:text-red-800 font-medium"
                                  >
                                    Delete Forever
                                  </button>
                                </>
                              )
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {meta.total > 0 && (
                <div className="px-6 py-4 border-t">
                  <Pagination
                    currentPage={meta.current_page}
                    totalPages={meta.last_page}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </div>
          </div>

      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="glass-card max-w-md w-full">
            <div className="text-center mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-500/20">
                <svg
                  className="h-8 w-8 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 14l2-2m0 0l2 2m-2-2v10"
                  />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-white mt-4">
                Reject {rejectIds.length > 1 ? `${rejectIds.length} Expenses` : 'Expense'}?
              </h3>
              <p className="text-glass-muted mt-2">
                Please provide a reason for rejection.
              </p>
            </div>

            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={4}
              placeholder="Enter rejection reason..."
              className="glass-input w-full"
            />

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => {
                  setRejectModalOpen(false);
                  setRejectIds([]);
                  setRejectNote('');
                }}
                className="glass-btn glass-btn-secondary flex-1"
              >
                Cancel
              </button>

              <button
                onClick={handleBulkReject}
                className="glass-btn glass-btn-danger flex-1 font-semibold"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Expenses;