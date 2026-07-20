import { useMemo, useState, useEffect } from "react";
import { Briefcase, Coffee, Clock } from "lucide-react";
import { motion } from "framer-motion";
import {
  breakStart,
  breakEnd,
  computeBreakSeconds,
  currentBreakSeconds,
  formatDurationHMS,
} from "../utils/breakTime";
import { syncElectronBreakState } from "../utils/electronBreakSync";

export default function WorkdayStatusBar({
  isCheckedIn = false,
  isCheckedOut = false,
  hasActiveBreak = false,
  breaks = [],
  variant = "default",
}) {
  const [tick, setTick] = useState(0);

  const onBreak = useMemo(() => {
    if (hasActiveBreak) return true;
    return (
      Array.isArray(breaks) &&
      breaks.some((b) => breakStart(b) && !breakEnd(b))
    );
  }, [hasActiveBreak, breaks]);

  useEffect(() => {
    syncElectronBreakState(onBreak);
  }, [onBreak]);

  useEffect(() => {
    if (!isCheckedIn && !isCheckedOut) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isCheckedIn, isCheckedOut]);

  const totalBreakSec = useMemo(
    () => computeBreakSeconds(breaks, Date.now()),
    [breaks, tick]
  );

  const thisBreakSec = useMemo(
    () => (onBreak ? currentBreakSeconds(breaks, Date.now()) : 0),
    [breaks, onBreak, tick]
  );

  const working = isCheckedIn && !isCheckedOut && !onBreak;
  const compact = variant === "compact";

  if (!isCheckedIn && !isCheckedOut) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass-workday-bar mx-3 mb-0 mt-2 shrink-0 rounded-2xl px-4 backdrop-blur-xl sm:mx-4 lg:mx-6 ${
          compact ? "py-2 text-xs" : "py-2.5 text-sm"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-glass-subtle" />
          Not clocked in today — punch in from the dashboard to record work and
          breaks.
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-workday-bar mx-3 mt-2 shrink-0 rounded-2xl px-4 backdrop-blur-xl sm:mx-4 lg:mx-6 ${
        compact ? "py-2" : "py-3 sm:px-5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          <span className="inline-flex items-center gap-2 font-semibold theme-text">
            {working && (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0a84ff]/20 text-[#64d2ff]">
                  <Briefcase className="h-4 w-4" />
                </span>
                Working
              </>
            )}
            {onBreak && (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ff9f0a]/20 text-[#ffd60a]">
                  <Coffee className="h-4 w-4" />
                </span>
                On break
              </>
            )}
            {isCheckedOut && (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-glass-muted">
                  <Clock className="h-4 w-4" />
                </span>
                Finished for today
              </>
            )}
          </span>

          <span className="hidden text-glass-subtle sm:inline">|</span>

          <span className="inline-flex items-center gap-2 text-glass-muted">
            <span className="font-medium">Break today</span>
            <span className="font-semibold tabular-nums theme-text">
              {formatDurationHMS(totalBreakSec)}
            </span>
          </span>

          {onBreak && (
            <>
              <span className="hidden text-glass-subtle md:inline">|</span>
              <span className="inline-flex items-center gap-2 text-[#ffd60a]">
                <span className="font-medium">This break</span>
                <span className="font-bold tabular-nums">
                  {formatDurationHMS(thisBreakSec)}
                </span>
              </span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
