import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiRequest } from '../api/http';
import AppLayout from '../components/layout/AppLayout';
import { GlassButton, GlassCard } from '../components/glass/Glass';
import { getToken } from "../utils/storage";

const ExpenseCategoryCreate = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    const token = getToken();

    const toastId = toast.loading('Creating category...');

    try {
      const res = await apiRequest('/expense-categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (res?.message?.includes('success') || res?.data) {
        toast.success('Category created successfully!', { id: toastId });
        navigate('/expense-categories');
      } else {
        throw new Error(res?.message || 'Failed to create category');
      }
    } catch (err) {
      const errorMessage = err.message || 'Something went wrong';
      toast.error(errorMessage, { id: toastId });

      if (err.response?.data?.errors) {
        const validationErrors = {};
        Object.keys(err.response.data.errors).forEach((key) => {
          validationErrors[key] = err.response.data.errors[key][0];
        });
        setErrors(validationErrors);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <GlassCard>
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-3xl font-bold text-white flex items-center gap-4">
              Create New Expense Category
            </h2>

            <button
              onClick={() => navigate('/expense-categories')}
              className="text-[#64d2ff] hover:text-[#0a84ff] font-semibold flex items-center gap-2"
            >
              Back to Categories
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-10">
            <div className="max-w-2xl">
              <label htmlFor="name" className="block text-lg font-semibold text-white/90 mb-2">
                Category Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Marketing, Travel, Office Supplies..."
                required
                className={`glass-input w-full ${errors.name ? 'border-red-500' : ''}`}
              />
              {errors.name && (
                <p className="mt-2 text-sm text-red-400">{errors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="description" className="block text-lg font-semibold text-white/90 mb-2">
                Description (Optional)
              </label>
              <textarea
                id="description"
                name="description"
                rows={5}
                value={formData.description}
                onChange={handleChange}
                placeholder="Brief description of what this category is used for..."
                className={`glass-input w-full min-h-[120px] ${errors.description ? 'border-red-500' : ''}`}
              />
              {errors.description && (
                <p className="mt-2 text-sm text-red-400">{errors.description}</p>
              )}
            </div>

            <div className="flex justify-end gap-5 pt-8 border-t border-white/10">
              <GlassButton type="button" variant="secondary" onClick={() => navigate('/expense-categories')}>
                Cancel
              </GlassButton>
              <GlassButton type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Category'}
              </GlassButton>
            </div>
          </form>
        </GlassCard>
      </div>
    </AppLayout>
  );
};

export default ExpenseCategoryCreate;
