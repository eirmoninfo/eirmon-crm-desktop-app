// src/pages/ExpenseDetail.jsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiRequest } from '../api/http'; // adjust path
import { getCurrentUser } from '../api/auth.api';
import AppLayout from '../components/layout/AppLayout';
import { GlassCard } from '../components/glass/Glass';
import { getUserPayload, canApproveExpenses } from '../utils/permissions';

const ExpenseDetail = () => {
  const { id } = useParams();
  const [user, setUser] = useState(null);

  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const fetchExpense = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/expenses/${id}`);
      if (res?.status === 'success') {
        setExpense(res.data);
      }
    } catch (err) {
      console.error('Failed to load expense:', err);
      toast.error('Failed to load expense details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpense();
  }, [id]);

  useEffect(() => {
    (async () => {
      const r = await getCurrentUser();
      if (r.success) setUser(getUserPayload(r.data));
    })();
  }, []);

  const handleApprove = async () => {
    if (!window.confirm('Approve this expense?')) return;

    try {
      await apiRequest(`/expenses/${id}/approve`, {
        method: 'POST',
        body: {},
      });
      toast.success('Expense approved!');
      fetchExpense();
    } catch {
      toast.error('Failed to approve expense');
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    if (!window.confirm('Reject this expense?')) return;

    try {
      await apiRequest(`/expenses/${id}/reject`, {
        method: 'POST',
        body: { verification_note: rejectNote },
      });
      toast.success('Expense rejected');
      setShowRejectInput(false);
      setRejectNote('');
      fetchExpense();
    } catch {
      toast.error('Failed to reject expense');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };

    return (
      <span
        className={`px-4 py-2 rounded-full text-sm font-bold ${
          styles[status] || 'bg-gray-100 text-gray-800'
        }`}
      >
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending'}
      </span>
    );
  };

  if (!expense) {
    return (
      <AppLayout loadingLabel="Loading expense…">
        <div className="text-center text-red-400">Expense not found</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user} loading={loading} loadingLabel="Loading expense details…">
          <div className="max-w-4xl mx-auto">
            <GlassCard>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
                <h2 className="text-2xl font-bold text-white">
                  Expense #{expense.id}
                </h2>
                {getStatusBadge(expense.status)}
              </div>

              {/* Main Details Grid */}
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <strong className="text-gray-700 block">Submitted By:</strong>
                    <span className="text-lg font-medium">
                      {expense.user?.name || 'Unknown User (Deleted)'}
                    </span>
                    {expense.user?.email && (
                      <p className="text-sm text-gray-500">{expense.user.email}</p>
                    )}
                  </div>

                  <div>
                    <strong className="text-gray-700 block">Date:</strong>
                    <span className="text-lg">
                      {new Date(expense.date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <div>
                    <strong className="text-gray-700 block">Category:</strong>
                    <span className="text-lg">
                      {expense.category?.name || (
                        <em className="text-gray-500">No Category Assigned</em>
                      )}
                    </span>
                  </div>

                  <div>
                    <strong className="text-gray-700 block">Amount:</strong>
                    <span className="text-3xl font-bold text-teal-600">
                      ₹{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {expense.verified_by && (
                    <div>
                      <strong className="text-gray-700 block">Verified By:</strong>
                      <span className="text-lg">
                        {expense.verifier?.name || 'Unknown Verifier'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <strong className="text-gray-700 block">Receipt:</strong>
                    {expense.receipt ? (
                      <div className="mt-2">
                        <a
                          href={`/storage/${expense.receipt}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-800 font-medium"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          View Receipt
                        </a>
                      </div>
                    ) : (
                      <span className="text-gray-500">No receipt uploaded</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="mt-10">
                <strong className="text-gray-700 block mb-2">Description:</strong>
                <p className="bg-gray-50 p-6 rounded-xl text-gray-700 whitespace-pre-wrap">
                  {expense.description || '— No description provided —'}
                </p>
              </div>

              {/* Verification Note (if rejected) */}
              {expense.verification_note && (
                <div className="mt-10">
                  <strong className="text-gray-700 block mb-2">Verification Note:</strong>
                  <p className="bg-red-50 border border-red-200 p-6 rounded-xl text-red-800">
                    {expense.verification_note}
                  </p>
                </div>
              )}

              {/* Action Buttons - Only for pending & authorized users */}
              {expense.status === 'pending' && canApproveExpenses(user) && (
                <div className="mt-12 p-8 bg-gray-50 rounded-xl border border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-900 mb-6">Take Action</h3>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Approve */}
                    <button
                      onClick={handleApprove}
                      className="w-full px-6 py-5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-md transition transform hover:scale-105 flex items-center justify-center gap-3"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Approve Expense
                    </button>

                    {/* Reject */}
                    <div>
                      {!showRejectInput ? (
                        <button
                          onClick={() => setShowRejectInput(true)}
                          className="w-full px-6 py-5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-md transition transform hover:scale-105 flex items-center justify-center gap-3"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                            />
                          </svg>
                          Reject Expense
                        </button>
                      ) : (
                        <div className="space-y-4">
                          <textarea
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="Enter reason for rejection..."
                            required
                            className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 min-h-[120px]"
                          />

                          <div className="flex gap-4">
                            <button
                              onClick={() => setShowRejectInput(false)}
                              className="flex-1 px-6 py-4 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleReject}
                              className="flex-1 px-6 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition"
                            >
                              Confirm Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Back Link */}
              <div className="mt-12">
                <Link
                  to="/expense"
                  className="inline-flex items-center text-teal-600 hover:text-teal-800 font-medium text-lg"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Expenses List
                </Link>
              </div>
            </GlassCard>
          </div>
    </AppLayout>
  );
};

export default ExpenseDetail;