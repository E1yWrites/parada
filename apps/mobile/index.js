// `@expo/metro-runtime` MUST be the first import (same contract as
// `expo-router/entry`): it installs the `window.location` polyfill that
// expo-router's dev views (Sitemap / Unmatched Route) read, plus Fast Refresh
// and promise-rejection tracking in development.
import "@expo/metro-runtime";
import { registerRootComponent } from "expo";
import { ExpoRoot } from "expo-router";

// Custom entry point for PARADA.
//
// The default "expo-router/entry" resolves your routes through a virtual
// `expo-router/_ctx` module whose require.context is derived from
// `process.env.EXPO_ROUTER_APP_ROOT`. Inside an npm-workspaces monorepo that
// env substitution does not reach Metro's transform environment, so bundling
// fails with "First argument of require.context should be a string". Using an
// explicit `require.context("./app")` keeps route discovery deterministic in
// this workspace layout. See https://docs.expo.dev/router/reference/troubleshooting/
export function App() {
  const ctx = require.context("./app");
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
