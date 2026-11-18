// Shared flat config for the TypeScript-only workspaces (services/api,
// packages/*). apps/admin and apps/mobile have their own eslint.config.mjs,
// which ESLint finds first for files under those folders.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/src/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: globals.node },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
  { files: ["packages/database/src/seed/**"], rules: { "no-console": "off" } },
);
