import { useCallback, useEffect, useRef, useState } from "react";
import { loadLocalWeather } from "../utils/weather";

const REFRESH_MS = 20 * 60 * 1000;

export default function useWeather() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    temperature: null,
    unit: "°C",
    condition: null,
    kind: "cloud",
    city: null,
    humidity: null,
    windKmh: null,
    source: null,
  });

  const mounted = useRef(true);

  const refresh = useCallback(async (force = false) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await loadLocalWeather({ force });
      if (!mounted.current) return;
      setState({
        loading: false,
        error: null,
        temperature: data.temperature,
        unit: data.unit,
        condition: data.condition,
        kind: data.kind,
        city: data.city,
        humidity: data.humidity,
        windKmh: data.windKmh,
        source: data.source,
      });
    } catch (err) {
      if (!mounted.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Weather unavailable",
      }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh(false);
    const id = setInterval(() => refresh(true), REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  return { ...state, refresh };
}
