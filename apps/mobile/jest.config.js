/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Expo SDK packages stay in apps/mobile/node_modules (React 18/19 conflict
  // prevents hoisting), while several peer packages are hoisted to the repo
  // root. Resolve from the workspace first so those peers find the SDK.
  moduleDirectories: ["<rootDir>/node_modules", "node_modules"],
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|@sentry/react-native|native-base|react-native-svg|@react-navigation/.*|react-navigation)",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};