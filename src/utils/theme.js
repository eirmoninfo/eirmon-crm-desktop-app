export const THEME_STORAGE_KEY = "erimon.theme";

export const THEMES = {
  dark: "dark",
  light: "light",
};

export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === THEMES.light || stored === THEMES.dark) return stored;
  } catch {
    /* ignore */
  }
  return THEMES.dark;
}

export function applyTheme(theme) {
  const next = theme === THEMES.light ? THEMES.light : THEMES.dark;
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}

export function initTheme() {
  return applyTheme(getStoredTheme());
}
