"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";
type ResolvedScheme = "light" | "dark";

const STORAGE_KEY = "parada-theme";
const COOKIE_KEY = "parada-theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function systemScheme(): ResolvedScheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolve(mode: ThemeMode): ResolvedScheme {
  return mode === "system" ? systemScheme() : mode;
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: ResolvedScheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * PARADA theme root. A blocking inline script in `layout.tsx`'s `<head>`
 * already set `data-theme` on `<html>` before first paint (no flash); this
 * provider takes over ownership after hydration, keeps `data-theme` in sync
 * with the OS setting when `mode === "system"`, and persists an explicit
 * choice to localStorage + a cookie (read by nothing server-side today —
 * kept only so a future SSR read can avoid the flash entirely).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [scheme, setScheme] = useState<ResolvedScheme>(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );

  useEffect(() => {
    const next = resolve(mode);
    setScheme(next);
    document.documentElement.setAttribute("data-theme", next);
  }, [mode]);

  useEffect(() => {
    if (mode !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const next = systemScheme();
      setScheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.cookie = `${COOKIE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Best-effort persistence; the in-memory selection still applies this session.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ mode, scheme, setMode }), [mode, scheme, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>.");
  }
  return ctx;
}

/** Blocking no-flash script: sets `data-theme` before first paint. Rendered once in `layout.tsx`'s `<head>`. */
export const NO_FLASH_THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("${STORAGE_KEY}");var m=(s==="light"||s==="dark"||s==="system")?s:"system";var scheme=m==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;document.documentElement.setAttribute("data-theme",scheme);}catch(e){}})();`;
