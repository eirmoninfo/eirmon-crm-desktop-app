import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getCurrentUser } from '@/api/auth.api';
import {
  canAccessAny,
  getUserPayload,
  isSuperAdminUser,
  normalizePermissionList,
} from '@/utils/permissions';
import { LoadingScreen } from '@/components/glass/Glass';
import { useAuthStore } from '@/stores/authStore';
import type { ReactNode } from 'react';

interface PermissionRouteProps {
  children: ReactNode;
  anyOf: string[];
}

export default function PermissionRoute({ children, anyOf = [] }: PermissionRouteProps) {
  const [state, setState] = useState({
    loading: true,
    allowed: false,
    authFailed: false,
  });
  const { user, isAuthenticated, isLoading: storeLoading } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    const checkPermissions = async () => {
      if (storeLoading) return;

      if (!anyOf.length) {
        if (!cancelled) setState({ loading: false, allowed: true, authFailed: false });
        return;
      }

      if (!isAuthenticated) {
        if (!cancelled) setState({ loading: false, allowed: false, authFailed: true });
        return;
      }

      if (
        user &&
        (isSuperAdminUser(user) || normalizePermissionList(user).length > 0)
      ) {
        const userPayload = getUserPayload(user);
        if (userPayload) {
          const allowed = canAccessAny(userPayload, anyOf);
          if (!cancelled) setState({ loading: false, allowed, authFailed: false });
        } else {
          if (!cancelled) setState({ loading: false, allowed: false, authFailed: true });
        }
        return;
      }

      try {
        const r = await getCurrentUser();
        if (cancelled) return;

        if (!r.success) {
          setState({ loading: false, allowed: false, authFailed: true });
          return;
        }

        const userPayload = getUserPayload(r.data);
        if (userPayload) {
          const allowed = canAccessAny(userPayload, anyOf);
          setState({ loading: false, allowed, authFailed: false });
        } else {
          setState({ loading: false, allowed: false, authFailed: true });
        }
      } catch {
        if (!cancelled) setState({ loading: false, allowed: false, authFailed: true });
      }
    };

    checkPermissions();

    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(anyOf), isAuthenticated, user, storeLoading]);

  if (state.loading || storeLoading) {
    return <LoadingScreen label="Checking access…" />;
  }

  if (state.authFailed) {
    return <Navigate to="/login" replace />;
  }

  if (!state.allowed) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
