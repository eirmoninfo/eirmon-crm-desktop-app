import { useId, useState } from "react";
import {
  ERIMON_LOGO_SRC,
  ERIMON_LOGO_FALLBACK_SRC,
} from "../utils/appBrand";

export { ERIMON_LOGO_SRC };

/**
 * Brand mark: `public/eirmon_ai_logo.png` → `public/logo.png` → inline SVG.
 */
export default function ErimonLogo({
  className = "",
  size = 40,
  "aria-label": ariaLabel = "Erimon CRM",
}) {
  const [src, setSrc] = useState(ERIMON_LOGO_SRC);
  const [useFallback, setUseFallback] = useState(false);
  const gid = useId().replace(/:/g, "");

  if (!useFallback) {
    return (
      <img
        src={src}
        alt={ariaLabel}
        width={size}
        height={size}
        className={`shrink-0 rounded-xl object-contain shadow-sm ring-1 ring-black/5 ${className}`}
        onError={() => {
          if (src !== ERIMON_LOGO_FALLBACK_SRC) {
            setSrc(ERIMON_LOGO_FALLBACK_SRC);
            return;
          }
          setUseFallback(true);
        }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`shrink-0 rounded-xl shadow-sm ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient
          id={`erimon-grad-${gid}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      <rect
        width="40"
        height="40"
        rx="10"
        fill={`url(#erimon-grad-${gid})`}
      />
      <path
        d="M10 11h20v2.5H10V11zm0 7.25h14v2.5H10v-2.5zm0 7.25h20v2.5H10v-2.5z"
        fill="#ffffff"
        opacity="0.95"
      />
    </svg>
  );
}

/** Small logo for react-hot-toast and inline notification affordances. */
export function ToastLogoIcon({ className = "h-5 w-5 rounded-md object-contain" }) {
  return (
    <img
      src={ERIMON_LOGO_SRC}
      alt=""
      className={className}
      aria-hidden
      onError={(e) => {
        if (e.currentTarget.src !== ERIMON_LOGO_FALLBACK_SRC) {
          e.currentTarget.src = ERIMON_LOGO_FALLBACK_SRC;
        }
      }}
    />
  );
}
