import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { palettes, type ColorScheme, type ColorTokens } from "@/src/theme/colors";
import { getShadows, type ShadowTokens } from "@/src/theme/shadows";
import { getGlass, type GlassTokens } from "@/src/theme/glass";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "parada.themeMode";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

type ThemeContextValue = {
  /** The user's stored preference — "system" follows the OS setting. */
  mode: ThemeMode;
  /** The resolved scheme actually applied ("system" collapsed to light/dark). */
  scheme: ColorScheme;
  colors: ColorTokens;
  shadows: ShadowTokens;
  glass: GlassTokens;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * PARADA theme root. Resolves System/Light/Dark against the OS setting,
 * persists the explicit choice in SecureStore (presentation preference only
 * — never written to the API/DB), and hands every consumer a live token set
 * through `useColors()` / `useThemeShadows()` / `useThemeGlass()`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (active && isThemeMode(stored)) {
          setModeState(stored);
        }
      })
      .catch(() => {
        // No stored preference (or storage unavailable) — system default stands.
      });
    return () => {
      active = false;
    };
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
      // Best-effort persistence; the in-memory selection still applies this session.
    });
  }

  // `useColorScheme()` can report `null` on first render before the native
  // module resolves. Falling to "dark" there flashed a dark UI even on
  // light-OS devices; falling to "light" instead is the safer unresolved
  // state and self-corrects the moment the OS value arrives.
  const scheme: ColorScheme = mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      colors: palettes[scheme],
      shadows: getShadows(scheme),
      glass: getGlass(scheme),
      setMode,
    }),
    [mode, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("Theme hooks must be used within <ThemeProvider>.");
  }
  return ctx;
}

/** Live color tokens for the active theme. The primary hook every themed component uses. */
export function useColors(): ColorTokens {
  return useThemeContext().colors;
}

export function useThemeShadows(): ShadowTokens {
  return useThemeContext().shadows;
}

export function useThemeGlass(): GlassTokens {
  return useThemeContext().glass;
}

/** The resolved scheme ("system" already collapsed to "light" | "dark"). */
export function useColorSchemeResolved(): ColorScheme {
  return useThemeContext().scheme;
}

/** The user's stored preference plus a setter, for the Appearance control. */
export function useThemeMode(): { mode: ThemeMode; scheme: ColorScheme; setMode: (mode: ThemeMode) => void } {
  const { mode, scheme, setMode } = useThemeContext();
  return { mode, scheme, setMode };
}
