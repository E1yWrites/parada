import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#EEEBE3",
        card: "#FFFFFF",
        charcoal: "#171E19",
        graygreen: "#B7C6C2",
        /**
         * Muted secondary text. The palette's Gray-Green (#B7C6C2) is retained
         * for borders, dividers and decorative elements; on solid white it fails
         * color-contrast for body copy, so muted *text* uses a darker
         * gray-green derivative to stay WCAG-compliant.
         */
        muted: "#64746E",
        brand: {
          DEFAULT: "#CA0013",
          dark: "#9E0010",
          soft: "#FDEAEC",
        },
        success: "#10B981",
        warning: "#F59E0B",
        info: "#3B82F6",
        surface: "#FFFFFF",
        void: "#171E19",
        line: "#B7C6C2",
      },
      fontFamily: {
        display: ["var(--font-nunito)", "sans-serif"],
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
        mono: ["var(--font-nunito)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 20px 50px -12px rgba(0,0,0,0.08)",
        "card-hover": "0 24px 60px -12px rgba(0,0,0,0.14)",
        "nav-active": "0 10px 15px -3px rgba(202,0,19,0.4)",
        "nav-hover": "0 6px 14px -6px rgba(23,30,25,0.25)",
      },
      borderRadius: {
        card: "2.5rem",
        panel: "1.5rem",
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
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-in-out both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;