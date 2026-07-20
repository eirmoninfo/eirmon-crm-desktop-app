import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../Sidebar";
import Header from "../Header";
import { LoadingScreen } from "../glass/Glass";

export default function AppLayout({
  children,
  user,
  onLogout,
  loading = false,
  loadingLabel = "Loading…",
  mainClassName = "",
  showWorkdayBar = null,
  noPadding = false,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading) {
    return <LoadingScreen label={loadingLabel} />;
  }

  return (
    <div className="app-shell">
      <div className="app-shell-bg" aria-hidden />
      <div className="app-shell-glow app-shell-glow-a" aria-hidden />
      <div className="app-shell-glow app-shell-glow-b" aria-hidden />

      <Sidebar
        onLogout={onLogout}
        user={user}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.button
            type="button"
            className="app-shell-backdrop lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
        ) : null}
      </AnimatePresence>

      <div className="app-shell-main">
        <Header
          onLogout={onLogout}
          user={user}
          onMobileMenuToggle={() => setMobileNavOpen((v) => !v)}
        />

        {showWorkdayBar}

        <motion.main
          className={`app-workspace ${noPadding ? "app-workspace-flush" : ""} ${mainClassName}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 32 }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
