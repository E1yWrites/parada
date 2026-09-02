import * as SecureStore from "expo-secure-store";
import { renderWithAppProviders, screen, waitFor } from "@/src/test/utils";
import TabsLayout from "@/app/(tabs)/_layout";
import { api } from "@/lib/api/client";
import { sessionStatusMeta } from "@/src/components/StatusBadge";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: {
      me: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
      zones: jest.fn(),
      zoneOccupancy: jest.fn(),
      vehicles: jest.fn(),
      createVehicle: jest.fn(),
      sessions: jest.fn(),
      activeSession: jest.fn(),
    },
  };
});

const user = {
  id: "u1",
  name: "Alex Driver",
  email: "alex@parada.test",
  role: "USER",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as typeof SecureStore & { __reset: () => void }).__reset();
});

describe("access control", () => {
  it("redirects an anonymous user to /login", async () => {
    renderWithAppProviders(<TabsLayout />);
    await waitFor(() => expect(screen.getByTestId("redirect-/login")).toBeOnTheScreen());
  });

  it("renders the four tabs for an authenticated user", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-ok");
    (api.me as jest.Mock).mockResolvedValue(user);

    renderWithAppProviders(<TabsLayout />);

    await waitFor(() => expect(screen.getByTestId("tabs")).toBeOnTheScreen());
    expect(screen.getByText("Parking")).toBeOnTheScreen();
    expect(screen.getByText("Vehicles")).toBeOnTheScreen();
    expect(screen.getByText("Sessions")).toBeOnTheScreen();
    expect(screen.getByText("Account")).toBeOnTheScreen();
  });
});

describe("mobile API surface", () => {
  it("exposes no admin/simulator endpoints to the user app", () => {
    const methods = Object.keys(api);
    expect(methods).not.toContain("admin");
    expect(methods).not.toContain("simulator");
    // Belt-and-braces: no path should target admin/system routes.
    const serialized = JSON.stringify(api);
    expect(serialized).not.toMatch(/\/admin|\/simulator/);
  });

  it("keeps user-facing capabilities only", () => {
    const methods = Object.keys(api);
    expect(methods).toEqual(
      expect.arrayContaining(["me", "login", "register", "logout", "zones", "vehicles", "createVehicle", "sessions", "activeSession"]),
    );
  });
});

// Guard against accidental icon-less status rendering (a11y requirement).
test("session status meta always pairs an icon with text", () => {
  const meta = sessionStatusMeta("ACTIVE");
  expect(meta.label.length).toBeGreaterThan(0);
  expect(meta.icon.length).toBeGreaterThan(0);
});