import { useAuthStore } from '@/stores/authStore';

const LEGACY_TOKEN_KEY = 'auth_token';
const LEGACY_USER_KEY = 'user';

export function saveToken(token: string): void {
  localStorage.setItem(LEGACY_TOKEN_KEY, token);
  useAuthStore.getState().setAuth(token, useAuthStore.getState().user!);
}

export function getToken(): string | null {
  const storeToken = useAuthStore.getState().token;
  if (storeToken) return storeToken;
  return localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function clearAuth(): void {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
  localStorage.removeItem('eirmon-auth');
  useAuthStore.getState().logout();
}

export function getStoredUser(): ReturnType<typeof useAuthStore.getState>['user'] {
  const storeUser = useAuthStore.getState().user;
  if (storeUser) return storeUser;
  try {
    const raw = localStorage.getItem(LEGACY_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredPermissions(): string[] {
  return useAuthStore.getState().permissions;
}