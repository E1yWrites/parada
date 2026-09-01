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
        void: "#030304",
        surface: "#0F1115",
        foreground: "#FFFFFF",
        muted: "#94A3B8",
        line: "#1E293B",
        orange: "#F7931A",
        "burnt-orange": "#EA580C",
        gold: "#FFD600",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      backgroundImage: {
        "primary-gradient": "linear-gradient(135deg, #EA580C 0%, #F7931A 100%)",
      },
      boxShadow: {
        "glow-orange": "0 0 20px -5px rgba(234,88,12,0.5)",
        "glow-gold": "0 0 20px rgba(255,214,0,0.3)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
