import apiClient from '@/api/client';
import type { User } from '@/api/auth.api';

export interface ProfileDocument {
  id: number;
  type: string;
  label: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  rejection_reason?: string | null;
  file_url?: string | null;
  verified_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProfileCompletion {
  is_complete: boolean;
  kyc_required: boolean;
  documents_uploaded: number;
  documents_required: number;
  missing_document_types: string[];
}

export interface BirthdayMeta {
  has_dob: boolean;
  dob?: string | null;
  dob_formatted?: string | null;
  age?: number | null;
  is_today: boolean;
  days_until?: number | null;
  month_day?: string | null;
}

export interface DocumentTypeOption {
  value: string;
  label: string;
}

export interface ProfileUser extends User {
  phone?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
  initials?: string;
  dob?: string | null;
  dob_formatted?: string | null;
  joining_date?: string | null;
  joining_date_formatted?: string | null;
  work_location?: string | null;
  department?: string | null;
  birthday?: BirthdayMeta;
  profile_completion?: ProfileCompletion;
  document_types?: DocumentTypeOption[];
  documents?: ProfileDocument[];
  company?: {
    id: number;
    name: string;
    description?: string | null;
    website?: string | null;
    phone?: string | null;
    address?: string | null;
    logo_url?: string | null;
  } | null;
}

export interface UpdateProfilePayload {
  name: string;
  phone?: string | null;
  dob?: string | null;
  joining_date?: string | null;
  work_location?: string | null;
  company?: {
    description?: string | null;
    website?: string | null;
    phone?: string | null;
    address?: string | null;
  };
}

interface ProfileResponse {
  success: boolean;
  message?: string;
  user: ProfileUser;
}

interface DocumentsResponse {
  success: boolean;
  document_types: DocumentTypeOption[];
  documents: ProfileDocument[];
  profile_completion: ProfileCompletion;
}

function unwrapUser(response: ProfileResponse | ProfileUser): ProfileUser {
  if ('user' in response && response.user) {
    return response.user;
  }
  return response as ProfileUser;
}

export async function fetchProfile(): Promise<ProfileUser> {
  const response = await apiClient.get<ProfileResponse>('/me');
  return unwrapUser(response);
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<ProfileUser> {
  const response = await apiClient.patch<ProfileResponse>('/me', payload);
  return unwrapUser(response);
}

export async function uploadAvatar(file: File): Promise<ProfileUser> {
  const formData = new FormData();
  formData.append('avatar', file);
  const response = await apiClient.post<ProfileResponse>('/me/avatar', formData);
  return unwrapUser(response);
}

export async function removeAvatar(): Promise<ProfileUser> {
  const response = await apiClient.delete<ProfileResponse>('/me/avatar');
  return unwrapUser(response);
}

export async function updatePassword(payload: {
  current_password: string;
  password: string;
  password_confirmation: string;
}): Promise<void> {
  await apiClient.put<{ success: boolean; message?: string }>('/me/password', payload);
}

export async function fetchDocuments(): Promise<DocumentsResponse> {
  return apiClient.get<DocumentsResponse>('/me/documents');
}

export async function uploadDocument(payload: {
  file: File;
  type: string;
  document_id?: number;
}): Promise<ProfileUser> {
  const formData = new FormData();
  formData.append('file', payload.file);
  formData.append('type', payload.type);
  if (payload.document_id) {
    formData.append('document_id', String(payload.document_id));
  }
  const response = await apiClient.post<ProfileResponse>('/me/documents', formData);
  return unwrapUser(response);
}

export async function uploadCompanyLogo(file: File): Promise<ProfileUser> {
  const formData = new FormData();
  formData.append('company_logo', file);
  const response = await apiClient.post<ProfileResponse>('/me/company-logo', formData);
  return unwrapUser(response);
}
