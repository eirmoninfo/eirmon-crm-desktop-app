import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Cake,
  Camera,
  FileText,
  Lock,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import {
  GlassButton,
  GlassCard,
  GlassInput,
  PageHeader,
} from "../components/glass/Glass";
import {
  fetchProfile,
  removeAvatar,
  updatePassword,
  updateProfile,
  uploadAvatar,
  uploadCompanyLogo,
  uploadDocument,
} from "../api/profile.api";
import { resolveMediaUrl } from "../api/api.config";
import { logoutSession } from "../utils/sessionLogout";
import { useAuthStore } from "../stores/authStore";

function errToast(error, fallback) {
  const apiError = error;
  if (apiError?.errors && typeof apiError.errors === "object") {
    const first = Object.values(apiError.errors).flat()[0];
    if (first) {
      toast.error(String(first));
      return;
    }
  }
  toast.error(apiError?.message || fallback);
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "approved") return "bg-emerald-500/15 text-emerald-200";
  if (value === "rejected") return "bg-red-500/15 text-red-200";
  return "bg-amber-500/15 text-amber-100";
}

export default function Profile() {
  const navigate = useNavigate();
  const updateUser = useAuthStore((state) => state.updateUser);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    dob: "",
    joining_date: "",
    work_location: "",
    company_description: "",
    company_website: "",
    company_phone: "",
    company_address: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    password: "",
    password_confirmation: "",
  });
  const avatarInputRef = useRef(null);
  const companyLogoInputRef = useRef(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const user = await fetchProfile();
      setProfile(user);
      updateUser(user);
      setForm({
        name: user.name || "",
        phone: user.phone || "",
        dob: user.dob || "",
        joining_date: user.joining_date || "",
        work_location: user.work_location || "",
        company_description: user.company?.description || "",
        company_website: user.company?.website || "",
        company_phone: user.company?.phone || "",
        company_address: user.company?.address || "",
      });
    } catch (error) {
      errToast(error, "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, [updateUser]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const isAdmin = useMemo(() => {
    const roles = profile?.roles || [];
    return roles.some((role) => {
      const name = String(typeof role === "string" ? role : role?.name || "").toLowerCase();
      return name.includes("admin");
    });
  }, [profile?.roles]);

  const avatarUrl = resolveMediaUrl(profile?.avatar_url || profile?.avatar || "");
  const completion = profile?.profile_completion;
  const birthday = profile?.birthday;
  const documentTypes = profile?.document_types || [];
  const documentsByType = useMemo(() => {
    const map = new Map();
    (profile?.documents || []).forEach((doc) => map.set(doc.type, doc));
    return map;
  }, [profile?.documents]);

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone || null,
        dob: form.dob || null,
        joining_date: form.joining_date || null,
        work_location: form.work_location || null,
      };

      if (isAdmin) {
        payload.company = {
          description: form.company_description || null,
          website: form.company_website || null,
          phone: form.company_phone || null,
          address: form.company_address || null,
        };
      }

      const user = await updateProfile(payload);
      setProfile(user);
      updateUser(user);
      toast.success("Profile updated.");
    } catch (error) {
      errToast(error, "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const user = await uploadAvatar(file);
      setProfile(user);
      updateUser(user);
      toast.success("Profile photo updated.");
    } catch (error) {
      errToast(error, "Could not upload profile photo.");
    } finally {
      event.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      const user = await removeAvatar();
      setProfile(user);
      updateUser(user);
      toast.success("Profile photo removed.");
    } catch (error) {
      errToast(error, "Could not remove profile photo.");
    }
  };

  const handleCompanyLogoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const user = await uploadCompanyLogo(file);
      setProfile(user);
      updateUser(user);
      toast.success("Company logo updated.");
    } catch (error) {
      errToast(error, "Could not upload company logo.");
    } finally {
      event.target.value = "";
    }
  };

  const handleDocumentUpload = async (type, documentId) => async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const user = await uploadDocument({ file, type, document_id: documentId });
      setProfile(user);
      updateUser(user);
      toast.success("Document uploaded.");
    } catch (error) {
      errToast(error, "Could not upload document.");
    } finally {
      event.target.value = "";
    }
  };

  const handlePasswordUpdate = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updatePassword(passwordForm);
      setPasswordForm({
        current_password: "",
        password: "",
        password_confirmation: "",
      });
      toast.success("Password updated.");
    } catch (error) {
      errToast(error, "Could not update password.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logoutSession();
    navigate("/login");
  };

  return (
    <AppLayout
      loading={loading}
      loadingLabel="Loading profile…"
      user={profile}
      onLogout={handleLogout}
      mainClassName="max-w-5xl"
    >
      <PageHeader
        title="My Profile"
        subtitle="Manage your personal details, photo, birthday, and KYC documents."
      />

      {birthday?.is_today ? (
        <GlassCard className="mb-6 border border-pink-400/30 bg-pink-500/10 p-5">
          <div className="flex items-center gap-3">
            <Cake className="h-6 w-6 text-pink-200" />
            <div>
              <p className="font-semibold text-pink-50">Happy Birthday!</p>
              <p className="text-sm text-pink-100/80">
                Wishing you a great day{birthday.age ? ` — turning ${birthday.age}` : ""}.
              </p>
            </div>
          </div>
        </GlassCard>
      ) : null}

      {completion?.kyc_required ? (
        <GlassCard
          className={`mb-6 p-5 ${
            completion.is_complete
              ? "border border-emerald-400/20 bg-emerald-500/10"
              : "border border-amber-400/20 bg-amber-500/10"
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-6 w-6 shrink-0 text-glass-muted" />
            <div>
              <p className="font-semibold">
                {completion.is_complete ? "Profile complete" : "Profile incomplete"}
              </p>
              <p className="mt-1 text-sm text-glass-muted">
                {completion.is_complete
                  ? "Your KYC documents are uploaded and under review."
                  : `Upload at least ${completion.documents_required} documents to complete KYC. Uploaded: ${completion.documents_uploaded}/${completion.documents_required}.`}
              </p>
            </div>
          </div>
        </GlassCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
        <GlassCard className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] text-3xl font-bold text-white">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  profile?.initials || profile?.name?.slice(0, 2)?.toUpperCase() || "EO"
                )}
              </div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute bottom-1 right-1 rounded-full bg-white/15 p-2 backdrop-blur"
                aria-label="Change profile photo"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <p className="mt-4 text-lg font-semibold">{profile?.name}</p>
            <p className="text-sm text-glass-muted">{profile?.email}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-glass-subtle">
              {profile?.role_name || profile?.role || "Staff"}
            </p>
            <div className="mt-4 flex gap-2">
              <GlassButton variant="secondary" onClick={() => avatarInputRef.current?.click()}>
                Upload photo
              </GlassButton>
              {avatarUrl ? (
                <GlassButton variant="ghost" onClick={handleRemoveAvatar}>
                  <Trash2 className="h-4 w-4" />
                </GlassButton>
              ) : null}
            </div>
            {birthday?.has_dob ? (
              <div className="mt-5 w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                <p className="text-xs uppercase tracking-wide text-glass-subtle">Birthday</p>
                <p className="mt-1 font-medium">{birthday.dob_formatted}</p>
                <p className="mt-1 text-sm text-glass-muted">
                  {birthday.is_today
                    ? "Today"
                    : birthday.days_until === 0
                      ? "Today"
                      : `${birthday.days_until} day(s) away`}
                </p>
              </div>
            ) : null}
          </div>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold">Personal information</h2>
            <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleSaveProfile}>
              <GlassInput
                label="Full name"
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                required
              />
              <GlassInput
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
              />
              <GlassInput
                label="Date of birth"
                type="date"
                value={form.dob}
                onChange={(e) => setForm((current) => ({ ...current, dob: e.target.value }))}
              />
              <GlassInput
                label="Joining date"
                type="date"
                value={form.joining_date}
                onChange={(e) =>
                  setForm((current) => ({ ...current, joining_date: e.target.value }))
                }
              />
              <GlassInput
                label="Work location"
                className="md:col-span-2"
                value={form.work_location}
                onChange={(e) =>
                  setForm((current) => ({ ...current, work_location: e.target.value }))
                }
              />
              <div className="md:col-span-2">
                <GlassButton type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save profile"}
                </GlassButton>
              </div>
            </form>
          </GlassCard>

          {isAdmin && profile?.company ? (
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold">Company details</h2>
              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  {profile.company.logo_url ? (
                    <img
                      src={resolveMediaUrl(profile.company.logo_url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm text-glass-muted">Logo</span>
                  )}
                </div>
                <div>
                  <p className="font-medium">{profile.company.name}</p>
                  <GlassButton
                    variant="secondary"
                    className="mt-2"
                    onClick={() => companyLogoInputRef.current?.click()}
                  >
                    Upload company logo
                  </GlassButton>
                  <input
                    ref={companyLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleCompanyLogoChange}
                  />
                </div>
              </div>
              <form className="mt-5 grid gap-4" onSubmit={handleSaveProfile}>
                <GlassInput
                  label="Description"
                  value={form.company_description}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      company_description: e.target.value,
                    }))
                  }
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <GlassInput
                    label="Website"
                    value={form.company_website}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, company_website: e.target.value }))
                    }
                  />
                  <GlassInput
                    label="Company phone"
                    value={form.company_phone}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, company_phone: e.target.value }))
                    }
                  />
                </div>
                <GlassInput
                  label="Address"
                  value={form.company_address}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, company_address: e.target.value }))
                  }
                />
                <GlassButton type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save company details"}
                </GlassButton>
              </form>
            </GlassCard>
          ) : null}

          {completion?.kyc_required ? (
            <GlassCard className="p-6">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <h2 className="text-lg font-semibold">KYC documents</h2>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {documentTypes.map((docType) => {
                  const doc = documentsByType.get(docType.value);
                  return (
                    <div
                      key={docType.value}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{docType.label}</p>
                          {doc ? (
                            <span
                              className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                                doc.status
                              )}`}
                            >
                              {doc.status}
                            </span>
                          ) : (
                            <p className="mt-2 text-sm text-glass-muted">Not uploaded</p>
                          )}
                        </div>
                        {doc?.file_url ? (
                          <a
                            href={resolveMediaUrl(doc.file_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[#64d2ff] hover:underline"
                          >
                            View
                          </a>
                        ) : null}
                      </div>
                      {doc?.rejection_reason ? (
                        <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-100">
                          {doc.rejection_reason}
                        </p>
                      ) : null}
                      {doc?.status !== "approved" ? (
                        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-glass-muted">
                          <Upload className="h-4 w-4" />
                          <span>{doc ? "Re-upload document" : "Upload document"}</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                            className="hidden"
                            onChange={handleDocumentUpload(docType.value, doc?.id)}
                          />
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          ) : null}

          <GlassCard className="p-6">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Change password</h2>
            </div>
            <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handlePasswordUpdate}>
              <GlassInput
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={passwordForm.current_password}
                onChange={(e) =>
                  setPasswordForm((current) => ({
                    ...current,
                    current_password: e.target.value,
                  }))
                }
                required
              />
              <div className="hidden md:block" />
              <GlassInput
                label="New password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.password}
                onChange={(e) =>
                  setPasswordForm((current) => ({ ...current, password: e.target.value }))
                }
                required
              />
              <GlassInput
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.password_confirmation}
                onChange={(e) =>
                  setPasswordForm((current) => ({
                    ...current,
                    password_confirmation: e.target.value,
                  }))
                }
                required
              />
              <div className="md:col-span-2">
                <GlassButton type="submit" disabled={saving}>
                  {saving ? "Updating…" : "Update password"}
                </GlassButton>
              </div>
            </form>
          </GlassCard>
        </div>
      </div>
    </AppLayout>
  );
}
