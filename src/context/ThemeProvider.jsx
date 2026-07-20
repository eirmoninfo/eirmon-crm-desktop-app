import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { applyTheme, getStoredTheme, THEMES } from "../utils/theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => getStoredTheme());

  const setTheme = useCallback((next) => {
    const resolved = applyTheme(next);
    setThemeState(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === THEMES.dark ? THEMES.light : THEMES.dark;
    setTheme(next);
    return next;
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === THEMES.dark,
      isLight: theme === THEMES.light,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
