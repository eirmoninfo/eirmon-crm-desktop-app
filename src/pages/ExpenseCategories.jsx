// src/pages/ExpenseCategories.jsx
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiRequest } from '../api/http'; // adjust path
import { getCurrentUser } from '../api/auth.api';
import AppLayout from '../components/layout/AppLayout';
import { GlassButton, GlassCard, PageHeader } from '../components/glass/Glass';
import {
  getUserPayload,
  canCreateExpenseCategories,
  canManageExpenseCategories,
} from '../utils/permissions';

const ExpenseCategories = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    trashed: 0,
    most_used: '—',
  });
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  });

  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null });

  const search = searchParams.get('search') || '';
  const trashed = searchParams.get('trashed') || '';

  useEffect(() => {
    (async () => {
      const r = await getCurrentUser();
      if (r.success) setUser(getUserPayload(r.data));
    })();
  }, []);

  // Fetch categories + stats
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = {};
        if (search) params.search = search;
        if (trashed) params.trashed = trashed;

        const res = await apiRequest('/expense-categories', {
          params,
        });

        if (res?.data) {
          setCategories(res.data || []);
          setPagination({
            current_page: res.meta.current_page,
            last_page: res.meta.last_page,
            per_page: res.meta.per_page,
            total: res.meta.total,
          });
          setStats(res.stats || {});
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load categories');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [search, trashed]);

  const handleFilter = (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newParams = {};
    if (formData.get('search')) newParams.search = formData.get('search');
    if (formData.get('trashed')) newParams.trashed = formData.get('trashed');
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const handleDelete = async (id) => {
    const toastId = toast.loading('Moving to trash...');
    try {
      await apiRequest(`/expense-categories/${id}`, {
        method: 'DELETE',
      });
      toast.success('Category moved to trash', { id: toastId });
      // Refresh list
      setSearchParams((prev) => ({ ...Object.fromEntries(prev) }));
    } catch (err) {
      toast.error(err.message || 'Failed to delete', { id: toastId });
    }
  };

  const handleRestore = async (id) => {
    try {
      await apiRequest(`/expense-categories/${id}/restore`, {
        method: 'POST',
      });
      toast.success('Category restored');
      setSearchParams((prev) => ({ ...Object.fromEntries(prev) }));
    } catch (err) {
      toast.error('Failed to restore');
    }
  };

  const handleForceDelete = async (id) => {
    if (!window.confirm('Permanently delete this category? This cannot be undone.')) return;

    try {
      await apiRequest(`/expense-categories/${id}/force`, {
        method: 'DELETE',
      });
      toast.success('Category permanently deleted');
      setSearchParams((prev) => ({ ...Object.fromEntries(prev) }));
    } catch (err) {
      toast.error(err.message || 'Cannot delete — probably has expenses');
    }
  };

  const openDeleteModal = (id) => {
    setDeleteModal({ open: true, id });
  };

  const closeDeleteModal = () => {
    setDeleteModal({ open: false, id: null });
  };

  const confirmDelete = () => {
    if (deleteModal.id) {
      handleDelete(deleteModal.id);
      closeDeleteModal();
    }
  };

  return (
    <AppLayout user={user} loading={loading} loadingLabel="Loading categories…">
          <div className="max-w-9xl mx-auto space-y-6">
            <PageHeader
              title="Expense Categories"
              actions={
                canCreateExpenseCategories(user) ? (
                  <GlassButton onClick={() => navigate('/expense-categories/create')}>
                    Create Category
                  </GlassButton>
                ) : null
              }
            />

            {/* Stats Cards - you can create a small reusable component or inline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <GlassCard className="!p-6">
                <p className="text-sm text-glass-muted">Total Categories</p>
                <p className="text-3xl font-bold text-emerald-400">{stats.total}</p>
              </GlassCard>
              <GlassCard className="!p-6">
                <p className="text-sm text-glass-muted">Active</p>
                <p className="text-3xl font-bold text-green-400">{stats.active}</p>
              </GlassCard>
              <GlassCard className="!p-6">
                <p className="text-sm text-glass-muted">Trashed</p>
                <p className="text-3xl font-bold text-red-400">{stats.trashed}</p>
              </GlassCard>
              <GlassCard className="!p-6">
                <p className="text-sm text-glass-muted">Most Used</p>
                <p className="text-3xl font-bold text-emerald-400">{stats.most_used}</p>
              </GlassCard>
            </div>

            {/* Filters */}
            <GlassCard>
              <form onSubmit={handleFilter}>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-5 items-end">
                <div className="lg:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Search Category</label>
                  <input
                    name="search"
                    defaultValue={search}
                    placeholder="Name or description..."
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 p-2.5"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Status</label>
                  <select
                    name="trashed"
                    defaultValue={trashed}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 p-2.5"
                  >
                    <option value="">All Categories</option>
                    <option value="1">Only Trashed</option>
                  </select>
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-teal-600 text-white rounded-lg font-semibold hover:shadow-lg transition"
                  >
                    Apply Filter
                  </button>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </form>
            </GlassCard>

            {/* Table */}
            <div className="glass-card !p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Category</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Description</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase">Total Expenses</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase">Total Amount</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase">Budget Info</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase">Budget Usage</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase">Status</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {categories.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                          No expense categories found.
                        </td>
                      </tr>
                    ) : (
                      categories.map((cat) => (
                        <tr
                          key={cat.id}
                          className={`hover:bg-gray-50 transition ${cat.deleted_at ? 'bg-red-50 opacity-75' : ''}`}
                        >
                          <td className="px-6 py-5">
                            <div className="font-semibold text-gray-900 text-lg">{cat.name}</div>
                            <div className="text-xs text-gray-500">ID: {cat.id}</div>
                          </td>
                          <td className="px-6 py-5 text-gray-700 max-w-md">
                            {cat.description ? cat.description.slice(0, 100) + (cat.description.length > 100 ? '...' : '') : '—'}
                          </td>
                          <td className="px-6 py-5 text-center text-2xl font-bold text-gray-800">
                            {cat.expenses_count ?? 0}
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="text-xl font-bold text-emerald-600">
                              ₹{Number(cat.total_amount ?? 0).toLocaleString('en-IN')}
                            </span>
                          </td>

                          {/* Budget Info */}
                          <td className="px-6 py-5 text-center text-sm">
                            {cat.budgets?.length > 0 ? (
                              <div className="space-y-1">
                                {cat.budgets.map((b) => (
                                  <div key={b.id} className="text-gray-700">
                                    <span className="font-semibold">{b.period.charAt(0).toUpperCase() + b.period.slice(1)}</span>
                                    {b.period === 'monthly' && ` (${b.year}-${String(b.month).padStart(2, '0')})`}
                                    {b.period === 'quarterly' && ` (Q${b.quarter} ${b.year})`}
                                    {b.period === 'yearly' && ` (${b.year})`}
                                    : <span className="font-bold text-teal-600">
                                        ₹{Number(b.amount).toLocaleString('en-IN')}
                                      </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">No budget</span>
                            )}
                          </td>

                          {/* Budget Usage */}
                          <td className="px-6 py-5 text-center">
                            {cat.budgets?.length > 0 ? (
                              <div className="space-y-4">
                                {cat.budgets.map((budget) => {
                                  const spent = budget.spent || 0; // assuming API now includes 'spent'
                                  const limit = budget.amount || 0;
                                  const percent = limit > 0 ? (spent / limit) * 100 : 0;
                                  const over = spent > limit;
                                  const color = over ? 'bg-red-500' : percent > 80 ? 'bg-orange-500' : 'bg-green-500';

                                  return (
                                    <div key={budget.id}>
                                      <div className="text-xs text-gray-600 mb-1">
                                        ₹{Number(spent).toLocaleString('en-IN')} spent ({percent.toFixed(1)}%)
                                      </div>
                                      <div className="w-40 mx-auto bg-gray-200 rounded-full h-4 overflow-hidden">
                                        <div
                                          className={`h-full ${color} transition-all duration-300`}
                                          style={{ width: `${Math.min(percent, 150)}%` }}
                                        />
                                      </div>
                                      {over ? (
                                        <p className="text-xs text-red-600 mt-1 font-bold">
                                          Over by ₹{(spent - limit).toLocaleString('en-IN')}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-gray-500 mt-1">
                                          ₹{(limit - spent).toLocaleString('en-IN')} remaining
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          <td className="px-6 py-5 text-center">
                            <span
                              className={`inline-flex px-4 py-1.5 text-xs font-bold rounded-full ${
                                cat.deleted_at ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {cat.deleted_at ? 'Trashed' : 'Active'}
                            </span>
                          </td>

                          <td className="px-6 py-5 text-center space-x-4">
                            {cat.deleted_at ? (
                              canManageExpenseCategories(user) && (
                                <>
                                  <button
                                    onClick={() => handleRestore(cat.id)}
                                    className="text-green-600 hover:text-green-800 font-semibold"
                                  >
                                    Restore
                                  </button>
                                  <button
                                    onClick={() => handleForceDelete(cat.id)}
                                    className="text-red-600 hover:text-red-800 font-semibold"
                                  >
                                    Delete Forever
                                  </button>
                                </>
                              )
                            ) : (
                              canManageExpenseCategories(user) && (
                                <button
                                  onClick={() => openDeleteModal(cat.id)}
                                  className="text-red-600 hover:text-red-800 font-semibold"
                                >
                                  Delete
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.total > 0 && (
                <div className="px-6 py-4 border-t flex items-center justify-between text-sm">
                  <div>
                    Showing {pagination.from || 0} to {pagination.to || 0} of {pagination.total}
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={pagination.current_page === 1}
                      onClick={() => setSearchParams((p) => ({ ...Object.fromEntries(p), page: pagination.current_page - 1 }))}
                      className="px-4 py-2 border rounded disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      disabled={pagination.current_page === pagination.last_page}
                      onClick={() => setSearchParams((p) => ({ ...Object.fromEntries(p), page: pagination.current_page + 1 }))}
                      className="px-4 py-2 border rounded disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

      {deleteModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65"
          onClick={closeDeleteModal}
        >
          <GlassCard
            className="max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mt-4 text-white">Delete Category?</h3>
              <p className="text-glass-muted mt-2">This will move it to trash. You can restore later.</p>
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={closeDeleteModal}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-8 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Yes, Move to Trash
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </AppLayout>
  );
};

export default ExpenseCategories;