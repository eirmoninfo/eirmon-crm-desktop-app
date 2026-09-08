import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PartyPopper } from "lucide-react";

const COLORS = [
  "#5B8CFF",
  "#34D399",
  "#FBBF24",
  "#F472B6",
  "#A78BFA",
  "#FB7185",
  "#38BDF8",
];

function buildPieces(count) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const distance = 120 + Math.random() * 280;
    return {
      id: i,
      color: COLORS[i % COLORS.length],
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 40 - Math.random() * 80,
      rotate: (Math.random() - 0.5) * 720,
      size: 6 + Math.random() * 8,
      delay: Math.random() * 0.12,
      round: Math.random() > 0.55,
    };
  });
}

/**
 * Full-screen celebration burst after successful punch in / punch out.
 * @param {{ kind: "in" | "out" | null, onDone?: () => void }} props
 */
export default function PunchCelebration({ kind, onDone }) {
  const pieces = useMemo(() => (kind ? buildPieces(42) : []), [kind]);

  useEffect(() => {
    if (!kind) return undefined;
    const t = window.setTimeout(() => onDone?.(), 2400);
    return () => window.clearTimeout(t);
  }, [kind, onDone]);

  const title = kind === "in" ? "You're punched in!" : "Nice work today!";
  const subtitle =
    kind === "in"
      ? "Workday tracking is live. Have a productive day."
      : "Checked out successfully. Rest well — see you next shift.";

  return (
    <AnimatePresence>
      {kind ? (
        <motion.div
          className="punch-celeb"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          aria-live="polite"
        >
          <div className="punch-celeb-burst" aria-hidden>
            {pieces.map((p) => (
              <motion.span
                key={p.id}
                className={`punch-celeb-piece ${p.round ? "is-round" : ""}`}
                style={{
                  background: p.color,
                  width: p.size,
                  height: p.round ? p.size : p.size * 0.45,
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
                animate={{
                  x: p.x,
                  y: p.y,
                  opacity: [1, 1, 0],
                  scale: [0.4, 1.15, 0.85],
                  rotate: p.rotate,
                }}
                transition={{
                  duration: 1.45,
                  delay: p.delay,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            ))}
          </div>

          <motion.div
            className="punch-celeb-card"
            initial={{ scale: 0.86, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
          >
            <span className={`punch-celeb-icon ${kind === "in" ? "is-in" : "is-out"}`}>
              <PartyPopper size={22} strokeWidth={2} />
            </span>
            <h3 className="punch-celeb-title">{title}</h3>
            <p className="punch-celeb-sub">{subtitle}</p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
