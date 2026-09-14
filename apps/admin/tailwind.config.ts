import type { Config } from "tailwindcss";

/**
 * PARADA admin design tokens — the same "gate pass" world as the mobile app:
 * slate ink on a cool off-white ground, electric blue as the single brand
 * accent, one tinted family per status. Text colors reach ≥4.5:1 on white.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /** Cool off-white page ground. */
        paper: "#F4F6FB",
        /** White panel surface. */
        card: "#FFFFFF",
        surface: "#FFFFFF",
        /** Blue-tinted raised surface for tracks, chips, tiles. */
        raised: "#EEF2FA",
        /** Slate ink. */
        charcoal: "#0F1B2D",
        /** Muted slate text (5.5:1 on white). */
        muted: "#5B6B82",
        /** Hairline. */
        line: "#E3E8F1",
        brand: {
          DEFAULT: "#1E5EFF",
          dark: "#1546C9",
          soft: "#E8EFFF",
        },
        success: {
          DEFAULT: "#0B7F4F",
          soft: "#E1F6EC",
          bright: "#17B978",
        },
        warning: {
          DEFAULT: "#A35F04",
          soft: "#FFF3DB",
          bright: "#F5A524",
        },
        danger: {
          DEFAULT: "#D9342F",
          soft: "#FDE9E8",
        },
        info: "#1E5EFF",
      },
      fontFamily: {
        display: ["var(--font-nunito)", "sans-serif"],
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 8px 24px -8px rgba(15, 27, 45, 0.08), 0 1px 2px rgba(15, 27, 45, 0.04)",
        "card-hover": "0 14px 32px -10px rgba(15, 27, 45, 0.14), 0 1px 2px rgba(15, 27, 45, 0.04)",
        primary: "0 8px 18px -8px rgba(30, 94, 255, 0.55)",
        focus: "0 0 0 3px rgba(30, 94, 255, 0.25)",
      },
      borderRadius: {
        panel: "1.25rem",
        control: "0.875rem",
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
