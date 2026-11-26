import type { Config } from "tailwindcss";

/**
 * PARADA admin design tokens — a monochrome console (zinc graphite / white)
 * with the logo's orange reserved for live data and the one filled action. Every color resolves through a CSS custom
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
        control: withOpacity("--control-border"),
        brand: {
          DEFAULT: withOpacity("--brand"),
          dark: withOpacity("--brand-dark"),
          soft: withOpacity("--brand-soft"),
          /** Text/icon-safe brand (>=4.5:1 on card, paper and brand-soft). */
          ink: withOpacity("--brand-ink"),
          hover: withOpacity("--brand-hover"),
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
      /* Type ramp. Arbitrary text-[Npx] sizes are not allowed; a test fails on them. */
      fontSize: {
        micro: ["11px", { lineHeight: "16px" }],
        display: ["48px", { lineHeight: "1" }],
      },
      fontFamily: {
        /* One UI face: headings and figures are Inter at heavier weights. */
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        /* Theme-aware: defined per theme in globals.css (no black shadows on light paper). */
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        primary: "0 8px 20px -8px rgb(var(--brand) / 0.55)",
        /* Solid ring with a paper-coloured gap: >=3:1 against card and paper
           in both themes (was a 35% brand wash at 2.0:1 dark, 1.33:1 light). */
        focus: "0 0 0 2px rgb(var(--paper)), 0 0 0 4px rgb(var(--focus))",
      },
      borderRadius: {
        panel: "1rem",
        control: "0.6875rem",
        chip: "0.4375rem",
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
        "lottie-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        // Realtime arrival: swings in on a shallow arc (right + above), overshoots, settles.
        "toast-in": {
          "0%": { opacity: "0", transform: "translate3d(28px,-10px,0) rotate(1.5deg) scale(0.96)" },
          "60%": { opacity: "1", transform: "translate3d(-3px,1px,0) rotate(-0.4deg) scale(1.005)" },
          "100%": { opacity: "1", transform: "none" },
        },
        // Exit is faster than entry and goes back the way it came.
        "toast-out": {
          to: { opacity: "0", transform: "translate3d(32px,0,0) scale(0.97)" },
        },
        // Wind-up (tilts back), swing, decaying follow-through.
        "bell-ring": {
          "0%, 100%": { transform: "rotate(0)" },
          "12%": { transform: "rotate(-10deg)" },
          "30%": { transform: "rotate(16deg)" },
          "48%": { transform: "rotate(-10deg)" },
          "64%": { transform: "rotate(6deg)" },
          "80%": { transform: "rotate(-2deg)" },
        },
        // Squash and stretch: lands wide and flat, rebounds tall, settles.
        "badge-pop": {
          "0%": { transform: "scale(0.4)" },
          "45%": { transform: "scale(1.25,0.82)" },
          "70%": { transform: "scale(0.92,1.1)" },
          "100%": { transform: "scale(1)" },
        },
        "settle-in": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.9)" },
          "60%": { opacity: "1", transform: "translateY(-2px) scale(1.03)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "gate-in": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "70%": { opacity: "1", transform: "translateX(2px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "gate-out": {
          "0%": { opacity: "0", transform: "translateX(8px)" },
          "70%": { opacity: "1", transform: "translateX(-2px)" },
          "100%": { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "saved-fade": "saved-fade 3.2s ease-out both",
        "lottie-float": "lottie-float 4.8s ease-in-out infinite",
        "toast-in": "toast-in 0.42s cubic-bezier(0.16, 1, 0.3, 1) both",
        "toast-out": "toast-out 0.16s cubic-bezier(0.4, 0, 1, 1) both",
        "bell-ring": "bell-ring 0.7s ease-in-out both",
        "badge-pop": "badge-pop 0.42s cubic-bezier(0.16, 1, 0.3, 1) both",
        "settle-in": "settle-in 0.48s cubic-bezier(0.16, 1, 0.3, 1) both",
        "gate-in": "gate-in 0.26s cubic-bezier(0.16, 1, 0.3, 1) both",
        "gate-out": "gate-out 0.26s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
