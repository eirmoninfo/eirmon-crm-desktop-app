import { motion } from "framer-motion";
import ErimonLogo from "../ErimonLogo";

export function GlassPanel({
  as: Tag = "div",
  className = "",
  hover = false,
  children,
  ...props
}) {
  const Comp = hover ? motion.div : Tag;
  const hoverProps = hover
    ? {
        whileHover: { y: -2, scale: 1.005 },
        transition: { type: "spring", stiffness: 400, damping: 28 },
      }
    : {};

  return (
    <Comp className={`glass-panel ${className}`} {...hoverProps} {...props}>
      {children}
    </Comp>
  );
}

export function GlassCard({ className = "", children, ...props }) {
  return (
    <motion.div
      className={`glass-card ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function GlassButton({
  variant = "primary",
  className = "",
  children,
  type = "button",
  ...props
}) {
  const variantClass =
    variant === "danger"
      ? "glass-btn-danger"
      : variant === "secondary"
        ? "glass-btn-secondary"
        : variant === "ghost"
          ? "glass-btn-ghost"
          : "glass-btn-primary";

  return (
    <motion.button
      type={type}
      className={`glass-btn ${variantClass} ${className}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function GlassInput({ label, className = "", id, ...props }) {
  const inputId = id || label?.toLowerCase?.().replace(/\s+/g, "-");
  return (
    <label className={`glass-field ${className}`} htmlFor={inputId}>
      {label ? <span className="glass-field-label">{label}</span> : null}
      <input id={inputId} className="glass-input" {...props} />
    </label>
  );
}

export function GlassPill({ className = "", children, active = false, ...props }) {
  return (
    <span
      className={`glass-pill ${active ? "glass-pill-active" : ""} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <motion.header
      className="page-header"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="min-w-0">
        {subtitle ? <p className="page-header-eyebrow">{subtitle}</p> : null}
        <h1 className="page-header-title">{title}</h1>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </motion.header>
  );
}

export function LoadingScreen({ label = "Loading…" }) {
  return (
    <div className="app-loading">
      <div className="app-loading-logo-wrap">
        <div className="app-loading-spinner" aria-hidden />
        <motion.div
          className="app-loading-logo-pulse"
          animate={{ scale: [1, 1.05, 1], opacity: [0.92, 1, 0.92] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ErimonLogo size={72} className="app-loading-logo" />
        </motion.div>
      </div>
      <p className="app-loading-text">{label}</p>
    </div>
  );
}
