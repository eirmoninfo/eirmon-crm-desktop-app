import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  Sun,
} from "lucide-react";
import useWeather from "../hooks/useWeather";

const ICONS = {
  clear: Sun,
  partly: CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

const ICON_COLORS = {
  clear: "text-[#ffd60a]",
  partly: "text-[#ffd60a]",
  cloud: "text-glass-muted",
  fog: "text-glass-muted",
  rain: "text-[#64d2ff]",
  snow: "text-[#bfdbfe]",
  storm: "text-[#ff9f0a]",
};

export default function WeatherPill({ className = "" }) {
  const weather = useWeather();
  const Icon = ICONS[weather.kind] || Cloud;
  const iconColor = ICON_COLORS[weather.kind] || "text-glass-muted";

  const title = weather.loading
    ? "Detecting your location…"
    : weather.error
      ? weather.error
      : [
          weather.city,
          weather.condition,
          weather.humidity != null ? `${weather.humidity}% humidity` : null,
          weather.windKmh != null ? `${Math.round(weather.windKmh)} km/h wind` : null,
          weather.source === "gps" ? "GPS location" : "Approx. location",
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <button
      type="button"
      onClick={() => weather.refresh(true)}
      className={`glass-pill hidden cursor-pointer transition hover:bg-white/10 sm:inline-flex ${className}`}
      title={title}
      aria-label={title}
    >
      {weather.loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-glass-muted" />
      ) : (
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
      )}
      <span className="tabular-nums font-medium">
        {weather.loading
          ? "…"
          : weather.error
            ? "--"
            : `${weather.temperature}${weather.unit}`}
      </span>
      {weather.city && !weather.loading && !weather.error ? (
        <span className="hidden max-w-[72px] truncate text-glass-subtle lg:inline">
          {weather.city}
        </span>
      ) : null}
    </button>
  );
}
