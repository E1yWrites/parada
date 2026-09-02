import { renderWithProviders, screen, waitFor } from "@/src/test/utils";
import SessionsScreen from "@/app/(tabs)/sessions";
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
    },
  };
});

const session = (over: Partial<SessionDto>): SessionDto => ({
  id: "s1",
  zoneId: "z1",
  userId: "u1",
  vehicleId: "v1",
  entryEventId: "e1",
  exitEventId: "e2",
  // Local-part timestamps so "2026-09-01 10:00" assertions hold in any TZ.
  enteredAt: new Date(2026, 8, 1, 10, 0, 0).toISOString(),
  exitedAt: new Date(2026, 8, 1, 10, 51, 0).toISOString(),
  durationSeconds: 3060,
  status: "COMPLETED",
  zone: { id: "z1", name: "Zone A", code: "A" },
  vehicle: { id: "v1", plateNumber: "XYZ-5678", vehicleType: "MOTORCYCLE" },
  entryEvent: { id: "e1", detectedAt: new Date(2026, 8, 1, 10, 0, 0).toISOString() },
  exitEvent: { id: "e2", detectedAt: new Date(2026, 8, 1, 10, 51, 0).toISOString() },
  ...over,
});

const active = session({
  id: "sa",
  exitEventId: null,
  exitedAt: null,
  durationSeconds: null,
  status: "ACTIVE",
  vehicle: { id: "v9", plateNumber: "ACT-100", vehicleType: "CAR" },
  entryEvent: { id: "ea", detectedAt: new Date(2026, 8, 1, 10, 0, 0).toISOString() },
  exitEvent: null,
});

const completed = session({});

beforeEach(() => {
  jest.clearAllMocks();
  (api.sessions as jest.Mock).mockResolvedValue([active, completed]);
});

describe("sessions screen", () => {
  it("shows the active session banner plus history", async () => {
    renderWithProviders(<SessionsScreen />);

    await waitFor(() => expect(screen.getByTestId("active-session")).toBeOnTheScreen());
    expect(screen.getByTestId("active-session-plate")).toHaveTextContent("ACT-100");
    expect(screen.getByText("History")).toBeOnTheScreen();
    expect(screen.getByText("1 completed")).toBeOnTheScreen();
    expect(screen.getByText("Completed")).toBeOnTheScreen();
  });

  it("shows completed session details (times, duration)", async () => {
    renderWithProviders(<SessionsScreen />);

    await waitFor(() => expect(screen.getByText("XYZ-5678")).toBeOnTheScreen());
    const entered = screen.getAllByText("2026-09-01 10:00");
    expect(entered.length).toBeGreaterThan(0);
    expect(screen.getByText("51m")).toBeOnTheScreen();
  });

  it("shows an empty state when there are no sessions", async () => {
    (api.sessions as jest.Mock).mockResolvedValue([]);
    renderWithProviders(<SessionsScreen />);

    expect(await screen.findByText("No parking sessions")).toBeOnTheScreen();
  });

  it("shows an error state when loading fails", async () => {
    (api.sessions as jest.Mock).mockRejectedValue(new ApiError("BAD_GATEWAY", "Sessions unavailable.", 502));
    renderWithProviders(<SessionsScreen />);

    await waitFor(() =>
      expect(screen.getAllByText("Sessions unavailable.").length).toBeGreaterThan(0),
    );
    expect(screen.getByTestId("sessions-error")).toBeOnTheScreen();
  });
});