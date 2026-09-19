import { Text as RNText } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { ReservationPanel } from "@/src/components/ReservationPanel";
import { ReservationList } from "@/src/components/ReservationList";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import { queryKeys } from "@/lib/query";
import type { ReservationResponse, Vehicle } from "@parada/types";

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
    },
  };
});

const zoneA: PublicZone = {
  id: "z1",
  name: "Zone A",
  code: "A",
  description: null,
  capacity: 20,
  occupiedCount: 12,
  availableCount: 8,
  status: "ACTIVE",
  availability: "AVAILABLE",
  navigationLat: null,
  navigationLng: null,
};
const fullZone: PublicZone = {
  id: "z3",
  name: "Zone Full",
  code: "F",
  description: null,
  capacity: 10,
  occupiedCount: 10,
  availableCount: 0,
  status: "ACTIVE",
  availability: "FULL",
  navigationLat: null,
  navigationLng: null,
};

const activeVehicle: Vehicle = {
  id: "v1",
  userId: "u1",
  plateNumber: "ABC-1234",
  normalizedPlate: "ABC1234",
  vehicleType: "CAR",
  make: null,
  model: null,
  color: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const secondVehicle: Vehicle = {
  id: "v2",
  userId: "u1",
  plateNumber: "XYZ-5678",
  normalizedPlate: "XYZ5678",
  vehicleType: "CAR",
  make: null,
  model: null,
  color: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const FIXED_NOW = "2026-09-05T09:00:00.000Z";

function reservation(overrides: Partial<ReservationResponse> = {}): ReservationResponse {
  return {
    id: "r1",
    userId: "u1",
    vehicleId: "v1",
    zoneId: "z1",
    startAt: FIXED_NOW,
    endAt: "2026-09-05T09:15:00.000Z",
    status: "CONFIRMED",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    zone: { id: "z1", name: "Zone A", code: "A" },
    vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (api.zones as jest.Mock).mockResolvedValue([]);
  (api.vehicles as jest.Mock).mockResolvedValue([activeVehicle]);
  (api.reservations as jest.Mock).mockResolvedValue([]);
  (api.createReservation as jest.Mock).mockResolvedValue(reservation());
  (api.cancelReservation as jest.Mock).mockResolvedValue({ ...reservation(), status: "CANCELLED" });
});

function Harness() {
  return (
    <>
      <ReservationPanel selectedZone={zoneA} />
      <ReservationList />
    </>
  );
}

function WaitHarness() {
  const reservations = useQuery({ queryKey: queryKeys.reservations, queryFn: api.reservations });
  const zones = useQuery({ queryKey: queryKeys.zones, queryFn: api.zones });
  return (
    <>
      <ReservationPanel selectedZone={zoneA} />
      <ReservationList />
      <RNText testID="harness-count">{String(reservations.data?.length ?? 0)}</RNText>
      <RNText testID="harness-zones">{String(zones.data?.length ?? 0)}</RNText>
    </>
  );
}

describe("reservation panel: zone gating", () => {
  it("hints to pick a zone and disables creation without one", async () => {
    renderWithProviders(<ReservationPanel selectedZone={null} />);
    expect(screen.getByTestId("reservation-zone-hint")).toHaveTextContent(
      /Select a parking zone above/,
    );
    const create = await screen.findByTestId("reservation-create");
    expect(create).toHaveTextContent("Select a zone");
    expect(create.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("shows the selected zone summary and enables the vehicle flow", async () => {
    renderWithProviders(<Harness />);
    const summary = await screen.findByTestId("reservation-summary");
    expect(summary).toHaveTextContent(/Zone A/);
    expect(summary).toHaveTextContent(/8 spaces available/);
  });

  it("blocks a zone that is already full", async () => {
    renderWithProviders(<ReservationPanel selectedZone={fullZone} />);
    expect(screen.getByTestId("reservation-zone-full")).toHaveTextContent(/This zone is now full/);
    const create = await screen.findByTestId("reservation-create");
    expect(create).toHaveTextContent("Select another zone");
    expect(create.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(create);
    expect(api.createReservation).not.toHaveBeenCalled();
  });
});

describe("reservation panel: vehicle requirement", () => {
  it("blocks creation and routes to /vehicles when there is no vehicle", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([]);
    renderWithProviders(<Harness />);
    expect(await screen.findByTestId("reservation-no-vehicle")).toHaveTextContent(
      /Add a vehicle first to make a reservation\./,
    );
    fireEvent.press(screen.getByTestId("reservation-add-vehicle"));
    expect(require("@/__mocks__/expo-router").__router.push).toHaveBeenCalledWith("/vehicles");
    expect(screen.queryByTestId("reservation-create")).not.toBeOnTheScreen();
    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it("auto-uses the single active vehicle", async () => {
    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByTestId("reservation-vehicle")).toHaveTextContent(/ABC-1234/));
    expect(screen.queryByTestId("reservation-vehicle-v1")).not.toBeOnTheScreen();
  });

  it("requires an explicit choice when several vehicles are registered", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([activeVehicle, secondVehicle]);
    renderWithProviders(<Harness />);
    const create = await screen.findByTestId("reservation-create");
    expect(screen.getByTestId("reservation-vehicle-v1")).toBeOnTheScreen();
    expect(create).toHaveTextContent("Select a vehicle");
    expect(create.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(screen.getByTestId("reservation-vehicle-v2"));
    expect(api.createReservation).not.toHaveBeenCalled();
    expect(create).toHaveTextContent("Reserve XYZ-5678 in Zone A");
    expect(create.props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("never auto-picks a vehicle when several exist and nothing is chosen", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([activeVehicle, secondVehicle]);
    renderWithProviders(<Harness />);
    const create = await screen.findByTestId("reservation-create");
    expect(create).toHaveTextContent("Select a vehicle");
    expect(create.props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe("reservation panel: submission", () => {
  it("creates the reservation only on explicit action with the chosen inputs", async () => {
    renderWithProviders(<Harness />);
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    expect(api.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: "z1", vehicleId: "v1" }),
    );
  });

  it("shows pending state and prevents duplicate submission", async () => {
    let resolveCreate!: (value: ReservationResponse) => void;
    (api.createReservation as jest.Mock).mockReturnValue(
      new Promise<ReservationResponse>((r) => {
        resolveCreate = r;
      }),
    );
    (api.reservations as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValue([reservation()]);
    renderWithProviders(<Harness />);
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() => expect(screen.getByTestId("reservation-create")).toHaveTextContent("Reserving…"));
    const create = screen.getByTestId("reservation-create");
    expect(create.props.accessibilityState).toMatchObject({ busy: true, disabled: true });

    fireEvent.press(create);
    expect(api.createReservation).toHaveBeenCalledTimes(1);
    resolveCreate(reservation());
    await waitFor(() => expect(screen.getByTestId("reservation-r1")).toBeOnTheScreen());
  });

  it("renders backend-confirmed state only after success (single list rendering)", async () => {
    (api.reservations as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValue([reservation()]);
    renderWithProviders(<Harness />);
    expect(screen.queryByTestId("reservation-r1")).not.toBeOnTheScreen();
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() => expect(screen.getByTestId("reservation-r1")).toBeOnTheScreen());
    expect(screen.getByTestId("reservation-r1")).toHaveTextContent(/Zone A/);
    expect(screen.getByTestId("reservation-r1")).toHaveTextContent(/ABC-1234/);
    // The confirmed hold renders exactly once — no duplicate confirmation card.
    expect(screen.queryByTestId("reservation-confirmed")).not.toBeOnTheScreen();
  });

  it("never shows assigned state on a failed request", async () => {
    (api.createReservation as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", `Zone 'z1' has no available reservation capacity.`, 409),
    );
    renderWithProviders(<Harness />);
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() => expect(screen.getByTestId("reservation-error")).toHaveTextContent(/no longer available/));
    expect(screen.queryByTestId("reservation-r1")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-confirmed")).not.toBeOnTheScreen();
  });
});

describe("reservation panel: failures", () => {
  it("maps a capacity conflict to a friendly message", async () => {
    (api.createReservation as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", `Zone 'z1' has no available reservation capacity.`, 409),
    );
    renderWithProviders(<Harness />);
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() =>
      expect(screen.getByTestId("reservation-error")).toHaveTextContent(
        "This zone is no longer available for reservation. Please choose another zone.",
      ),
    );
    expect(screen.getByTestId("reservation-error")).not.toHaveTextContent(
      /409|CONFLICT|has no available/i,
    );
  });

  it("handles network failures with a friendly message and keeps controls usable", async () => {
    (api.createReservation as jest.Mock).mockRejectedValue(
      new ApiError("NETWORK", "Could not connect.", 0),
    );
    renderWithProviders(<Harness />);
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() =>
      expect(screen.getByTestId("reservation-error")).toHaveTextContent(
        "We couldn't connect to the parking service. Please try again.",
      ),
    );
    const create = screen.getByTestId("reservation-create");
    expect(create.props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("maps a generic backend failure to a friendly message", async () => {
    (api.createReservation as jest.Mock).mockRejectedValue(new Error("boom"));
    renderWithProviders(<Harness />);
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() =>
      expect(screen.getByTestId("reservation-error")).toHaveTextContent(
        "We couldn't make this reservation. Please try again.",
      ),
    );
  });

  it("never surfaces raw backend details for other API errors", async () => {
    (api.createReservation as jest.Mock).mockRejectedValue(
      new ApiError("NOT_FOUND", "Zone 'zzz' not found.", 404),
    );
    renderWithProviders(<Harness />);
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() =>
      expect(screen.getByTestId("reservation-error")).toHaveTextContent(
        "Something went wrong. Please try again.",
      ),
    );
    expect(screen.getByTestId("reservation-error")).not.toHaveTextContent(/NOT_FOUND|not found/);
  });
});

describe("reservation panel: reservation list", () => {
  const listReservation = reservation();

  it("shows a loading state while reservations resolve", async () => {
    let resolveList!: (value: ReservationResponse[]) => void;
    (api.reservations as jest.Mock).mockReturnValue(
      new Promise<ReservationResponse[]>((r) => {
        resolveList = r;
      }),
    );
    renderWithProviders(<Harness />);
    expect(await screen.findByTestId("reservations-loading")).toBeOnTheScreen();
    resolveList([]);
  });

  it("shows an empty state when there are no reservations", async () => {
    renderWithProviders(<Harness />);
    await waitFor(() => expect(screen.getByTestId("reservations-empty")).toBeOnTheScreen());
    expect(screen.getByText("No reservations yet")).toBeOnTheScreen();
  });

  it("renders reservations from backend data with status and times", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([listReservation]);
    renderWithProviders(<Harness />);
    const card = await screen.findByTestId("reservation-r1");
    expect(card).toHaveTextContent(/Zone A/);
    expect(card).toHaveTextContent(/ABC-1234/);
    expect(screen.getByTestId("reservation-r1-status")).toHaveTextContent(/Confirmed/);
  });

  it("shows an Expired status badge for a backend-expired reservation", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([
      { ...listReservation, status: "EXPIRED" },
    ]);
    renderWithProviders(<Harness />);
    await screen.findByTestId("reservation-r1");
    expect(screen.getByTestId("reservation-r1-status")).toHaveTextContent(/Expired/);
    // Expired reservations cannot be cancelled.
    expect(screen.queryByTestId("reservation-r1-cancel")).not.toBeOnTheScreen();
  });

  it("offers cancellation for a backend-ACTIVE reservation", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([
      { ...listReservation, status: "ACTIVE" },
    ]);
    renderWithProviders(<Harness />);
    await screen.findByTestId("reservation-r1");
    expect(screen.getByTestId("reservation-r1-status")).toHaveTextContent(/Active/);
    expect(screen.getByTestId("reservation-r1-cancel")).toBeOnTheScreen();
  });

  it("renders a cancellable reservation and hides cancellation once cancelled", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([listReservation]);
    (api.cancelReservation as jest.Mock).mockResolvedValue({
      ...listReservation,
      status: "CANCELLED",
    });
    renderWithProviders(<Harness />);
    await screen.findByTestId("reservation-r1");
    expect(screen.getByTestId("reservation-r1-cancel")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("reservation-r1-cancel"));
    expect(screen.getByTestId("reservation-r1-cancel-confirm")).toHaveTextContent(
      "Cancel this reservation?",
    );
    expect(api.cancelReservation).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("reservation-r1-cancel-confirm-btn"));
    await waitFor(() => expect(api.cancelReservation).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryByTestId("reservation-r1-cancel")).not.toBeOnTheScreen());
  });

  it("does not offer cancellation when onCancel is unsupported", async () => {
    renderWithProviders(<ReservationPanel selectedZone={null} />);
    expect(screen.queryByTestId("reservation-r1-cancel")).not.toBeOnTheScreen();
  });
});

describe("reservation panel: refresh after actions", () => {
  it("refreshes reservation and zone data after a successful creation", async () => {
    (api.zones as jest.Mock).mockResolvedValue([zoneA]);
    renderWithProviders(<WaitHarness />);
    await waitFor(() => expect(screen.getByTestId("harness-count")).toHaveTextContent("0"));
    await waitFor(() => expect(screen.getByTestId("harness-zones")).toHaveTextContent("1"));

    (api.reservations as jest.Mock).mockResolvedValue([reservation()]);
    const zonesCalls = (api.zones as jest.Mock).mock.calls.length;
    fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() => expect(screen.getByTestId("harness-count")).toHaveTextContent("1"));
    await waitFor(() => expect(screen.getByTestId("reservation-r1")).toBeOnTheScreen());
    await waitFor(() =>
      expect((api.zones as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(zonesCalls + 1),
    );
  });

  it("refreshes the list after cancellation", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([reservation()]);
    renderWithProviders(<Harness />);
    await screen.findByTestId("reservation-r1");
    fireEvent.press(screen.getByTestId("reservation-r1-cancel"));
    fireEvent.press(screen.getByTestId("reservation-r1-cancel-confirm-btn"));
    await waitFor(() => expect(api.reservations).toHaveBeenCalledTimes(2));
  });
});
