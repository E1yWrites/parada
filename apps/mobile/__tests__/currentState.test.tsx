import { Linking } from "react-native";
import * as LocationMock from "expo-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { ThemeProvider } from "@/src/providers/ThemeProvider";
import ParkingScreen from "@/app/(tabs)/parking";
import ParkScreen from "@/app/(tabs)/park";
import { CurrentParkingState } from "@/src/components/CurrentParkingState";
import { VehicleSelectionProvider } from "@/src/components/VehicleSelection";
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
      notifications: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
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
    navigationLat: null,
    navigationLng: null,
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
  make: null,
  model: null,
  color: null,
  status: "ACTIVE",
  isPrimary: true,
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
    destinationFor: () => null,
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
    expect(label).toMatch(/Parked in Zone A\./);
    expect(label).toMatch(/Vehicle ABC-1234\./);
    expect(label).toMatch(/Parked since /);
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
      destinationFor: (zoneId) => (zoneId === session.zoneId ? destination : null),
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
    renderState({ session, destinationFor: () => null, destinationReady: true });
    expect(screen.getByTestId("current-state-navigate")).toBeDisabled();
    expect(screen.getByTestId("current-state-navigate-unavailable")).toHaveTextContent(
      "Navigation coordinates for this zone haven't been configured yet.",
    );
  });

  it("hides navigation while the destination is still loading", () => {
    renderState({ session, destinationFor: () => null, destinationReady: false });
    expect(screen.queryByTestId("current-state-navigate")).not.toBeOnTheScreen();
  });
});

