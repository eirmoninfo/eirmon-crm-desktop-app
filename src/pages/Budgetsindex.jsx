// src/pages/Budgets.jsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiRequest } from '../api/http'; // adjust path as needed
import { getCurrentUser } from '../api/auth.api';
import AppLayout from '../components/layout/AppLayout';
import { GlassButton, GlassCard, PageHeader } from '../components/glass/Glass';
import Pagination from '../components/Pagination';
import { getUserPayload, canManageBudgets } from '../utils/permissions';

const Budgets = () => {
  const [user, setUser] = useState(null);
  /** 'active' = current budgets; 'archived' = GET ...&archived=1 */
  const [listTab, setListTab] = useState('active');
  const [budgets, setBudgets] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState({
    category: '',
    period: '',
    supplements: [],
  });

  const fetchBudgets = useCallback(async (currentPage = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      if (listTab === 'archived') {
        params.set('archived', '1');
      }
      const res = await apiRequest(`/budgets?${params.toString()}`);

      if (res?.status === 'success' || res?.status === true) {
        setBudgets(res.data || []);
        setMeta(res.meta || {});
      }
    } catch (err) {
      console.error('Failed to load budgets:', err);
      toast.error('Failed to load budgets');
    } finally {
      setLoading(false);
    }
  }, [listTab]);

  useEffect(() => {
    (async () => {
      const r = await getCurrentUser();
      if (r.success) setUser(getUserPayload(r.data));
    })();
  }, []);

  useEffect(() => {
    fetchBudgets(page);
  }, [page, fetchBudgets]);

  const handleTabChange = (tab) => {
    if (tab === listTab) return;
    setListTab(tab);
    setPage(1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  const openHistoryModal = (budget) => {
    const periodDisplay =
      budget.period === 'monthly'
        ? `${budget.period.charAt(0).toUpperCase() + budget.period.slice(1)} ${new Date(0, budget.month - 1).toLocaleString('default', { month: 'long' })} ${budget.year}`
        : budget.period === 'quarterly'
        ? `Q${budget.quarter} ${budget.year}`
        : `${budget.period.charAt(0).toUpperCase() + budget.period.slice(1)} ${budget.year}`;

    setModalData({
      category: budget.category?.name || 'Unknown Category',
      period: periodDisplay,
      supplements: budget.supplements || [],
    });
    setModalOpen(true);
  };

  const getCurrencySymbol = (currency = 'INR') => {
    const symbols = {
      INR: '₹',
      USD: '$',
      EUR: '€',
      GBP: '£',
      AUD: 'A$',
      CAD: 'C$',
      AED: 'د.إ',
    };
    return symbols[currency] || '₹';
  };

  return (
    <AppLayout user={user} loading={loading} loadingLabel="Loading budgets…">
          <div className="max-w-[1400px] mx-auto space-y-8">
            <PageHeader
              title="Budget Management"
              actions={
                canManageBudgets(user) ? (
                  <GlassButton onClick={() => window.location.href = '/budgets/create'}>
                    Set New Budget
                  </GlassButton>
                ) : null
              }
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => handleTabChange('active')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    listTab === 'active'
                      ? 'glass-btn glass-btn-primary !py-2 !px-4'
                      : 'text-glass-muted hover:text-white'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('archived')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    listTab === 'archived'
                      ? 'glass-btn glass-btn-primary !py-2 !px-4'
                      : 'text-glass-muted hover:text-white'
                  }`}
                >
                  Archived
                </button>
              </div>

              {listTab === 'active' && canManageBudgets(user) && (
                <Link
                  to="/budgets/create"
                  className="glass-btn glass-btn-primary inline-flex items-center justify-center gap-2 px-6 py-3"
                >
                  <span>+</span> Set New Budget
                </Link>
              )}
            </div>

            {budgets.length === 0 ? (
              <div className="text-center py-16 text-glass-muted glass-card">
                {listTab === 'archived'
                  ? 'No archived budgets.'
                  : 'No budgets found.'}
              </div>
            ) : (
              <>
                {/* Budget Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {budgets.map((budget) => {
                    const symbol = getCurrencySymbol(budget.currency);
                    const effective = budget.effective_amount || budget.amount;
                    const spent = budget.spent || 0;
                    const remaining = Math.max(0, effective - spent);
                    const percentage = budget.percentage || 0;
                    const isOver = budget.is_over || false;

                    return (
                      <div
                        key={budget.id}
                        className={`rounded-xl border p-6 shadow-sm transition-all hover:shadow-md ${
                          listTab === 'archived'
                            ? 'border-gray-200 bg-gray-50/80 opacity-95'
                            : 'border-gray-100 bg-white'
                        }`}
                      >
                        {/* Title & Period */}
                        <div className="mb-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold text-gray-900">
                              {budget.category?.name || 'Unnamed Category'}
                            </h3>
                            {listTab === 'archived' && (
                              <span className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                                Archived
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {budget.period.charAt(0).toUpperCase() + budget.period.slice(1)}
                            {budget.period === 'monthly' && ` • ${new Date(0, budget.month - 1).toLocaleString('default', { month: 'long' })}`}
                            {budget.period === 'quarterly' && ` • Q${budget.quarter}`}
                            {` • ${budget.year}`}
                          </p>

                          {/* Assignee */}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {budget.assignee_type === 'team' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Team: {budget.assigned_team?.name || '—'}
                              </span>
                            )}
                            {budget.assignee_type === 'user' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                                {budget.assigned_user?.name || 'User'}
                              </span>
                            )}
                            {budget.assignee_type === 'shared' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                Shared Budget
                              </span>
                            )}

                            {budget.supplements?.length > 0 && (
                              <button
                                onClick={() => openHistoryModal(budget)}
                                className="text-teal-600 hover:text-teal-800 text-sm font-medium"
                              >
                                View History →
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress & Numbers */}
                        <div className="space-y-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Original</span>
                            <span className="font-medium">{symbol}{budget.amount.toLocaleString()}</span>
                          </div>

                          <div className="flex justify-between text-sm border-t pt-3">
                            <span className="text-gray-600">Spent</span>
                            <span className={`${isOver ? 'text-red-600' : 'text-emerald-600'} font-bold`}>
                              {symbol}{spent.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex justify-between text-sm border-t pt-3">
                            <span className="text-gray-600">{isOver ? 'Over by' : 'Remaining'}</span>
                            <span className={`${isOver ? 'text-red-700' : 'text-emerald-700'} font-bold`}>
                              {symbol}{(isOver ? (spent - effective) : remaining).toLocaleString()}
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full bg-gray-200 rounded-full h-3 mt-4 overflow-hidden">
                            <div
                              className={`${isOver ? 'bg-red-500' : 'bg-teal-600'} h-full rounded-full transition-all`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                          </div>

                          <div className="text-right text-xs text-gray-500 mt-1">
                            {percentage.toFixed(1)}% used
                          </div>
                        </div>

                        {/* Actions */}
                        <div
                          className={`mt-6 grid gap-3 ${
                            listTab === 'archived' || !canManageBudgets(user)
                              ? 'grid-cols-1'
                              : 'grid-cols-2'
                          }`}
                        >
                          {canManageBudgets(user) ? (
                            <Link
                              to={`/budgets/${budget.id}/edit`}
                              className="py-2 px-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-center text-sm transition"
                            >
                              {listTab === 'archived' ? 'View' : 'Edit'}
                            </Link>
                          ) : (
                            <p className="py-2 px-3 text-center text-sm text-gray-500 rounded-lg bg-gray-50 border border-gray-100">
                              View only
                            </p>
                          )}

                          {listTab === 'active' && canManageBudgets(user) && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm('Delete this budget permanently?')) return;
                                try {
                                  await apiRequest(`/budgets/${budget.id}`, { method: 'DELETE' });
                                  toast.success('Budget deleted');
                                  fetchBudgets(page);
                                } catch {
                                  toast.error('Failed to delete');
                                }
                              }}
                              className="py-2 px-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-center text-sm transition border border-red-200"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {meta.total > 0 && (
                  <div className="mt-10 flex justify-center">
                    <Pagination
                      currentPage={meta.current_page}
                      totalPages={meta.last_page}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </>
            )}
          </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <GlassCard className="max-w-2xl w-full max-h-[90vh] overflow-y-auto !p-0">
            <div className="p-6 border-b border-white/10">
              <h3 className="text-xl font-bold text-white">Budget Increase History</h3>
              <p className="text-glass-muted mt-1">
                {modalData.category} — {modalData.period}
              </p>
            </div>

            <div className="p-6 space-y-5">
              {modalData.supplements.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No budget increases recorded.</p>
              ) : (
                modalData.supplements.map((sup) => (
                  <div key={sup.id} className="border-b pb-5 last:border-0 last:pb-0">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Added by: <strong className="text-gray-800">{sup.creator?.name || 'Unknown'}</strong></span>
                      <span>{new Date(sup.created_at).toLocaleString()}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Previous:</span>
                        <div className="font-medium">{getCurrencySymbol()}{sup.previous_amount?.toLocaleString() || '—'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Added:</span>
                        <div className="font-medium text-amber-600">+{getCurrencySymbol()}{sup.amount.toLocaleString()}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">New Total:</span>
                        <div className="font-bold text-teal-700">
                          {getCurrencySymbol()}{(sup.previous_amount + sup.amount).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {sup.notes && (
                      <p className="mt-3 text-sm text-gray-700">
                        <span className="font-medium text-gray-600">Note:</span> {sup.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end">
              <GlassButton onClick={() => setModalOpen(false)}>
                Close
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </AppLayout>
  );
};

export default Budgets;