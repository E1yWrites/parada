import { FlatList, StyleSheet } from "react-native";
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
  feeAmount: null,
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
  it("spaces history cards by the list gap alone (no separator doubling it)", async () => {
    renderWithProviders(<SessionsScreen />);
    await waitFor(() => expect(screen.getByText("1 completed")).toBeOnTheScreen());
    const list = screen.UNSAFE_getByType(FlatList);
    // contentContainerStyle's gap already separates cells; a separator on top
    // of it rendered 24pt between cards instead of the 12pt design step.
    expect(list.props.ItemSeparatorComponent).toBeUndefined();
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ gap: 12 });
  });

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

  it("shows a single primary error state when loading fails", async () => {
    (api.sessions as jest.Mock).mockRejectedValue(new ApiError("BAD_GATEWAY", "Sessions unavailable.", 502));
    renderWithProviders(<SessionsScreen />);

    await waitFor(() => expect(screen.getByTestId("sessions-error")).toBeOnTheScreen());
    expect(screen.getAllByText("Sessions unavailable.")).toHaveLength(1);
    expect(screen.getByTestId("sessions-error-retry")).toBeOnTheScreen();
    expect(screen.queryByTestId("sessions-header-state")).not.toBeOnTheScreen();
  });

  it("renders GUEST identity for an account-less session", async () => {
    (api.sessions as jest.Mock).mockResolvedValue([
      session({ id: "sg", userId: null, vehicleId: null, vehicle: null }),
    ]);
    renderWithProviders(<SessionsScreen />);

    await waitFor(() => expect(screen.getByTestId("session-sg-plate")).toHaveTextContent("GUEST"));
    expect(screen.queryByText("null")).not.toBeOnTheScreen();
    expect(screen.queryByText("undefined")).not.toBeOnTheScreen();
    expect(screen.queryByText("INVALID_SESSION_RESPONSE")).not.toBeOnTheScreen();
  });

  it("shows the backend fee for a completed session", async () => {
    (api.sessions as jest.Mock).mockResolvedValue([session({ id: "sf", feeAmount: 30 })]);
    renderWithProviders(<SessionsScreen />);

    await waitFor(() => expect(screen.getByTestId("session-sf-fee")).toHaveTextContent("₱30.00"));
  });

  it("does not show a fee row when feeAmount is null", async () => {
    renderWithProviders(<SessionsScreen />);

    await waitFor(() => expect(screen.getByTestId("session-s1")).toBeOnTheScreen());
    expect(screen.queryByTestId("session-s1-fee")).not.toBeOnTheScreen();
  });
});