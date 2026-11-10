"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";
type ThemeContextValue = { theme: Theme; resolvedTheme: ResolvedTheme; setTheme: (theme: Theme) => void; mounted: boolean };

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const storageKey = "gitstreak-theme";
const systemQuery = "(prefers-color-scheme: dark)";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const value = window.localStorage.getItem(storageKey);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(systemQuery).matches ? "dark" : "light";
}

function subscribeToSystemTheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(systemQuery);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function subscribeToMount() { return () => {}; }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const systemTheme = useSyncExternalStore<ResolvedTheme>(subscribeToSystemTheme, getSystemTheme, () => "light");
  const mounted = useSyncExternalStore(subscribeToMount, () => true, () => false);
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    mounted,
    setTheme(nextTheme) {
      window.localStorage.setItem(storageKey, nextTheme);
      setThemeState(nextTheme);
    },
  }), [mounted, resolvedTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider.");
  return context;
}