describe("current parking state: assignment", () => {
  it("shows the active assignment as current state with zone, code, vehicle and validity", () => {
    renderState({ assignment, destinationReady: false });
    expect(screen.getByTestId("assignment-current")).toBeOnTheScreen();
    expect(screen.getByTestId("assignment-current-zone")).toHaveTextContent("Zone B");
    expect(screen.getByTestId("assignment-current-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.getByTestId("assignment-current-validity")).toHaveTextContent(/^Enter by /);
    // One label per state: the stamp alone, no duplicate status badge beside it.
    expect(screen.getByText("ASSIGNED ZONE")).toBeOnTheScreen();
    expect(screen.queryByTestId("assignment-current-badge")).not.toBeOnTheScreen();
  });

  it("states that an assignment keeps no space and what entering another zone costs", () => {
    renderState({ assignment, destinationReady: false });
    // Only a reservation protects capacity; the camera path warns, then fines.
    expect(screen.getByTestId("assignment-current-terms")).toHaveTextContent(
      "No space is kept for you. Entering another zone gets a wrong-zone warning, then a fine.",
    );
    expect(screen.queryByText(/all set/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/₱/)).not.toBeOnTheScreen();
  });

  it("exposes an accessible assignment summary", () => {
    renderState({ assignment });
    const label = screen.getByTestId("assignment-summary").props.accessibilityLabel;
    expect(label).toMatch(/Assigned zone Zone B\./);
    expect(label).toMatch(/Vehicle ABC-1234\./);
    expect(label).toMatch(/Enter by /);
    expect(label).toMatch(/No space is kept for you\./);
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
    expect(screen.getByText("RESERVED")).toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-current-badge")).not.toBeOnTheScreen();
    expect(screen.queryByText("ASSIGNED ZONE")).not.toBeOnTheScreen();
  });

  it("shows the reservation start/end window", () => {
    renderState({ reservation });
    // A reservation protects capacity for its window, so the window is named as that.
    expect(screen.getByTestId("reservation-current-window")).toHaveTextContent(/^Space kept .* – /);
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
    expect(screen.getByText("ASSIGNED ZONE")).toBeOnTheScreen();
    expect(screen.getByText("RESERVED")).toBeOnTheScreen();
  });

  it("suppresses suggestion-state blocks when nothing is current, showing an empty state", () => {
    renderState();
    expect(screen.getByTestId("current-state-empty")).toHaveTextContent(/Nothing planned/);
    expect(screen.queryByTestId("assignment-current")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-current")).not.toBeOnTheScreen();
    expect(screen.queryByText(/recommendation/i)).not.toBeOnTheScreen();
  });

  it("offers a Find a zone button (not cross-tab copy) when idle", () => {
    const onFindZone = jest.fn();
    renderState({ onFindZone });
    fireEvent.press(screen.getByTestId("current-state-find-zone"));
    expect(onFindZone).toHaveBeenCalledTimes(1);
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

  it("shows 'Nothing planned' with a Find a zone button when nothing is current (no suggestion card on Now)", async () => {
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("current-state-empty")).toBeOnTheScreen());
    expect(screen.getByTestId("current-state-find-zone")).toBeOnTheScreen();
    // The least-busy pick lives on Zones now; Now shows only what is current.
    expect(screen.queryByTestId("parking-recommendation")).not.toBeOnTheScreen();
    expect(api.recommendedZone).not.toHaveBeenCalled();
  });

  it("excludes an expired assignment from current state and falls back to the empty state", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([
      { ...assignment, expiresAt: new Date(Date.now() - 60_000).toISOString() },
    ]);
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("current-state-empty")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-current")).not.toBeOnTheScreen();
    expect(screen.getByTestId("current-state-find-zone")).toBeOnTheScreen();
  });

  it("shows the assignment current state and navigates to the assigned zone's own coordinates", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    // The assignment targets z2; only z2's admin-configured coordinates may be used.
    (api.zones as jest.Mock).mockResolvedValue([
      ...zones,
      {
        id: "z2",
        name: "Zone B",
        code: "B",
        description: null,
        capacity: 10,
        occupiedCount: 2,
        availableCount: 8,
        status: "ACTIVE",
        availability: "AVAILABLE",
        navigationLat: 14.5502,
        navigationLng: 121.0402,
      },
    ]);
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

describe("redesign: the live reservation is cancelled from Now", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.zones as jest.Mock).mockResolvedValue(zones);
    (api.activeSession as jest.Mock).mockResolvedValue(null);
    (api.assignments as jest.Mock).mockResolvedValue([]);
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);
    (api.notifications as jest.Mock).mockResolvedValue({ notifications: [], unreadCount: 0 });
  });

  it("asks once more, then cancels through the API and falls back to 'Nothing planned'", async () => {
    (api.cancelReservation as jest.Mock).mockImplementation(async (id: string) => {
      (api.reservations as jest.Mock).mockResolvedValue([{ ...reservation, status: "CANCELLED" }]);
      return { ...reservation, id, status: "CANCELLED" };
    });
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("reservation-current")).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId("reservation-cancel"));
    // Releasing a kept space is confirmed first (an assignment keeps nothing, so it isn't).
    expect(screen.getByTestId("reservation-cancel-confirm")).toHaveTextContent(/kept space is released/);
    expect(api.cancelReservation).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("reservation-cancel-confirm-btn"));

    await waitFor(() => expect(api.cancelReservation).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryByTestId("reservation-current")).toBeNull());
    expect(screen.getByTestId("current-state-empty")).toBeOnTheScreen();
  });

  it("can back out of the confirmation without calling the API", async () => {
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("reservation-current")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("reservation-cancel"));
    fireEvent.press(screen.getByTestId("reservation-cancel-keep"));
    expect(screen.getByTestId("reservation-cancel")).toBeOnTheScreen();
    expect(api.cancelReservation).not.toHaveBeenCalled();
  });

  it("keeps the reservation and shows the server's reason when cancelling fails", async () => {
    (api.cancelReservation as jest.Mock).mockRejectedValue(
      new ApiError("FORBIDDEN", "This reservation can no longer be cancelled.", 403),
    );
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("reservation-current")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("reservation-cancel"));
    fireEvent.press(screen.getByTestId("reservation-cancel-confirm-btn"));
    await waitFor(() =>
      expect(screen.getByTestId("reservation-cancel-error")).toHaveTextContent("This reservation can no longer be cancelled."),
    );
    expect(screen.getByTestId("reservation-current")).toBeOnTheScreen();
  });
});

