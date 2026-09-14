import fs from "node:fs";
import path from "node:path";
import * as SecureStore from "expo-secure-store";
import { renderWithAppProviders, screen, waitFor } from "@/src/test/utils";
import Index from "@/app/index";
import { api } from "@/lib/api/client";
import { configureOnboardingStore, isOnboardingCompleted, markOnboardingCompleted, resetOnboarding } from "@/lib/onboarding";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return { ...actual, api: { ...actual.api, me: jest.fn() } };
});

const appDir = path.join(__dirname, "..", "app");

const user = {
  id: "u1",
  name: "Alex Driver",
  email: "alex@parada.test",
  username: null,
  phone: null,
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  pendingEmail: null,
  pendingPhone: null,
  avatarUpdatedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(async () => {
  jest.clearAllMocks();
  (SecureStore as typeof SecureStore & { __reset: () => void }).__reset();
  await resetOnboarding();
});

describe("root route (/) — startup order", () => {
  it("first installation: shows a single loading state, then onboarding (not login)", async () => {
    renderWithAppProviders(<Index />);
    expect(screen.getByTestId("startup-loading")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("redirect-/onboarding")).toBeTruthy());
    expect(screen.queryByTestId("redirect-/login")).toBeNull();
    expect(screen.queryByTestId("redirect-/(tabs)/parking")).toBeNull();
  });

  it("after onboarding was completed or skipped on this installation: login", async () => {
    await markOnboardingCompleted();
    renderWithAppProviders(<Index />);
    await waitFor(() => expect(screen.getByTestId("redirect-/login")).toBeTruthy());
    expect(screen.queryByTestId("redirect-/onboarding")).toBeNull();
  });

  it("restored session: straight into the authenticated app, never through onboarding or login", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-persisted");
    (api.me as jest.Mock).mockResolvedValue(user);
    renderWithAppProviders(<Index />);
    await waitFor(() => expect(screen.getByTestId("redirect-/(tabs)/parking")).toBeTruthy());
    expect(screen.queryByTestId("redirect-/onboarding")).toBeNull();
    expect(screen.queryByTestId("redirect-/login")).toBeNull();
  });

  it("restored session wins even on a fresh installation (onboarding is not forced on signed-in users)", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-persisted");
    (api.me as jest.Mock).mockResolvedValue(user);
    expect(await isOnboardingCompleted()).toBe(false);
    renderWithAppProviders(<Index />);
    await waitFor(() => expect(screen.getByTestId("redirect-/(tabs)/parking")).toBeTruthy());
  });

  it("an unreadable onboarding marker falls back to showing onboarding rather than crashing", async () => {
    configureOnboardingStore({
      read: async () => {
        throw new Error("disk");
      },
      write: async () => undefined,
      clear: async () => undefined,
    });
    try {
      renderWithAppProviders(<Index />);
      await waitFor(() => expect(screen.getByTestId("redirect-/onboarding")).toBeTruthy());
    } finally {
      configureOnboardingStore(null);
    }
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
