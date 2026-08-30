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
        brand: {
          50: "#eef4ff",
          100: "#dce7fd",
          500: "#2456d6",
          600: "#1e46b3",
          700: "#1a3c99",
        },
      },
    },
  },
  plugins: [],
};

export default config;
