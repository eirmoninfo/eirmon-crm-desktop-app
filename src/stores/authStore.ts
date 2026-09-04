import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/api/auth.api';

interface AuthState {
  token: string | null;
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  setPermissions: (permissions: string[]) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
}

const STORAGE_KEY = 'eirmon-auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: true,

      setAuth: (token: string, user: User) => {
        const permissions = normalizePermissions(user);
        set({
          token,
          user,
          permissions,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      updateUser: (partialUser: Partial<User>) => {
        const currentUser = get().user;
        if (!currentUser) return;
        const updatedUser = { ...currentUser, ...partialUser };
        const permissions = normalizePermissions(updatedUser);
        set({ user: updatedUser, permissions });
      },

      setPermissions: (permissions: string[]) => {
        set({ permissions });
      },

      logout: () => {
        set({
          token: null,
          user: null,
          permissions: [],
          isAuthenticated: false,
          isLoading: false,
        });
      },

      setLoading: (isLoading: boolean) => {
        set({ isLoading });
      },

      hasPermission: (permission: string) => {
        const { permissions, user } = get();
        if (!permission) return true;
        if (!user) return false;
        if (isSuperAdminUser(user)) return true;
        if (permissions.length === 0) return false;
        return permissions.includes(permission);
      },

      hasAnyPermission: (permissionsList: string[]) => {
        const { permissions, user } = get();
        if (!permissionsList?.length) return true;
        if (!user) return false;
        if (isSuperAdminUser(user)) return true;
        if (permissions.length === 0) return false;
        return permissionsList.some((p) => permissions.includes(p));
      },

      isSuperAdmin: () => {
        const { user } = get();
        return isSuperAdminUser(user);
      },

      isAdmin: () => {
        const { user } = get();
        return isAdminUser(user);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);

function normalizePermissions(user: User | null): string[] {
  if (!user) return [];
  const u = user.user ?? user;
  const raw = u.permissions ?? user.permissions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => (typeof p === 'string' ? p : p?.name))
    .filter(Boolean) as string[];
}

function normalizeRoleName(user: User | null): string {
  if (!user) return '';
  const u = user.user ?? user;
  return String(u?.role ?? u?.role_name ?? '').toLowerCase().trim();
}

function roleNamesFromUser(user: User | null): string[] {
  if (!user) return [];
  const u = user.user ?? user;
  const names = [normalizeRoleName(user)];
  const roles = u?.roles ?? [];
  if (Array.isArray(roles)) {
    for (const role of roles) {
      names.push(
        String(typeof role === 'string' ? role : role?.name ?? '')
          .toLowerCase()
          .trim()
      );
    }
  }
  return names.filter(Boolean);
}

function isSuperAdminUser(user: User | null): boolean {
  if (!user) return false;
  return roleNamesFromUser(user).some((role) => role.includes('super admin'));
}

function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  return roleNamesFromUser(user).some(
    (role) => role === 'admin' || role === 'company admin'
  );
}