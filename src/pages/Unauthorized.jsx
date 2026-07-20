import { Link } from "react-router-dom";
import { FaLock } from "react-icons/fa";

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <FaLock className="text-2xl" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600">
          You don&apos;t have permission to view this page. If you think this is a
          mistake, contact your administrator.
        </p>
        <Link
          to="/home"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
