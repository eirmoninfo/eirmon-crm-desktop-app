import { P, type Permission } from '@/constants/permissions';

export interface User {
  id: number | string;
  name: string;
  email: string;
  role?: string;
  role_name?: string;
  permissions?: (string | { name: string })[];
  roles?: (string | { name: string })[];
  user?: User;
}

interface UserWithUser {
  user?: User;
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

export function isSuperAdminUser(user: User | null): boolean {
  if (!user) return false;
  return roleNamesFromUser(user).some((role) => role.includes('super admin'));
}

export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  return roleNamesFromUser(user).some(
    (role) => role === 'admin' || role === 'company admin'
  );
}

export function shouldCaptureScreenshots(user: User | null, config: Record<string, unknown> = {}): boolean {
  if (config.enable_screenshots === false) return false;
  if (config.user_screenshot_enabled === false) return false;
  if (isAdminUser(user)) return false;
  return true;
}

export function normalizePermissionList(source: User | null): string[] {
  if (!source) return [];
  const u = source.user ?? source;
  const raw = u.permissions ?? source.permissions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => (typeof p === 'string' ? p : p?.name))
    .filter(Boolean) as string[];
}

export function getUserPayload(authData: UserWithUser | User | null): User | null {
  if (!authData) return null;
  if ('user' in authData && authData.user) {
    return authData.user;
  }
  return authData;
}

export function canAccess(user: User | null, permission: Permission | string): boolean {
  if (!permission) return true;
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const list = normalizePermissionList(user);
  if (list.length === 0) return false;
  return list.includes(permission);
}

export function canAccessAny(user: User | null, permissions: (Permission | string)[]): boolean {
  if (!permissions?.length) return true;
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const list = normalizePermissionList(user);
  if (list.length === 0) return false;
  return permissions.some((p) => list.includes(p));
}

export function canViewBudgets(user: User | null): boolean {
  return canAccessAny(user, [P.VIEW_BUDGETS, P.MANAGE_BUDGETS]);
}

export function canManageBudgets(user: User | null): boolean {
  return canAccessAny(user, [
    P.MANAGE_BUDGETS,
    P.CREATE_BUDGETS,
    P.EDIT_BUDGETS,
    P.DELETE_BUDGETS,
  ]);
}

export function canViewExpenseCategories(user: User | null): boolean {
  return canAccessAny(user, [
    P.VIEW_EXPENSE_CATEGORIES,
    P.MANAGE_EXPENSE_CATEGORIES,
    P.CREATE_EXPENSE_CATEGORIES,
  ]);
}

export function canCreateExpenseCategories(user: User | null): boolean {
  return canAccessAny(user, [P.CREATE_EXPENSE_CATEGORIES, P.MANAGE_EXPENSE_CATEGORIES]);
}

export function canManageExpenseCategories(user: User | null): boolean {
  return canAccess(user, P.MANAGE_EXPENSE_CATEGORIES);
}

export function canViewExpenses(user: User | null): boolean {
  return canAccess(user, P.VIEW_EXPENSES);
}

export function canCreateExpenses(user: User | null): boolean {
  return canAccess(user, P.CREATE_EXPENSES);
}

export function canEditExpenses(user: User | null): boolean {
  return canAccessAny(user, [P.EDIT_EXPENSES, P.CREATE_EXPENSES]);
}

export function canDeleteExpenses(user: User | null): boolean {
  return canAccess(user, P.DELETE_EXPENSES);
}

export function canApproveExpenses(user: User | null): boolean {
  return canAccess(user, P.APPROVE_EXPENSES);
}