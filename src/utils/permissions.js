import { P } from "../constants/permissions";

/**
 * @param {object | null} source  `/me` payload or `{ user: { permissions } }` or `user` from Sidebar
 */
export function normalizePermissionList(source) {
  if (!source) return [];
  const u = source.user ?? source;
  const raw = u.permissions ?? source.permissions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => (typeof p === "string" ? p : p?.name))
    .filter(Boolean);
}

export function getUserPayload(authData) {
  if (!authData) return null;
  return authData.user ?? authData;
}

export function isSuperAdminUser(user) {
  if (!user) return false;
  const u = user.user ?? user;
  const role = u.role ?? u.role_name ?? "";
  if (String(role).toLowerCase().includes("super admin")) return true;
  const roles = u.roles ?? [];
  if (Array.isArray(roles)) {
    return roles.some((r) =>
      String(typeof r === "string" ? r : r?.name ?? "")
        .toLowerCase()
        .includes("super admin")
    );
  }
  return false;
}

/**
 * Single permission (exact string match). Fail-closed when permissions are empty.
 */
export function canAccess(user, permission) {
  if (!permission) return true;
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const list = normalizePermissionList(user);
  if (list.length === 0) return false;
  return list.includes(permission);
}

/**
 * User must have at least one of the listed permissions. Fail-closed when empty.
 */
export function canAccessAny(user, permissions) {
  if (!permissions?.length) return true;
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const list = normalizePermissionList(user);
  if (list.length === 0) return false;
  return permissions.some((p) => list.includes(p));
}

/** Budgets: view list */
export function canViewBudgets(user) {
  return canAccessAny(user, [P.VIEW_BUDGETS, P.MANAGE_BUDGETS]);
}

/** Create / edit / delete budgets */
export function canManageBudgets(user) {
  return canAccessAny(user, [
    P.MANAGE_BUDGETS,
    P.CREATE_BUDGETS,
    P.EDIT_BUDGETS,
    P.DELETE_BUDGETS,
  ]);
}

/** Expense category list */
export function canViewExpenseCategories(user) {
  return canAccessAny(user, [
    P.VIEW_EXPENSE_CATEGORIES,
    P.MANAGE_EXPENSE_CATEGORIES,
    P.CREATE_EXPENSE_CATEGORIES,
  ]);
}

export function canCreateExpenseCategories(user) {
  return canAccessAny(user, [
    P.CREATE_EXPENSE_CATEGORIES,
    P.MANAGE_EXPENSE_CATEGORIES,
  ]);
}

export function canManageExpenseCategories(user) {
  return canAccess(user, P.MANAGE_EXPENSE_CATEGORIES);
}

export function canViewExpenses(user) {
  return canAccess(user, P.VIEW_EXPENSES);
}

export function canCreateExpenses(user) {
  return canAccess(user, P.CREATE_EXPENSES);
}

export function canEditExpenses(user) {
  return canAccessAny(user, [P.EDIT_EXPENSES, P.CREATE_EXPENSES]);
}

/** Trash, restore, permanent delete, bulk delete — not tied to create/edit */
export function canDeleteExpenses(user) {
  return canAccess(user, P.DELETE_EXPENSES);
}

export function canApproveExpenses(user) {
  return canAccess(user, P.APPROVE_EXPENSES);
}
