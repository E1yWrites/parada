import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import ParkingScreen from "@/app/(tabs)/parking";
import { api, ApiError, type PublicZone, type SessionDto } from "@/lib/api/client";

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
      notifications: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
    },
  };
});

const zones: PublicZone[] = [
  {
    id: "z1",
    name: "Zone A",
    code: "A",
    description: null,
    capacity: 20,
    occupiedCount: 15,
    availableCount: 5,
    status: "ACTIVE",
    availability: "AVAILABLE",
  },
  {
    id: "z2",
    name: "Zone B",
    code: "B",
    description: null,
    capacity: 20,
    occupiedCount: 19,
    availableCount: 1,
    status: "ACTIVE",
    availability: "LOW_AVAILABILITY",
  },
  {
    id: "z3",
    name: "Zone C",
    code: "C",
    description: null,
    capacity: 10,
    occupiedCount: 10,
    availableCount: 0,
    status: "ACTIVE",
    availability: "FULL",
  },
  {
    id: "z4",
    name: "Zone D",
    code: "D",
    description: null,
    capacity: 10,
    occupiedCount: 6,
    availableCount: 4,
    status: "INACTIVE",
    availability: "OFFLINE",
  },
];

const zoneZero: PublicZone = {
  id: "z0",
  name: "Zone Zero",
  code: "Z0",
  description: null,
  capacity: 0,
  occupiedCount: 0,
  availableCount: 0,
  status: "ACTIVE",
  availability: "AVAILABLE",
};

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
  (api.zones as jest.Mock).mockResolvedValue(zones);
  (api.activeSession as jest.Mock).mockResolvedValue(null);
  (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
  (api.assignments as jest.Mock).mockResolvedValue([]);
  (api.createAssignment as jest.Mock).mockResolvedValue({});
  (api.vehicles as jest.Mock).mockResolvedValue([]);
  (api.reservations as jest.Mock).mockResolvedValue([]);
  (api.createReservation as jest.Mock).mockResolvedValue({});
  (api.cancelReservation as jest.Mock).mockResolvedValue({});
  (api.establishment as jest.Mock).mockResolvedValue({ location: null });
});

describe("parking screen: zone availability", () => {
  it("renders AVAILABLE/LOW/FULL/OFFLINE badges concurrently", async () => {
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByText("Available")).toBeOnTheScreen());
    expect(screen.getByText("Low")).toBeOnTheScreen();
    expect(screen.getByText("Full")).toBeOnTheScreen();
    expect(screen.getByText("Offline")).toBeOnTheScreen();
    expect(screen.getByTestId("zone-A-available")).toHaveTextContent("5");
    expect(screen.getByTestId("zone-C-available")).toHaveTextContent("0");
  });

  it("shows a loading state while zones resolve", () => {
    let resolveZones!: (value: PublicZone[]) => void;
    (api.zones as jest.Mock).mockReturnValue(
      new Promise<PublicZone[]>((r) => {
        resolveZones = r;
      }),
    );

    renderWithProviders(<ParkingScreen />);

    expect(screen.getByTestId("zones-loading")).toBeOnTheScreen();
    resolveZones(zones);
  });

  it("shows an error and recovers via retry", async () => {
    (api.zones as jest.Mock)
      .mockRejectedValueOnce(new ApiError("BAD_GATEWAY", "The server is down.", 502))
      .mockResolvedValueOnce(zones);

    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByText("The server is down.")).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId("zones-error-retry"));

    await waitFor(() => expect(screen.getByText("Available")).toBeOnTheScreen());
    expect(api.zones).toHaveBeenCalledTimes(2);
  });
});

describe("parking screen: active session banner", () => {
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
    await waitFor(() => expect(screen.getByText("Available")).toBeOnTheScreen());
    expect(screen.queryByTestId("active-banner")).not.toBeOnTheScreen();
  });
});

