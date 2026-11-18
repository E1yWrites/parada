import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expoConfig = require("eslint-config-expo/flat");

export default [
  { ignores: ["dist/**", ".expo/**", "*.config.js", "*.config.mjs", "jest.setup.ts"] },
  ...expoConfig,
  {
    // Node CLI helpers run outside the app bundle.
    files: ["scripts/**/*.js"],
    languageOptions: { globals: { __dirname: "readonly", require: "readonly", module: "writable", process: "readonly", console: "readonly" } },
  },
  {
    files: ["__tests__/**/*", "**/*.test.ts", "**/*.test.tsx"],
    languageOptions: { globals: { jest: "readonly", process: "readonly", describe: "readonly", it: "readonly", expect: "readonly", beforeEach: "readonly", afterEach: "readonly", beforeAll: "readonly", afterAll: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
