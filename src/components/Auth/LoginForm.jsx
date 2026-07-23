import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { login } from "../../api/auth.api";
import { useNavigate } from "react-router-dom";
import { getToken } from "../../utils/storage";
import { bootstrapElectron } from "../../../electron/electronBootstrap";
import EirmonLogo from "../EirmonLogo";

function errorMessage(err) {
  if (typeof err === "string") return err;
  if (err?.response?.data?.errors) {
    const first = Object.values(err.response.data.errors)[0];
    return Array.isArray(first) ? first[0] : String(first);
  }
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.message) return err.message;
  return "Login failed. Please try again.";
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login({
        email,
        password,
        device_name: "Eirmon One Desktop",
      });

      const t = getToken();
      if (t) {
        await bootstrapElectron(t);
      }
      navigate("/home");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-card-brand">
        <div className="auth-card-logo-wrap">
          <EirmonLogo size={72} className="shadow-none ring-0" />
        </div>
        <p className="auth-card-kicker">Eirmon One</p>
        <h2 className="auth-card-title">Welcome back</h2>
        <p className="auth-card-subtitle">
          Enter your credentials to access your workspace.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        {error && <div className="auth-error">{error}</div>}

        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            placeholder="you@company.com"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-password">
            Password
          </label>
          <div className="auth-password-field">
            <input
              id="auth-password"
              className="auth-input auth-input-password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        </div>

        <div className="auth-row">
          <label className="auth-remember">
            <input type="checkbox" name="remember" /> Remember me
          </label>
          <a className="auth-link-forgot" href="#forgot">
            Forgot password?
          </a>
        </div>

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in →"}
        </button>
      </form>
    </div>
  );
}