describe("parking screen: manual zone selection (phase 9.3)", () => {
  it("selecting a zone is local UI state only (no assignment request)", async () => {
    renderWithProviders(<ParkingScreen />);

    fireEvent.press(await screen.findByTestId("zone-A"));
    expect(screen.getByTestId("zone-A-selected")).toBeOnTheScreen();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("tapping another zone moves the selection", async () => {
    renderWithProviders(<ParkingScreen />);

    fireEvent.press(await screen.findByTestId("zone-A"));
    fireEvent.press(screen.getByTestId("zone-B"));

    expect(screen.getByTestId("zone-B-selected")).toBeOnTheScreen();
    expect(screen.queryByTestId("zone-A-selected")).not.toBeOnTheScreen();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("marks full zones as unselectable and explains why", async () => {
    renderWithProviders(<ParkingScreen />);

    await screen.findByTestId("zone-C");
    expect(screen.getByTestId("zone-C-unavailable")).toHaveTextContent(/No spaces available/);
    expect(screen.getByTestId("zone-C").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId("zone-C"));
    expect(screen.queryByTestId("zone-C-selected")).not.toBeOnTheScreen();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("does not allow selecting an offline zone", async () => {
    renderWithProviders(<ParkingScreen />);

    await screen.findByTestId("zone-D");
    expect(screen.getByTestId("zone-D").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId("zone-D"));
    expect(screen.queryByTestId("zone-D-selected")).not.toBeOnTheScreen();
  });
});

describe("parking screen: capacity indicator", () => {
  it("shows the occupancy ratio and percent for a normal zone", async () => {
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-A-occupancy-percent")).toHaveTextContent("15 of 20 · 75%"));
  });

  it("shows a full zone at 100% with zero available", async () => {
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-C-occupancy-percent")).toHaveTextContent("10 of 10 · 100%"));
    expect(screen.getByTestId("zone-C-available")).toHaveTextContent("0");
  });

  it("reflects low availability from backend numbers", async () => {
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-B-occupancy-percent")).toHaveTextContent("19 of 20 · 95%"));
  });

  it("renders a zero-capacity zone without NaN, Infinity or an invalid width", async () => {
    (api.zones as jest.Mock).mockResolvedValue([...zones, zoneZero]);
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-Z0-occupancy-percent")).toHaveTextContent("No capacity data"));
    const fill = flattenStyle(screen.getByTestId("zone-Z0-occupancy-fill").props.style);
    expect(fill.width).toBe("0%");
  });

  it("exposes an accessible occupancy summary on the zone card", async () => {
    renderWithProviders(<ParkingScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-A")).toBeOnTheScreen());
    const label = screen.getByTestId("zone-A").props.accessibilityLabel;
    expect(label).toMatch(/15 of 20 spaces occupied/);
    expect(label).toMatch(/5 spaces available/);
    expect(label).toMatch(/75 percent occupied/);
  });
});

describe("parking screen: reservations (phase 9.4)", () => {
  it("renders the reservation panel and a reservation for a selected zone", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([
      { id: "v1", userId: "u1", plateNumber: "ABC-1234", normalizedPlate: "ABC1234", vehicleType: "CAR", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    ]);
    renderWithProviders(<ParkingScreen />);

    fireEvent.press(await screen.findByTestId("zone-A"));
    const create = await screen.findByTestId("reservation-create");
    expect(create).toHaveTextContent("Reserve ABC-1234 in Zone A");

    fireEvent.press(create);
    await waitFor(() =>
      expect(api.createReservation).toHaveBeenCalledWith(
        expect.objectContaining({ zoneId: "z1", vehicleId: "v1" }),
      ),
    );
  });

  it("does not show the reservation panel while a session is active", async () => {
    (api.activeSession as jest.Mock).mockResolvedValue(activeSession);
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByTestId("active-banner")).toBeOnTheScreen());
    expect(screen.queryByTestId("reservation-panel")).not.toBeOnTheScreen();
  });
});

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