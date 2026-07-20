import { Navigate } from "react-router-dom";
import { getToken } from "../utils/storage";

export default function ProtectedRoute({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}
