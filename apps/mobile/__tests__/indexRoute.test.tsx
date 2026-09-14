import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react-native";
import Index from "@/app/index";

const appDir = path.join(__dirname, "..", "app");

describe("root route (/)", () => {
  it("redirects the root path to the parking tab (auth gating stays in (tabs)/_layout)", () => {
    render(<Index />);
    expect(screen.getByTestId("redirect-/(tabs)/parking")).toBeTruthy();
  });

  it("has exactly one entry route: app/index.tsx, and no index inside the (tabs) group", () => {
    // Without a root `index` route, Expo Router resolves "/" to its generated
    // `+not-found` route ("Unmatched Route") — the SDK 57 Expo Go launch path.
    expect(fs.existsSync(path.join(appDir, "index.tsx"))).toBe(true);
    const rootIndexes = fs.readdirSync(appDir).filter((f) => /^index\.[jt]sx?$/.test(f));
    expect(rootIndexes).toEqual(["index.tsx"]);
    const tabsIndexes = fs.readdirSync(path.join(appDir, "(tabs)")).filter((f) => /^index\.[jt]sx?$/.test(f));
    expect(tabsIndexes).toEqual([]);
  });
});

describe("custom entry (index.js)", () => {
  it("imports @expo/metro-runtime before anything else, like expo-router/entry", () => {
    // The runtime installs the `window.location` polyfill that expo-router's
    // dev views (Sitemap / Unmatched Route) dereference; skipping it crashes
    // with "Cannot read property 'origin' of undefined" inside Expo Go.
    const entry = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
    const imports = entry.split("\n").filter((line) => /^import\b/.test(line));
    expect(imports[0]).toBe('import "@expo/metro-runtime";');
  });
});