describe("redesign: a reservation made on Zones becomes Now's current state", () => {
  // Reserving creates a capacity-protected reservation (POST /reservations),
  // never an assignment: Recommendation ≠ Assignment ≠ Reservation ≠ Session.
  // Zones and Now are rendered side by side under one query cache, as the tab
  // layout mounts them, so the backend-confirmed cache write is what Now sees.
  beforeEach(() => {
    jest.clearAllMocks();
    (api.zones as jest.Mock).mockResolvedValue(zones);
    (api.activeSession as jest.Mock).mockResolvedValue(null);
    (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
    (api.assignments as jest.Mock).mockResolvedValue([]);
    (api.reservations as jest.Mock).mockResolvedValue([]);
    (api.createReservation as jest.Mock).mockResolvedValue(reservation);
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);
    (api.notifications as jest.Mock).mockResolvedValue({ notifications: [], unreadCount: 0 });
  });

  async function reserveZoneA() {
    fireEvent.press(await screen.findByTestId("zone-A"));
    fireEvent.press(await screen.findByTestId("parking-action-reserve"));
    return screen.findByTestId("reservation-create");
  }

  it("flips Now to the reservation without an empty-state contradiction", async () => {
    renderWithProviders(
      <>
        <ParkingScreen />
        <ParkScreen />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("current-state-empty")).toBeOnTheScreen());
    const create = await reserveZoneA();

    // After the POST, the backend list contains the CONFIRMED reservation, so
    // the invalidation refetch confirms what the mutation cache-write bridged.
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    fireEvent.press(create);

    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    expect(api.createReservation).toHaveBeenCalledWith(expect.objectContaining({ zoneId: "z1", vehicleId: "v1" }));
    expect(api.createAssignment).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByTestId("reservation-current")).toBeOnTheScreen());
    expect(screen.queryByTestId("current-state-empty")).not.toBeOnTheScreen();
    // Exactly one live reservation representation: Now's card.
    expect(screen.getAllByTestId("reservation-current")).toHaveLength(1);
    expect(screen.queryByTestId("assignment-current")).not.toBeOnTheScreen();
  });

  it("never double-submits while the reservation request is pending", async () => {
    let resolveReserve!: (value: ReservationResponse) => void;
    (api.createReservation as jest.Mock).mockReturnValue(
      new Promise<ReservationResponse>((resolve) => {
        resolveReserve = resolve;
      }),
    );
    renderWithProviders(
      <>
        <ParkingScreen />
        <ParkScreen />
      </>,
    );
    const create = await reserveZoneA();

    fireEvent.press(create);
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    fireEvent.press(create);
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    expect(api.createAssignment).not.toHaveBeenCalled();

    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    resolveReserve(reservation);
    await waitFor(() => expect(screen.getByTestId("reservation-current")).toBeOnTheScreen());
    expect(screen.getAllByTestId("reservation-current")).toHaveLength(1);
    expect(api.createReservation).toHaveBeenCalledTimes(1);
  });
});

describe("phase 9.7: manual assignment → current state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.zones as jest.Mock).mockResolvedValue(zones);
    (api.activeSession as jest.Mock).mockResolvedValue(null);
    (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
    (api.assignments as jest.Mock).mockResolvedValue([]);
    (api.createAssignment as jest.Mock).mockResolvedValue(assignment);
    (api.reservations as jest.Mock).mockResolvedValue([]);
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);
  });

  it("promotes a manually confirmed assignment into current state without the empty state", async () => {
    // Park and Home are separate screens post-redesign, but share one query
    // client in production (both mount under the app's single root
    // QueryClientProvider). Reproduce that here: confirm on Park, then mount
    // Home against the *same* client and assert the promotion is immediate.
    const { client, rerender } = renderWithProviders(<ParkScreen />);
    fireEvent.press(await screen.findByTestId("zone-A"));
    const submit = await screen.findByTestId("assignment-submit");
    expect(submit.props.accessibilityState).toMatchObject({ disabled: false });

    // The backend list confirms the ACTIVE assignment on refetch.
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    fireEvent.press(submit);
    await waitFor(() => expect(screen.getByTestId("assignment-already-assigned")).toBeOnTheScreen());

    rerender(
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <QueryClientProvider client={client}>
            <VehicleSelectionProvider>
              <ParkingScreen />
            </VehicleSelectionProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("assignment-current")).toBeOnTheScreen());
    expect(screen.queryByTestId("current-state-empty")).not.toBeOnTheScreen();
  });
});

