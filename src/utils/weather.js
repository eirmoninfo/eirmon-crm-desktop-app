const CACHE_KEY = "erimon.weather.v1";
const CACHE_TTL_MS = 20 * 60 * 1000;

const WMO_LABELS = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

export function weatherCodeLabel(code) {
  return WMO_LABELS[code] ?? "Cloudy";
}

/** @returns {'clear'|'partly'|'cloud'|'fog'|'rain'|'snow'|'storm'} */
export function weatherCodeKind(code) {
  const c = Number(code);
  if (c === 0) return "clear";
  if (c >= 1 && c <= 3) return c === 3 ? "cloud" : "partly";
  if (c === 45 || c === 48) return "fog";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  if (c >= 71 && c <= 77) return "snow";
  if (c >= 95) return "storm";
  return "cloud";
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), data })
    );
  } catch {
    /* ignore quota */
  }
}

function getBrowserPosition(options = {}) {
  const { timeout = 12000, maximumAge = 5 * 60 * 1000 } = options;

  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          source: "gps",
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout, maximumAge }
    );
  });
}

async function getIpPosition() {
  const res = await fetch("https://ipapi.co/json/", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("IP location unavailable");
  const data = await res.json();
  if (data?.latitude == null || data?.longitude == null) {
    throw new Error("IP location missing coordinates");
  }
  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    city:
      data.city ||
      data.region ||
      data.country_name ||
      null,
    source: "ip",
  };
}

async function resolveCoordinates() {
  try {
    return await getBrowserPosition();
  } catch {
    return getIpPosition();
  }
}

async function fetchPlaceName(latitude, longitude) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const place = data?.results?.[0];
  if (!place) return null;
  return (
    place.name ||
    place.admin1 ||
    place.country ||
    null
  );
}

async function fetchForecast(latitude, longitude) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m"
  );
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("Weather service unavailable");
  const data = await res.json();
  const current = data?.current;
  if (current?.temperature_2m == null) {
    throw new Error("Weather data incomplete");
  }

  return {
    temperature: Math.round(Number(current.temperature_2m)),
    weatherCode: Number(current.weather_code ?? 0),
    humidity: current.relative_humidity_2m ?? null,
    windKmh: current.wind_speed_10m ?? null,
    unit: "°C",
  };
}

/**
 * Load local weather: browser GPS → IP fallback → Open-Meteo forecast.
 * @returns {Promise<{ temperature: number, unit: string, weatherCode: number, condition: string, kind: string, city: string|null, humidity: number|null, windKmh: number|null, source: string }>}
 */
export async function loadLocalWeather({ force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }

  const coords = await resolveCoordinates();
  const [forecast, placeFromGeo] = await Promise.all([
    fetchForecast(coords.latitude, coords.longitude),
    coords.city
      ? Promise.resolve(coords.city)
      : fetchPlaceName(coords.latitude, coords.longitude),
  ]);

  const payload = {
    ...forecast,
    condition: weatherCodeLabel(forecast.weatherCode),
    kind: weatherCodeKind(forecast.weatherCode),
    city: placeFromGeo ?? coords.city ?? null,
    latitude: coords.latitude,
    longitude: coords.longitude,
    source: coords.source,
  };

  writeCache(payload);
  return payload;
}
