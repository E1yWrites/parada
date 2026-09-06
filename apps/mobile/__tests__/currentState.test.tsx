import { Linking } from "react-native";
import * as LocationMock from "expo-location";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import ParkingScreen from "@/app/(tabs)/parking";
import { CurrentParkingState } from "@/src/components/CurrentParkingState";
import { api, ApiError, type SessionDto, type PublicZone } from "@/lib/api/client";
import type { NavigationDestination } from "@/lib/navigation";
import type { ReservationResponse, Vehicle, ZoneAssignmentResponse } from "@parada/types";

type LocationModule = typeof LocationMock & {
  __reset: () => void;
  __setPermission: (result: { granted: boolean; canAskAgain: boolean; status?: string }) => void;
  __rejectPermission: (err: unknown) => void;
  __setPosition: (coords: { latitude: number; longitude: number }) => void;
  __rejectPosition: (err: unknown) => void;
};

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
      establishment: jest.fn(),
    },
  };
});

const STARTED = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const zones: PublicZone[] = [
  {
    id: "z1",
    name: "Zone A",
    code: "A",
    description: null,
    capacity: 20,
    occupiedCount: 10,
    availableCount: 10,
    status: "ACTIVE",
    availability: "AVAILABLE",
  },
];

const session: SessionDto = {
  id: "s1",
  zoneId: "z1",
  userId: "u1",
  vehicleId: "v1",
  entryEventId: "e1",
  exitEventId: null,
  enteredAt: STARTED,
  exitedAt: null,
  durationSeconds: null,
  feeAmount: null,
  status: "ACTIVE",
  zone: { id: "z1", name: "Zone A", code: "A" },
  vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
  entryEvent: { id: "e1", detectedAt: STARTED },
  exitEvent: null,
};

const assignment: ZoneAssignmentResponse = {
  id: "a1",
  userId: "u1",
  vehicleId: "v1",
  zoneId: "z2",
  status: "ACTIVE",
  assignedAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 60_000).toISOString(),
  zone: { id: "z2", name: "Zone B", code: "B" },
  vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
};

const reservation: ReservationResponse = {
  id: "r1",
  userId: "u1",
  vehicleId: "v1",
  zoneId: "z2",
  startAt: new Date(Date.now() - 60_000).toISOString(),
  endAt: new Date(Date.now() + 60_000).toISOString(),
  status: "CONFIRMED",
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 60_000).toISOString(),
  zone: { id: "z2", name: "Zone B", code: "B" },
  vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
};

const destination: NavigationDestination = {
  label: "123 Test Ave",
  latitude: 14.5502,
  longitude: 121.0402,
};

