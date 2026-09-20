import { renderWithProviders, screen, waitFor } from "@/src/test/utils";
import ParkingScreen from "@/app/(tabs)/parking";
import { api, ApiError, type SessionDto } from "@/lib/api/client";

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
      recommendedZone: jest.fn(),
      assignments: jest.fn(),
      createAssignment: jest.fn(),
      reservations: jest.fn(),
      createReservation: jest.fn(),
      cancelReservation: jest.fn(),
      notifications: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
    },
  };
});

const SESSION_START_ISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const activeSession: SessionDto = {
  id: "s1",
  zoneId: "z1",
  userId: "u1",
  vehicleId: "v1",
  entryEventId: "e1",
  exitEventId: null,
  enteredAt: SESSION_START_ISO,
  exitedAt: null,
  durationSeconds: null,
  feeAmount: null,
  status: "ACTIVE",
  zone: { id: "z1", name: "Zone A", code: "A" },
  vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
  entryEvent: { id: "e1", detectedAt: SESSION_START_ISO },
  exitEvent: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.zones as jest.Mock).mockResolvedValue([]);
  (api.activeSession as jest.Mock).mockResolvedValue(null);
  (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
  (api.assignments as jest.Mock).mockResolvedValue([]);
  (api.reservations as jest.Mock).mockResolvedValue([]);
  (api.vehicles as jest.Mock).mockResolvedValue([]);
});

describe("home screen: active session banner", () => {
  it("shows plate, zone and elapsed time when a session is active", async () => {
    (api.activeSession as jest.Mock).mockResolvedValue(activeSession);
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("active-banner")).toBeOnTheScreen());
    expect(screen.getByTestId("active-banner-zone")).toHaveTextContent("Zone A");
    expect(screen.getByTestId("active-banner-plate")).toHaveTextContent("ABC-1234");
    expect(screen.getByTestId("active-banner-elapsed")).toHaveTextContent(/[0-9]+m/);
  });

  it("shows a friendly error without exposing technical details", async () => {
    (api.activeSession as jest.Mock).mockRejectedValue(
      new ApiError("INVALID_SESSION_RESPONSE", "We couldn't load your parking session.", 502),
    );
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("active-session-error")).toBeOnTheScreen());
    expect(screen.getByText("We couldn't load your parking session.")).toBeOnTheScreen();
    expect(screen.queryByText(/502|INVALID_SESSION_RESPONSE|server returned/i)).not.toBeOnTheScreen();
    const retry = screen.getByTestId("active-session-error-retry");
    expect(retry.props.accessibilityRole).toBe("button");
  });

  it("omits the banner when there is no active session", async () => {
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("parking-screen-title")).toBeOnTheScreen());
    expect(screen.queryByTestId("active-banner")).not.toBeOnTheScreen();
  });
});
