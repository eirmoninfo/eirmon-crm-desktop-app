import "../../assets/styles/auth.css";
import EirmonLogo from "../EirmonLogo";
import ThemeToggle from "../ThemeToggle";
import { FaBolt, FaCheck, FaLock } from "react-icons/fa";

export default function AuthLayout({ children }) {
  return (
    <div className="auth-shell">
      <div className="auth-theme-toggle-wrap">
        <ThemeToggle compact />
      </div>
      <div className="auth-shell-glow auth-shell-glow-a" aria-hidden />
      <div className="auth-shell-glow auth-shell-glow-b" aria-hidden />
      <aside className="auth-brand-panel" aria-label="Product overview">
        <div className="auth-brand-panel-inner">
          <header className="auth-brand-header">
            <div className="auth-brand-header-logo">
              <EirmonLogo size={44} />
            </div>
            <div className="auth-brand-header-text">
              <div className="auth-brand-header-title">Eirmon Solutions</div>
              <p className="auth-brand-header-sub">Work smarter together</p>
            </div>
          </header>

          <div className="auth-brand-body">
            <h1 className="auth-brand-hero-title">
              Sign in to{" "}
              <span className="auth-brand-hero-accent">Eirmon CRM</span>
            </h1>
            <p className="auth-brand-hero-text">
              Your central workspace for projects, attendance, budgets, and team
              coordination.
            </p>
            <ul className="auth-feature-list">
              <li>
                <span className="auth-feature-icon" aria-hidden={true}>
                  <FaCheck />
                </span>
                <span>Role-based access &amp; activity you can trust</span>
              </li>
              <li>
                <span className="auth-feature-icon" aria-hidden={true}>
                  <FaLock />
                </span>
                <span>Encrypted sessions &amp; secure sign-in</span>
              </li>
              <li>
                <span className="auth-feature-icon" aria-hidden={true}>
                  <FaBolt />
                </span>
                <span>Built for fast, focused daily workflows</span>
              </li>
            </ul>
          </div>

          <footer className="auth-brand-footer">
            © {new Date().getFullYear()} Eirmon Solutions. All rights reserved.
          </footer>
        </div>
      </aside>

      <div className="auth-form-panel">{children}</div>
    </div>
  );
}
