import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "test-results/**", "playwright-report/**"] },
  ...nextVitals,
  {
    files: ["__tests__/**"],
    rules: { "react/display-name": "off" },
  },
];

export default config;
