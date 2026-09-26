import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import AccountScreen from "@/app/(tabs)/account";
import { api, ApiError, type UserDto } from "@/lib/api/client";
import { touchTarget } from "@/src/theme";

function flattenStyle(style: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.assign(out, value);
    }
  };
  visit(style);
  return out;
}

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
      notifications: jest.fn(),
      violations: jest.fn(),
    },
  };
});

const user: UserDto = {
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

const admin: UserDto = { ...user, id: "u2", name: "Ari Admin", role: "ADMIN" };

const networkError = new ApiError("NETWORK", "Cannot reach the PARADA server.", 0);

// Mock the session context so the screen's own /auth/me query is the only
// consumer of api.me (deterministic call counts), while still exercising the
// cached-identity degradation the way a real provider would provide `user`.
const mockSessionContext = {
  user: user as UserDto | null,
  isLoading: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn().mockResolvedValue(undefined),
};

jest.mock("@/src/providers/SessionProvider", () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: () => mockSessionContext,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionContext.user = user;
  (api.me as jest.Mock).mockResolvedValue(user);
  (api.notifications as jest.Mock).mockResolvedValue({ notifications: [], unreadCount: 0 });
});

describe("account screen", () => {
  it("renders the profile from /auth/me", async () => {
    renderWithProviders(<AccountScreen />);

    await waitFor(() => expect(screen.getByTestId("account-profile")).toBeOnTheScreen());
    expect(screen.getByTestId("account-name")).toHaveTextContent("Alex Driver");
    expect(screen.getByTestId("account-email")).toHaveTextContent("alex@parada.test");
    // Every driver is a driver: no static role pill, status row, sign-in row or about text.
    expect(screen.queryByTestId("account-role")).not.toBeOnTheScreen();
    expect(screen.queryByText("Active driver account")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("account-security")).not.toBeOnTheScreen();
    expect(screen.queryByText(/real time/i)).not.toBeOnTheScreen();
    // One notifications entry point: the bell on Now.
    expect(screen.queryByTestId("account-notifications")).not.toBeOnTheScreen();
    expect(screen.getByTestId("account-version")).toBeOnTheScreen();
    expect(screen.queryByTestId("account-cache-note")).not.toBeOnTheScreen();
  });

  it("labels an admin profile with the ADMIN pill", async () => {
    (api.me as jest.Mock).mockResolvedValue(admin);
    renderWithProviders(<AccountScreen />);

    await waitFor(() => expect(screen.getByTestId("account-name")).toHaveTextContent("Ari Admin"));
    expect(screen.getByTestId("account-role")).toHaveTextContent("ADMIN");
  });

  it("shows a loading state while the profile loads", async () => {
    renderWithProviders(<AccountScreen />);

    expect(screen.getByTestId("account-loading")).toBeOnTheScreen();
    await screen.findByTestId("account-profile");
  });

  it("shows a single error state with retry when the profile cannot load", async () => {
    mockSessionContext.user = null;
    (api.me as jest.Mock).mockRejectedValue(networkError);
    renderWithProviders(<AccountScreen />);

    await waitFor(() => expect(screen.getByTestId("account-error")).toBeOnTheScreen());
    expect(screen.getByText("Cannot reach the PARADA server.")).toBeOnTheScreen();
    expect(screen.getByTestId("account-error-retry")).toBeOnTheScreen();
    expect(screen.queryByTestId("logout-button")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("account-profile")).not.toBeOnTheScreen();
  });

  it("degrades to the cached identity when the profile refresh fails", async () => {
    (api.me as jest.Mock).mockRejectedValue(networkError);
    renderWithProviders(<AccountScreen />);

    await waitFor(() => expect(screen.getByTestId("account-cache-note")).toBeOnTheScreen());
    expect(screen.getByTestId("account-cache-retry")).toBeOnTheScreen();
    expect(screen.getByTestId("account-name")).toHaveTextContent("Alex Driver");
    expect(screen.getByTestId("account-email")).toHaveTextContent("alex@parada.test");
    expect(screen.getByTestId("logout-button")).toBeOnTheScreen();
    expect(screen.queryByTestId("account-error")).not.toBeOnTheScreen();
  });

  it("recovers from a refresh failure via retry", async () => {
    (api.me as jest.Mock).mockRejectedValueOnce(networkError).mockResolvedValueOnce(user);
    renderWithProviders(<AccountScreen />);

    await waitFor(() => expect(screen.getByTestId("account-cache-note")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("account-cache-retry"));

    await waitFor(() => expect(screen.queryByTestId("account-cache-note")).not.toBeOnTheScreen());
    expect(screen.getByTestId("account-name")).toHaveTextContent("Alex Driver");
  });

  it("keeps the cached-profile retry inside the 44pt touch-target baseline", async () => {
    (api.me as jest.Mock).mockRejectedValue(networkError);
    renderWithProviders(<AccountScreen />);

    await waitFor(() => expect(screen.getByTestId("account-cache-retry")).toBeOnTheScreen());
    const flat = flattenStyle(screen.getByTestId("account-cache-retry").props.style);
    expect(Number(flat.minHeight)).toBeGreaterThanOrEqual(touchTarget);
  });

  it("signs out when Sign Out is pressed", async () => {
    renderWithProviders(<AccountScreen />);

    const button = await screen.findByTestId("logout-button");
    fireEvent.press(button);

    await waitFor(() => expect(mockSessionContext.signOut).toHaveBeenCalledTimes(1));
  });
});