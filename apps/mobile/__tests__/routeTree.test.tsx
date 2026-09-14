/**
 * Route-tree resolution against the REAL expo-router (the global mock in
 * jest.setup.ts is lifted for this file). Screens are stubs; the real
 * `app/index.tsx` is used so the "/" → parking redirect is exercised by the
 * actual router, not by the mock.
 */
import { Text } from "react-native";
import { Stack, Tabs, usePathname } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import { waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import Index from "@/app/index";
import { api } from "@/lib/api/client";
import { markOnboardingCompleted, resetOnboarding } from "@/lib/onboarding";
import { SessionProvider } from "@/src/providers/SessionProvider";

jest.unmock("expo-router");
jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return { ...actual, api: { ...actual.api, me: jest.fn() } };
});
jest.mock("expo-constants", () => {
  const expo = require("../app.json").expo;
  return {
    __esModule: true,
    default: { expoConfig: { ...expo, sdkVersion: "57.0.0" }, manifest: null, manifest2: null },
    ExecutionEnvironment: { StoreClient: "storeClient" },
  };
});

function page(name: string) {
  function Page() {
    return <Text>{`PAGE:${name}@${usePathname()}`}</Text>;
  }
  return Page;
}
function NotFound() {
  return <Text>{`NOTFOUND:${usePathname()}`}</Text>;
}
// The real root layout mounts SessionProvider; `app/index.tsx` reads the
// session to decide the startup redirect, so the test layout must too.
function RootLayout() {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SessionProvider>
    </QueryClientProvider>
  );
}
function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false }} />;
}

const routes = {
  _layout: RootLayout,
  index: Index,
  "+not-found": NotFound,
  "(tabs)/_layout": TabsLayout,
  "(tabs)/account": page("account"),
  "(tabs)/parking": page("parking"),
  "(tabs)/sessions": page("sessions"),
  "(tabs)/vehicles": page("vehicles"),
  login: page("login"),
  notifications: page("notifications"),
  onboarding: page("onboarding"),
  register: page("register"),
  "verify-email": page("verify-email"),
  "forgot-password": page("forgot-password"),
  "reset-password": page("reset-password"),
  "account/profile": page("account/profile"),
  "account/password": page("account/password"),
  "vehicles/[id]": page("vehicles/[id]"),
  "violations/[id]": page("violations/[id]"),
  "violations/index": page("violations/index"),
  "zones/[id]": page("zones/[id]"),
};

async function renderAt(initialUrl: string) {
  renderRouter(routes, { initialUrl });
  await waitFor(() => expect(screen.queryByText(/^(PAGE|NOTFOUND):/)).toBeTruthy());
}

beforeEach(async () => {
  jest.clearAllMocks();
  (SecureStore as typeof SecureStore & { __reset: () => void }).__reset();
  await resetOnboarding();
});

describe("route tree (real expo-router)", () => {
  it('resolves "/" on a first installation to onboarding instead of the generated Unmatched Route', async () => {
    await renderAt("/");
    expect(screen.getByText("PAGE:onboarding@/onboarding")).toBeTruthy();
    expect(screen.queryByText(/^NOTFOUND:/)).toBeNull();
  });

  it('resolves "/" to login once onboarding was completed on this installation', async () => {
    await markOnboardingCompleted();
    await renderAt("/");
    expect(screen.getByText("PAGE:login@/login")).toBeTruthy();
  });

  it('resolves "/" to the parking tab for a restored session (no onboarding, no login)', async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-persisted");
    (api.me as jest.Mock).mockResolvedValue({
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
    });
    await renderAt("/");
    expect(screen.getByText("PAGE:parking@/parking")).toBeTruthy();
  });

  it("resolves the password-reset deep link (parada://reset-password?token=…) to the reset screen", async () => {
    await renderAt("/reset-password?token=abc");
    expect(screen.getByText("PAGE:reset-password@/reset-password")).toBeTruthy();
  });

  it("still resolves the other entry points directly", async () => {
    await renderAt("/login");
    expect(screen.getByText("PAGE:login@/login")).toBeTruthy();
    screen.unmount();

    await renderAt("/zones/z1");
    expect(screen.getByText("PAGE:zones/[id]@/zones/z1")).toBeTruthy();
  });

  it("keeps unknown paths on the not-found route (no accidental catch-all)", async () => {
    await renderAt("/definitely-not-a-route");
    expect(screen.getByText("NOTFOUND:/definitely-not-a-route")).toBeTruthy();
  });
});
