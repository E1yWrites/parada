module.exports = {
  root: true,
  extends: "expo",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  ignorePatterns: ["dist/", ".expo/", "*.config.js", "jest.setup.ts"],
  overrides: [
    {
      files: ["__tests__/**/*", "**/*.test.ts", "**/*.test.tsx"],
      env: {
        jest: true,
      },
      globals: {
        process: "readonly",
      },
      rules: {
        "@typescript-eslint/no-require-imports": "off",
      },
    },
  ],
};