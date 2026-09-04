import apiClient from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

export interface User {
  id: number | string;
  name: string;
  email: string;
  role?: string;
  role_name?: string;
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
  permissions?: (string | { name: string })[];
  roles?: (string | { name: string })[];
  birthday?: {
    has_dob?: boolean;
    is_today?: boolean;
    days_until?: number | null;
    age?: number | null;
    dob_formatted?: string | null;
  };
  profile_completion?: {
    is_complete?: boolean;
    kyc_required?: boolean;
    documents_uploaded?: number;
    documents_required?: number;
    missing_document_types?: string[];
  };
  user?: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
  device_name?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

interface WrappedLoginResponse {
  data: LoginResponse;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse | WrappedLoginResponse>('/login', credentials);
  const auth = 'data' in response ? response.data : response;

  if (!auth?.token || !auth?.user) {
    throw new Error('Login response did not include a token and user.');
  }

  useAuthStore.getState().setAuth(auth.token, auth.user);
  localStorage.setItem('auth_token', auth.token);
  localStorage.setItem('user', JSON.stringify(auth.user));

  return auth;
}

export async function getCurrentUser(): Promise<ApiResponse<User>> {
  try {
    const response = await apiClient.get<User>('/me');
    const user = response.user ?? response;
    useAuthStore.getState().updateUser(user);
    localStorage.setItem('user', JSON.stringify(user));
    return { success: true, data: user };
  } catch (error) {
    const apiError = error as Error & { status?: number };
    console.error('Failed to fetch user:', apiError);

    if (apiError.status === 401) {
      useAuthStore.getState().logout();
    }

    return {
      success: false,
      error: apiError.message || 'Failed to fetch user data. Please login again.',
    };
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/logout');
  } catch {
    // Ignore logout errors
  } finally {
    useAuthStore.getState().logout();
  }
}