describe("phase 9.7: reservation create → current state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.zones as jest.Mock).mockResolvedValue(zones);
    (api.activeSession as jest.Mock).mockResolvedValue(null);
    (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
    (api.assignments as jest.Mock).mockResolvedValue([]);
    (api.reservations as jest.Mock).mockResolvedValue([]);
    (api.createReservation as jest.Mock).mockResolvedValue(reservation);
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);
  });

  it("promotes a confirmed reservation into current state exactly once (no duplicate cards)", async () => {
    const { client, rerender } = renderWithProviders(<ParkScreen />);
    fireEvent.press(await screen.findByTestId("zone-A"));
    fireEvent.press(await screen.findByTestId("parking-action-reserve"));

    // The backend list confirms the CONFIRMED reservation on refetch.
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() => expect(api.createReservation).toHaveBeenCalled());

    rerender(
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <QueryClientProvider client={client}>
            <VehicleSelectionProvider>
              <ParkingScreen />
            </VehicleSelectionProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("reservation-current")).toBeOnTheScreen());
    expect(screen.queryByTestId("current-state-empty")).not.toBeOnTheScreen();
    // The panel no longer renders a duplicate confirmation card.
    expect(screen.queryByTestId("reservation-confirmed")).not.toBeOnTheScreen();
  });
});

describe("reservation on Now: GPS navigation (moved from the retired least-busy card)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (LocationMock as LocationModule).__reset();
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });

  it("navigates to the reserved zone's own configured coordinates from the device location", async () => {
    const destinationFor = jest.fn((zoneId: string) =>
      zoneId === reservation.zoneId ? { label: "Zone B", latitude: 14.5502, longitude: 121.0402 } : null,
    );
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition({ latitude: 14.5995, longitude: 120.9842 });
    renderState({ reservation, destinationFor, destinationReady: true });

    fireEvent.press(screen.getByTestId("reservation-navigate"));
    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining("maps://?saddr=14.5995,120.9842&daddr=14.5502,121.0402"),
      ),
    );
    expect(destinationFor).toHaveBeenCalledWith(reservation.zoneId);
    // GPS is navigation only: nothing is created or cancelled.
    expect(api.createReservation).not.toHaveBeenCalled();
    expect(api.cancelReservation).not.toHaveBeenCalled();
  });

  it("explains that navigation is unavailable when the zone has no coordinates", () => {
    renderState({ reservation, destinationFor: () => null, destinationReady: true });
    expect(screen.getByTestId("reservation-navigate")).toBeDisabled();
    expect(screen.getByTestId("reservation-navigate-unavailable")).toHaveTextContent(
      "Navigation coordinates for this zone haven't been configured yet.",
    );
  });

  it("does not offer navigation while the zones (coordinates) are still loading", () => {
    renderState({ reservation, destinationFor: () => null, destinationReady: false });
    expect(screen.queryByTestId("reservation-navigate")).not.toBeOnTheScreen();
  });
});

describe("current parking state: Lottie on the idle card only", () => {
  it("shows Lottie, unnamed, when nothing is planned", () => {
    renderState();
    expect(screen.getByTestId("current-state-lottie", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("current-state-empty")).not.toHaveTextContent(/Lottie/);
  });

  it("hides Lottie once something is current", () => {
    renderState({ assignment });
    expect(screen.queryByTestId("current-state-lottie", { includeHiddenElements: true })).toBeNull();
  });
});
