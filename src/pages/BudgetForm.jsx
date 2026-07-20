// src/pages/BudgetForm.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiRequest } from '../api/http'; // adjust path
import AppLayout from '../components/layout/AppLayout';
import { GlassButton, GlassCard } from '../components/glass/Glass';
const BudgetForm = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // for edit mode
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    company_id: '',
    category_id: '',
    amount: '',
    currency: 'INR',
    period: 'monthly',
    year: new Date().getFullYear().toString(),
    month: '',
    quarter: '',
    assignee_type: 'user',
    assigned_to: '',
    assigned_team_id: '',
  });

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [companies, setCompanies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Fetch create data / edit data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiRequest('/budgets/create-data');
        if (res?.status === 'success') {
          const { companies, categories, users, teams, isSuperAdmin } = res.data;
          console.log('res.data;',res.data)
          setCompanies(companies || []);
          setCategories(categories || []);
          setUsers(users || []);
          setTeams(teams || []);
          setIsSuperAdmin(isSuperAdmin || false);

          // For non-superadmin, set company automatically
          if (!isSuperAdmin && users?.[0]?.company_id) {
            setFormData((prev) => ({ ...prev, company_id: users[0].company_id }));
          }
        }

        // If edit mode → fetch existing budget
        if (isEdit) {
          const budgetRes = await apiRequest(`/budgets/${id}`);
          if (budgetRes?.status === 'success') {
            const budget = budgetRes.data;
            setFormData({
              company_id: budget.company_id || '',
              category_id: budget.category_id || '',
              amount: budget.amount?.toString() || '',
              currency: budget.currency || 'INR',
              period: budget.period || 'monthly',
              year: budget.year?.toString() || '',
              month: budget.month?.toString() || '',
              quarter: budget.quarter?.toString() || '',
              assignee_type: budget.assignee_type || 'user',
              assigned_to: budget.assigned_to || '',
              assigned_team_id: budget.assigned_team_id || '',
            });
          }
        }
      } catch (err) {
        console.error('Failed to load form data:', err);
        toast.error('Failed to load budget data');
      } finally {
        setInitialLoading(false);
      }
    };

    fetchData();
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);

  const toastId = toast.loading(isEdit ? "Updating budget..." : "Creating budget...");

  try {
    const payload = { ...formData };

    // Clean up assignee fields
    if (payload.assignee_type === "user") {
      payload.assigned_team_id = null;
    } else if (payload.assignee_type === "team") {
      payload.assigned_to = null;
    } else {
      payload.assigned_to = null;
      payload.assigned_team_id = null;
    }

    // ✅ convert numeric fields if needed (optional but recommended)
    payload.amount = payload.amount ? Number(payload.amount) : null;
    payload.category_id = payload.category_id ? Number(payload.category_id) : null;
    payload.assigned_to = payload.assigned_to ? Number(payload.assigned_to) : null;
    payload.assigned_team_id = payload.assigned_team_id ? Number(payload.assigned_team_id) : null;
    payload.month = payload.month ? Number(payload.month) : null;
    payload.year = payload.year ? Number(payload.year) : null;

    // ✅ If company_id empty, remove it (backend can set from auth user)
    if (!payload.company_id) delete payload.company_id;

    console.log("payload:", payload);

    const endpoint = isEdit ? `/budgets/${id}` : "/budgets";
    const method = isEdit ? "PUT" : "POST";

    const res = await apiRequest(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), // ✅ THIS FIXES [object Object]
    });

    if (res?.status === "success") {
      toast.success(isEdit ? "Budget updated!" : "Budget created!", { id: toastId });
      navigate("/budgets");
    } else {
      throw new Error(res?.message || "Operation failed");
    }
  } catch (err) {
    toast.error(err?.message || "Something went wrong", { id: toastId });
  } finally {
    setLoading(false);
  }
};


  const symbol = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    AUD: 'A$',
    CAD: 'C$',
    AED: 'د.إ',
  }[formData.currency] || '₹';

  return (
    <AppLayout loading={initialLoading} loadingLabel="Loading form…">
          <div className="max-w-5xl mx-auto">
            <GlassCard>
              <h2 className="text-3xl font-bold text-white mb-10 flex items-center gap-4">
                <div className="w-14 h-14 bg-[#0a84ff]/30 rounded-2xl flex items-center justify-center">
                  <span className="text-[#64d2ff] text-2xl font-bold">{symbol}</span>
                </div>
                {isEdit ? 'Edit Budget' : 'Set New Budget'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Company, Category, Currency, Amount */}
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Company */}
                  {isSuperAdmin ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company *
                      </label>
                      <select
                        name="company_id"
                        value={formData.company_id}
                        onChange={handleChange}
                        required
                        className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Select Company</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company
                      </label>
                      <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 font-medium">
                        {companies[0]?.name || 'Your Company'}
                      </div>
                      <input type="hidden" name="company_id" value={formData.company_id} />
                    </div>
                  )}

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category *
                    </label>
                    <select
                      name="category_id"
                      value={formData.category_id}
                      onChange={handleChange}
                      required
                      className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">Select Category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Currency */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Currency *
                    </label>
                    <select
                      name="currency"
                      value={formData.currency}
                      onChange={handleChange}
                      required
                      className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="INR">INR - Indian Rupee</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="AUD">AUD - Australian Dollar</option>
                      <option value="CAD">CAD - Canadian Dollar</option>
                      <option value="AED">AED - UAE Dirham</option>
                    </select>
                  </div>

                  {/* Amount */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Budget Amount *
                    </label>
                    <div className="absolute top-9 left-3 text-gray-500 pointer-events-none">
                      {symbol}
                    </div>
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={handleChange}
                      required
                      className="block w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                {/* Period Selection */}
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Period *
                    </label>
                    <select
                      name="period"
                      value={formData.period}
                      onChange={handleChange}
                      required
                      className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Year *
                    </label>
                    <input
                      name="year"
                      type="number"
                      min="2020"
                      max="2030"
                      value={formData.year}
                      onChange={handleChange}
                      required
                      className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  {formData.period === 'monthly' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Month
                      </label>
                      <select
                        name="month"
                        value={formData.month}
                        onChange={handleChange}
                        required
                        className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Select Month</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>
                            {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formData.period === 'quarterly' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quarter
                      </label>
                      <select
                        name="quarter"
                        value={formData.quarter}
                        onChange={handleChange}
                        className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Select Quarter</option>
                        {[1, 2, 3, 4].map((q) => (
                          <option key={q} value={q}>
                            Q{q} ({['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'][q - 1]})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Assign To */}
                <div className="space-y-6">
                  <label className="block text-sm font-semibold text-gray-900">
                    Assign Budget To
                  </label>

                  <div className="flex flex-wrap gap-8">
                    {['user', 'team', 'shared'].map((type) => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="assignee_type"
                          value={type}
                          checked={formData.assignee_type === type}
                          onChange={handleChange}
                          className="h-4 w-4 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-gray-700">
                          {type === 'user'
                            ? 'Single User'
                            : type === 'team'
                            ? 'Whole Team'
                            : 'Shared (unassigned)'}
                        </span>
                      </label>
                    ))}
                  </div>

                  {formData.assignee_type === 'user' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select User
                      </label>
                      <select
                        name="assigned_to"
                        value={formData.assigned_to}
                        onChange={handleChange}
                        className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">— Select user —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} — {u.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formData.assignee_type === 'team' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Team
                      </label>
                      <select
                        name="assigned_team_id"
                        value={formData.assigned_team_id}
                        onChange={handleChange}
                        className="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">— Select team —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-4 pt-8 border-t">
                  <button
                    type="button"
                    onClick={() => navigate('/budgets')}
                    className="px-8 py-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>

                  <GlassButton type="submit" disabled={loading}>
                    {loading ? 'Saving...' : isEdit ? 'Update Budget' : 'Create Budget'}
                  </GlassButton>
                </div>
              </form>
            </GlassCard>
          </div>
    </AppLayout>
  );
};

export default BudgetForm;