import type { Config } from "tailwindcss";

/**
 * PARADA admin design tokens — the "gate control" world: near-black asphalt
 * ground with PARADA orange as the single brand accent, echoing the logo's
 * black/orange cut geometry. Every color resolves through a CSS custom
 * property so `[data-theme]` on `<html>` retunes the whole app; the RGB
 * "channel" values (`--paper: 245 242 236`) let Tailwind's opacity modifiers
 * (`bg-brand/10`) keep working, since `rgb(var(--x) / <alpha-value>)` is the
 * only color function Tailwind can vary opacity on at build time.
 */
const withOpacity = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: withOpacity("--paper"),
        card: withOpacity("--card"),
        surface: withOpacity("--card"),
        raised: withOpacity("--raised"),
        raised2: withOpacity("--raised2"),
        charcoal: withOpacity("--charcoal"),
        muted: withOpacity("--muted"),
        faint: withOpacity("--faint"),
        line: withOpacity("--line"),
        "line-strong": withOpacity("--line-strong"),
        brand: {
          DEFAULT: withOpacity("--brand"),
          dark: withOpacity("--brand-dark"),
          soft: withOpacity("--brand-soft"),
        },
        success: {
          DEFAULT: withOpacity("--success"),
          soft: withOpacity("--success-soft"),
        },
        warning: {
          DEFAULT: withOpacity("--warning"),
          soft: withOpacity("--warning-soft"),
        },
        danger: {
          DEFAULT: withOpacity("--danger"),
          soft: withOpacity("--danger-soft"),
        },
        info: withOpacity("--brand"),
        "on-accent": withOpacity("--on-accent"),
        "data-1": withOpacity("--data-1"),
        "data-2": withOpacity("--data-2"),
        "data-3": withOpacity("--data-3"),
        "data-4": withOpacity("--data-4"),
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 12px 32px -12px rgb(0 0 0 / 0.5), 0 1px 2px rgb(0 0 0 / 0.3)",
        "card-hover": "0 18px 44px -12px rgb(0 0 0 / 0.6), 0 1px 2px rgb(0 0 0 / 0.3)",
        primary: "0 8px 20px -8px rgb(var(--brand) / 0.55)",
        focus: "0 0 0 3px rgb(var(--brand) / 0.35)",
      },
      borderRadius: {
        panel: "1.25rem",
        "panel-cut": "0.1875rem",
        control: "0.75rem",
        "control-cut": "0.125rem",
        chip: "0.5rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "saved-fade": {
          "0%": { opacity: "0", transform: "translateX(-4px)" },
          "15%": { opacity: "1", transform: "translateX(0)" },
          "80%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "saved-fade": "saved-fade 3.2s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
