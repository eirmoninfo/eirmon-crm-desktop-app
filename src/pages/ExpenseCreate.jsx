import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiRequest } from '../api/http'; // adjust path
import AppLayout from '../components/layout/AppLayout';
import { GlassButton, GlassCard } from '../components/glass/Glass';

const ExpenseCreate = () => {
  const navigate = useNavigate();
  const { id: expenseId } = useParams();
  const isEdit = Boolean(expenseId);

  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    receipt: null,
  });

  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState({}); // key: category-period-year-month/quarter
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [budgetInfo, setBudgetInfo] = useState(null); // for UI display
  const [isOverBudget, setIsOverBudget] = useState(false);

  // Add Category Modal
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', description: '' });

  // Fetch initial data (categories + budgets), then expense when editing
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiRequest('/expenses/create-data');
        if (res?.status === 'success') {
          setCategories(res.data.categories || []);
          const budgetMap = {};
          res.data.budgets?.forEach((b) => {
            const key = `${b.category_id}-${b.period}-${b.year}-${b.month || 0}-${b.quarter || 0}`;
            budgetMap[key] = {
              ...b,
              effective: (parseFloat(b.amount) || 0) + (b.supplements?.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0) || 0),
              spent: parseFloat(b.spent) || 0,
            };
          });
          setBudgets(budgetMap);
        }

        if (isEdit && expenseId) {
          const er = await apiRequest(`/expenses/${expenseId}`);
          if (er?.status === 'success' && er.data) {
            const ex = er.data;
            const d = ex.date ? String(ex.date).split('T')[0] : '';
            setFormData((prev) => ({
              ...prev,
              category_id: String(ex.category_id ?? ex.category?.id ?? ''),
              amount: String(ex.amount ?? ''),
              date: d || prev.date,
              description: ex.description || '',
              receipt: null,
            }));
          }
        }
      } catch (err) {
        console.error('Failed to load form data:', err);
        toast.error('Failed to load form data');
        if (isEdit) navigate('/expense');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isEdit, expenseId, navigate]);

  // Calculate budget info when category/date/amount changes
  useEffect(() => {
    if (!formData.category_id || !formData.date) {
      setBudgetInfo(null);
      setIsOverBudget(false);
      return;
    }

    const date = new Date(formData.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const quarter = Math.floor(date.getMonth() / 3) + 1;

    const amount = parseFloat(formData.amount) || 0;

    // Try to find matching budget: monthly → quarterly → yearly
    const possibleKeys = [
      `${formData.category_id}-monthly-${year}-${month}-0`,
      `${formData.category_id}-quarterly-${year}-0-${quarter}`,
      `${formData.category_id}-yearly-${year}-0-0`,
    ];

    const matched = possibleKeys.find((key) => budgets[key]);

    if (!matched) {
      setBudgetInfo(null);
      setIsOverBudget(false);
      return;
    }

    const budget = budgets[matched];
    const remaining = budget.effective - budget.spent;
    const newTotalSpent = budget.spent + amount;

    setBudgetInfo({
      allocated: budget.effective,
      spent: budget.spent,
      remaining,
      period: matched.includes('monthly')
        ? `Monthly — ${date.toLocaleString('default', { month: 'long', year: 'numeric' })}`
        : matched.includes('quarterly')
        ? `Q${quarter}, ${year}`
        : `Yearly — ${year}`,
      status: newTotalSpent > budget.effective ? 'Will Exceed Budget!' : 'Within Limit',
    });

    setIsOverBudget(newTotalSpent > budget.effective);
  }, [formData.category_id, formData.date, formData.amount, budgets]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setFormData((prev) => ({ ...prev, receipt: e.target.files[0] || null }));
  };

  

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const toastId = toast.loading(isEdit ? 'Saving expense...' : 'Submitting expense...');

    try {
      const formPayload = new FormData();
      formPayload.append('category_id', String(formData.category_id));
      formPayload.append('amount', String(formData.amount));
      formPayload.append('date', String(formData.date));
      formPayload.append('description', formData.description || '');

      if (formData.receipt) {
        formPayload.append('receipt', formData.receipt);
      }

      let res;
      if (isEdit && expenseId) {
        formPayload.append('_method', 'PUT');
        res = await apiRequest(`/expenses/${expenseId}`, {
          method: 'POST',
          body: formPayload,
        });
      } else {
        res = await apiRequest('/expenses-store', {
          method: 'POST',
          body: formPayload,
        });
      }

      if (res?.status === 'success') {
        toast.success(isEdit ? 'Expense updated.' : 'Expense submitted successfully!', { id: toastId });
        navigate('/expense');
      } else {
        throw new Error(res?.message || 'Failed to submit');
      }
    } catch (err) {
      toast.error(err?.message || 'Something went wrong', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };



  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;

    try {
      const res = await apiRequest('/expense-categories', {
        method: 'POST',
        body: newCategory,
      });

      if (res?.status === 'success') {
        toast.success('Category created!');
        setCategories((prev) => [...prev, res.data]);
        setNewCategory({ name: '', description: '' });
        setCategoryModalOpen(false);
      }
    } catch (err) {
      toast.error('Failed to create category');
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
  }[/* you can add currency from budget or default */ 'INR'] || '₹';

  return (
    <AppLayout loading={loading} loadingLabel="Loading form…">
          <div className="max-w-5xl mx-auto">
            <GlassCard>
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-3xl font-bold text-white flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#0a84ff]/30 rounded-xl flex items-center justify-center">
                    <span className="text-[#64d2ff] text-2xl font-bold">{symbol}</span>
                  </div>
                  {isEdit ? 'Edit Expense' : 'Submit New Expense'}
                </h2>

                <button
                  onClick={() => navigate('/expense')}
                  className="text-[#64d2ff] hover:text-[#0a84ff] font-semibold flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to expenses
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-10">
                {/* Category + Amount */}
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expense Category *
                    </label>
                    <div className="flex gap-3">
                      <select
                        name="category_id"
                        value={formData.category_id}
                        onChange={handleChange}
                        required
                        className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Choose category...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>

                      {/* <button
                        type="button"
                        onClick={() => setCategoryModalOpen(true)}
                        className="px-6 py-3 bg-teal-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition whitespace-nowrap"
                      >
                        + Add New
                      </button> */}
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                        {symbol}
                      </div>
                      <input
                        name="amount"
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={handleChange}
                        placeholder="0.00"
                        required
                        className="block w-full pl-10 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 text-lg font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Budget Info Box */}
                {budgetInfo && (
                  <div className="mt-6">
                    <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl p-6 border border-teal-200">
                      <h4 className="font-semibold text-teal-900 mb-4 text-lg">Budget Summary</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
                        <div>
                          <p className="text-gray-600">Allocated</p>
                          <p className="text-xl font-bold text-teal-700">
                            {symbol}
                            {budgetInfo.allocated.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Spent</p>
                          <p className="text-xl font-bold text-orange-600">
                            {symbol}
                            {budgetInfo.spent.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Remaining</p>
                          <p className={`text-xl font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                            {symbol}
                            {budgetInfo.remaining.toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Status</p>
                          <p className={`text-xl font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                            {budgetInfo.status}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 mt-4">{budgetInfo.period}</p>
                    </div>
                  </div>
                )}

                {/* Date & Receipt */}
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expense Date *
                    </label>
                    <input
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleChange}
                      required
                      className="block w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Attach Receipt / Bill (Optional)
                    </label>
                    <div className="mt-2">
                      <label className="block cursor-pointer">
                        <input
                          type="file"
                          name="receipt"
                          accept="image/*,.pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <div className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-center hover:border-teal-500 transition">
                          <p className="text-gray-600">Click to upload or drag & drop</p>
                          <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG, WEBP • Max 2MB</p>
                          {formData.receipt && (
                            <p className="mt-2 text-teal-600 font-medium">
                              Selected: {formData.receipt.name}
                            </p>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description / Purpose
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={5}
                    placeholder="e.g., Lunch meeting with client ABC Corp, purchased office printer ink..."
                    className="block w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-4 pt-8 border-t">
                  <button
                    type="button"
                    onClick={() => navigate('/expense')}
                    className="px-8 py-4 border border-gray-300 rounded-xl font-semibold hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>

                  <GlassButton type="submit" disabled={submitting || isOverBudget}>
                    {submitting ? (isEdit ? 'Saving...' : 'Submitting...') : isEdit ? 'Save changes' : 'Submit for Approval'}
                  </GlassButton>
                </div>
              </form>
            </GlassCard>
          </div>

      {categoryModalOpen && (
        <div className="fixed inset-0 bg-[#0000006b] flex items-center justify-center z-50 p-4">
          <GlassCard className="max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">Add New Category</h3>
              <button
                onClick={() => setCategoryModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddCategory} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  required
                  className="block w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Travel, Marketing, Software"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={newCategory.description}
                  onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                  rows={3}
                  className="block w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  placeholder="Brief description..."
                />
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  className="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <GlassButton type="submit">
                  Create Category
                </GlassButton>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </AppLayout>
  );
};

export default ExpenseCreate;