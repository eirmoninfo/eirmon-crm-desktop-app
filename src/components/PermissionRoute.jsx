import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getCurrentUser } from "../api/auth.api";
import { canAccessAny, getUserPayload } from "../utils/permissions";
import { LoadingScreen } from "./glass/Glass";

/**
 * Requires the logged-in user to have at least one permission in `anyOf`.
 * Pass `anyOf={[]}` to only require authentication (same as ProtectedRoute).
 */
export default function PermissionRoute({ children, anyOf = [] }) {
  const [state, setState] = useState({
    loading: true,
    allowed: false,
    authFailed: false,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!anyOf.length) {
        setState({ loading: false, allowed: true, authFailed: false });
        return;
      }

      const r = await getCurrentUser();
      if (cancelled) return;

      if (!r.success) {
        setState({ loading: false, allowed: false, authFailed: true });
        return;
      }

      const user = getUserPayload(r.data);
      const allowed = canAccessAny(user, anyOf);
      setState({ loading: false, allowed, authFailed: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(anyOf)]);

  if (state.loading) {
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