const vehicle: Vehicle = {
  id: "v1",
  userId: "u1",
  plateNumber: "ABC-1234",
  normalizedPlate: "ABC1234",
  vehicleType: "CAR",
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

type Overrides = Partial<
  React.ComponentProps<typeof CurrentParkingState>
>;

function renderState(overrides: Overrides = {}) {
  const props: React.ComponentProps<typeof CurrentParkingState> = {
    session: null,
    assignment: null,
    reservation: null,
    destination: null,
    destinationReady: false,
    now: new Date(),
    activePending: false,
    activeError: false,
    activeErrorMessage: null,
    statePending: false,
    assignmentError: false,
    reservationError: false,
    onRetry: jest.fn(),
    ...overrides,
  };
  renderWithProviders(<CurrentParkingState {...props} />);
  return props;
}

describe("current parking state: active session", () => {
  it("renders the active session as the primary current parking state", async () => {
    renderState({ session });
    expect(screen.getByTestId("active-banner")).toBeOnTheScreen();
    expect(screen.getByTestId("active-banner-zone")).toHaveTextContent("Zone A");
    expect(screen.getByTestId("active-banner-plate")).toHaveTextContent("ABC-1234");
  });

  it("shows the backend session start time", () => {
    renderState({ session });
    expect(screen.getByTestId("session-started")).toHaveTextContent(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("shows no fee when the backend returns null", () => {
    renderState({ session });
    expect(screen.queryByTestId("session-fee")).not.toBeOnTheScreen();
    expect(screen.queryByText(/₱/)).not.toBeOnTheScreen();
  });

  it("shows the fee when the backend returns one", () => {
    renderState({ session: { ...session, feeAmount: 42.5 } });
    expect(screen.getByTestId("session-fee")).toHaveTextContent("₱42.50");
  });

  it("keeps the assignment as contextual information under an active session", () => {
    renderState({ session, assignment });
    expect(screen.getByTestId("session-assignment")).toHaveTextContent("Assigned zone: Zone B (B)");
    expect(screen.queryByTestId("assignment-current")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-current")).not.toBeOnTheScreen();
  });

  it("exposes an accessible current-parking summary", () => {
    renderState({ session, assignment });
    const label = screen.getByTestId("session-summary").props.accessibilityLabel;
    expect(label).toMatch(/Active parking in Zone A\./);
    expect(label).toMatch(/Vehicle ABC-1234\./);
    expect(label).toMatch(/Started /);
    expect(label).toMatch(/Assigned zone Zone B\./);
  });
});

describe("current parking state: navigation over active session", () => {
  beforeEach(() => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });

  it("shows a usable navigate action when a destination exists", async () => {
    renderState({
      session,
      destination,
      destinationReady: true,
    });
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition({ latitude: 14.5995, longitude: 120.9842 });

    const button = screen.getByTestId("current-state-navigate");
    expect(button.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(button);

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining("maps://?saddr=14.5995,120.9842&daddr=14.5502,121.0402"),
      ),
    );
  });

  it("shows navigation as unavailable, not hidden, when no destination exists", () => {
    renderState({ session, destination: null, destinationReady: true });
    expect(screen.getByTestId("current-state-navigate")).toBeDisabled();
    expect(screen.getByTestId("current-state-navigate-unavailable")).toHaveTextContent(
      "Navigation isn't available right now.",
    );
  });

  it("hides navigation while the destination is still loading", () => {
    renderState({ session, destination: null, destinationReady: false });
    expect(screen.queryByTestId("current-state-navigate")).not.toBeOnTheScreen();
  });
});

describe("current parking state: assignment", () => {
  it("shows the active assignment as current state with zone, code, vehicle and validity", () => {
    renderState({ assignment, destinationReady: false });
    expect(screen.getByTestId("assignment-current")).toBeOnTheScreen();
    expect(screen.getByTestId("assignment-current-zone")).toHaveTextContent("Zone B");
    expect(screen.getByTestId("assignment-current-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.getByTestId("assignment-current-validity")).toHaveTextContent(/^Valid until /);
    expect(screen.getByTestId("assignment-current-badge")).toBeOnTheScreen();
  });

  it("exposes an accessible assignment summary", () => {
    renderState({ assignment });
    const label = screen.getByTestId("assignment-summary").props.accessibilityLabel;
    expect(label).toMatch(/Assigned to Zone B\./);
    expect(label).toMatch(/Vehicle ABC-1234\./);
    expect(label).toMatch(/Valid until /);
  });

  it("does not treat a REVOKED assignment as current", () => {
    renderState({
      assignment: { ...assignment, status: "REVOKED", expiresAt: null },
      destinationReady: false,
    });
    expect(screen.queryByTestId("assignment-current")).not.toBeOnTheScreen();
  });
});

describe("current parking state: reservation", () => {
  it("shows the valid reservation as current state, clearly distinct from an assignment", () => {
    renderState({ reservation });
    expect(screen.getByTestId("reservation-current")).toBeOnTheScreen();
    expect(screen.getByTestId("reservation-current-zone")).toHaveTextContent("Zone B");
    expect(screen.getByTestId("reservation-current-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.getByTestId("reservation-current-badge")).toBeOnTheScreen();
    expect(screen.getByText("RESERVED")).toBeOnTheScreen();
    expect(screen.queryByText("ZONE ASSIGNED")).not.toBeOnTheScreen();
  });

  it("shows the reservation start/end window", () => {
    renderState({ reservation });
    expect(screen.getByTestId("reservation-current-window")).toHaveTextContent(/^Start .* · End /);
  });

  it("does not treat an EXPIRED reservation as current", () => {
    renderState({ reservation: { ...reservation, status: "EXPIRED" } });
    expect(screen.queryByTestId("reservation-current")).not.toBeOnTheScreen();
  });
});

describe("current parking state: combinations", () => {
  it("shows assignment and reservation together without merging or reconciling them", () => {
    renderState({ assignment, reservation });
    expect(screen.getByTestId("assignment-current")).toBeOnTheScreen();
    expect(screen.getByTestId("reservation-current")).toBeOnTheScreen();
    expect(screen.getByText("ZONE ASSIGNED")).toBeOnTheScreen();
    expect(screen.getByText("RESERVED")).toBeOnTheScreen();
  });

  it("suppresses suggestion-state blocks when nothing is current, showing an empty state", () => {
    renderState();
    expect(screen.getByTestId("current-state-empty")).toHaveTextContent(/No active parking/);
    expect(screen.queryByTestId("assignment-current")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-current")).not.toBeOnTheScreen();
  });

  it("shows a loading state while the session is unknown", () => {
    renderState({ activePending: true });
    expect(screen.getByTestId("current-state-loading")).toBeOnTheScreen();
  });

  it("shows a loading state while assignment state is still resolving", () => {
    renderState({ statePending: true });
    expect(screen.getByTestId("current-state-loading")).toBeOnTheScreen();
  });

  it("shows a friendly error with retry when the active session cannot be loaded", () => {
    const onRetry = jest.fn();
    renderState({ activeError: true, activeErrorMessage: "We couldn't load your parking session.", onRetry });
    expect(screen.getByText("We couldn't load your parking session.")).toBeOnTheScreen();
    expect(screen.queryByText(/502|status|stack/i)).not.toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("active-session-error-retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows a retry-able error when assignment and reservation both fail", () => {
    const onRetry = jest.fn();
    renderState({ assignmentError: true, reservationError: true, onRetry });
    expect(screen.getByTestId("current-state-error")).toBeOnTheScreen();
    expect(screen.getByText("We couldn't load your current parking status.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("current-state-error-retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("degrades gracefully: reservation still shown when assignment info fails to load", () => {
    renderState({ reservation, assignmentError: true });
    expect(screen.getByTestId("reservation-current")).toBeOnTheScreen();
    expect(screen.getByTestId("assignment-load-note")).toHaveTextContent(
      "We couldn't load your assignment info. Pull to refresh to try again.",
    );
  });

  it("does not replace an active session with an error when assignment info fails", () => {
    renderState({ session, assignmentError: true });
    expect(screen.getByTestId("active-banner")).toBeOnTheScreen();
    expect(screen.getByTestId("session-assignment-note")).toBeOnTheScreen();
    expect(screen.queryByTestId("active-session-error")).not.toBeOnTheScreen();
  });
});

describe("parking screen: Phase 9.6 integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    (LocationMock as LocationModule).__reset();
    (api.zones as jest.Mock).mockResolvedValue(zones);
    (api.activeSession as jest.Mock).mockResolvedValue(null);
    (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
    (api.assignments as jest.Mock).mockResolvedValue([]);
    (api.reservations as jest.Mock).mockResolvedValue([]);
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);
    (api.establishment as jest.Mock).mockResolvedValue({ location: null });
  });

  it("gives the active session precedence over assignment and reservation", async () => {
    (api.activeSession as jest.Mock).mockResolvedValue(session);
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("active-banner")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-current")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-current")).not.toBeOnTheScreen();
    expect(screen.getByTestId("session-assignment")).toHaveTextContent(/Assigned zone: Zone B/);
    expect(screen.queryByTestId("parking-recommendation")).not.toBeOnTheScreen();
  });

  it("keeps the recommendation hidden while an assignment is current", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("assignment-current")).toBeOnTheScreen());
    expect(screen.queryByTestId("parking-recommendation")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("accept-recommendation")).not.toBeOnTheScreen();
  });

  it("keeps the recommendation hidden while a reservation is current", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("reservation-current")).toBeOnTheScreen());
    expect(screen.queryByTestId("parking-recommendation")).not.toBeOnTheScreen();
  });

  it("shows the empty state and the recommendation when nothing is current", async () => {
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("current-state-empty")).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByTestId("parking-recommendation")).toBeOnTheScreen());
  });

  it("excludes an expired assignment from current state and falls back to recommendation", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([
      { ...assignment, expiresAt: new Date(Date.now() - 60_000).toISOString() },
    ]);
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("current-state-empty")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-current")).not.toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId("parking-recommendation")).toBeOnTheScreen());
  });

  it("shows the assignment current state and the navigation action on the parking screen", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    (api.establishment as jest.Mock).mockResolvedValue({
      location: { address: "123 Test Ave", latitude: 14.5502, longitude: 121.0402 },
    });
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("assignment-current")).toBeOnTheScreen());
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition({ latitude: 14.5995, longitude: 120.9842 });

    fireEvent.press(screen.getByTestId("assignment-navigate"));
    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining("maps://?saddr=14.5995,120.9842&daddr=14.5502,121.0402"),
      ),
    );
    // Navigation never mutates backend state.
    expect(api.createAssignment).not.toHaveBeenCalled();
    expect(api.createReservation).not.toHaveBeenCalled();
    expect(api.cancelReservation).not.toHaveBeenCalled();
  });

  it("preserves authentication when the active session fails (non-401)", async () => {
    (api.activeSession as jest.Mock).mockRejectedValue(
      new ApiError("BAD_GATEWAY", "The server is down.", 502),
    );
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("active-session-error")).toBeOnTheScreen());
    expect(screen.getByText("The server is down.")).toBeOnTheScreen();
    expect(screen.queryByText(/502|BAD_GATEWAY/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId("parking-recommendation")).not.toBeOnTheScreen();
  });
});