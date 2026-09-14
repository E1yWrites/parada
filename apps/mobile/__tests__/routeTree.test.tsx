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
import Index from "@/app/index";

jest.unmock("expo-router");
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
function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
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
  "violations/[id]": page("violations/[id]"),
  "violations/index": page("violations/index"),
  "zones/[id]": page("zones/[id]"),
};

async function renderAt(initialUrl: string) {
  renderRouter(routes, { initialUrl });
  await waitFor(() => expect(screen.queryByText(/^(PAGE|NOTFOUND):/)).toBeTruthy());
}

describe("route tree (real expo-router)", () => {
  it('resolves "/" to the parking tab instead of the generated Unmatched Route', async () => {
    await renderAt("/");
    expect(screen.getByText("PAGE:parking@/parking")).toBeTruthy();
    expect(screen.queryByText(/^NOTFOUND:/)).toBeNull();
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
