import { useCallback, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "vega-theme";

function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) || "dark";
}

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function applyTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  document.body.className = theme;
  listeners.forEach((fn) => fn());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as Theme);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  return { theme, toggleTheme } as const;
}
