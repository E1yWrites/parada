import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import ParkScreen from "@/app/(tabs)/park";
import { useEffect } from "react";
import { useVehicleSelection } from "@/src/components/VehicleSelection";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import type { ReservationResponse } from "@parada/types";

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
    navigationLat: null,
    navigationLng: null,
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
    navigationLat: null,
    navigationLng: null,
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
    navigationLat: null,
    navigationLng: null,
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
    navigationLat: null,
    navigationLng: null,
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
  navigationLat: null,
  navigationLng: null,
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
});

describe("park screen: zone availability", () => {
  it("renders AVAILABLE/LOW/FULL/OFFLINE badges concurrently", async () => {
    renderWithProviders(<ParkScreen />);

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

    renderWithProviders(<ParkScreen />);

    expect(screen.getByTestId("zones-loading")).toBeOnTheScreen();
    resolveZones(zones);
  });

  it("shows an error and recovers via retry", async () => {
    (api.zones as jest.Mock)
      .mockRejectedValueOnce(new ApiError("BAD_GATEWAY", "The server is down.", 502))
      .mockResolvedValueOnce(zones);

    renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByText("The server is down.")).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId("zones-error-retry"));

    await waitFor(() => expect(screen.getByText("Available")).toBeOnTheScreen());
    expect(api.zones).toHaveBeenCalledTimes(2);
  });
});

describe("park screen: manual zone selection (phase 9.3)", () => {
  it("selecting a zone is local UI state only (no assignment request)", async () => {
    renderWithProviders(<ParkScreen />);

    fireEvent.press(await screen.findByTestId("zone-A"));
    expect(screen.getByTestId("zone-A-selected")).toBeOnTheScreen();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("tapping another zone moves the selection", async () => {
    renderWithProviders(<ParkScreen />);

    fireEvent.press(await screen.findByTestId("zone-A"));
    fireEvent.press(screen.getByTestId("zone-B"));

    expect(screen.getByTestId("zone-B-selected")).toBeOnTheScreen();
    expect(screen.queryByTestId("zone-A-selected")).not.toBeOnTheScreen();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("marks full zones as unselectable and explains why", async () => {
    renderWithProviders(<ParkScreen />);

    await screen.findByTestId("zone-C");
    expect(screen.getByTestId("zone-C-unavailable")).toHaveTextContent(/No spaces available/);
    expect(screen.getByTestId("zone-C").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId("zone-C"));
    expect(screen.queryByTestId("zone-C-selected")).not.toBeOnTheScreen();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("does not allow selecting an offline zone", async () => {
    renderWithProviders(<ParkScreen />);

    await screen.findByTestId("zone-D");
    expect(screen.getByTestId("zone-D").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId("zone-D"));
    expect(screen.queryByTestId("zone-D-selected")).not.toBeOnTheScreen();
  });
});

describe("park screen: capacity indicator", () => {
  it("shows the occupancy ratio and percent for a normal zone", async () => {
    renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-A-occupancy-percent")).toHaveTextContent("15 of 20 · 75%"));
  });

  it("shows a full zone at 100% with zero available", async () => {
    renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-C-occupancy-percent")).toHaveTextContent("10 of 10 · 100%"));
    expect(screen.getByTestId("zone-C-available")).toHaveTextContent("0");
  });

  it("reflects low availability from backend numbers", async () => {
    renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-B-occupancy-percent")).toHaveTextContent("19 of 20 · 95%"));
  });

  it("renders a zero-capacity zone without NaN, Infinity or an invalid width", async () => {
    (api.zones as jest.Mock).mockResolvedValue([...zones, zoneZero]);
    renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-Z0-occupancy-percent")).toHaveTextContent("No capacity data"));
    const fill = flattenStyle(screen.getByTestId("zone-Z0-occupancy-fill").props.style);
    expect(fill.width).toBe("0%");
  });

  it("exposes an accessible occupancy summary on the zone card", async () => {
    renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-A")).toBeOnTheScreen());
    const label = screen.getByTestId("zone-A").props.accessibilityLabel;
    expect(label).toMatch(/15 of 20 spaces occupied/);
    expect(label).toMatch(/5 spaces available/);
    expect(label).toMatch(/75 percent occupied/);
  });
});

describe("park screen: reservations (phase 9.4)", () => {
  it("renders the reservation panel and a reservation for a selected zone", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([
      { id: "v1", userId: "u1", plateNumber: "ABC-1234", normalizedPlate: "ABC1234", vehicleType: "CAR", status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
    ]);
    // A real POST /reservations always returns the full confirmed hold (the
    // panel renders create.data.zone.name on success) — {} from the shared
    // beforeEach default would crash that render, which is exactly what a
    // realistic mock here is verifying against.
    const confirmed: ReservationResponse = {
      id: "r1",
      userId: "u1",
      vehicleId: "v1",
      zoneId: "z1",
      startAt: "2026-09-05T09:00:00.000Z",
      endAt: "2026-09-05T09:15:00.000Z",
      status: "CONFIRMED",
      createdAt: "2026-09-05T09:00:00.000Z",
      updatedAt: "2026-09-05T09:00:00.000Z",
      zone: { id: "z1", name: "Zone A", code: "A" },
      vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
    };
    (api.createReservation as jest.Mock).mockResolvedValue(confirmed);
    renderWithProviders(<ParkScreen />);

    fireEvent.press(await screen.findByTestId("zone-A"));
    fireEvent.press(await screen.findByTestId("parking-action-reserve"));
    const create = await screen.findByTestId("reservation-create");
    expect(create).toHaveTextContent("Reserve ABC-1234 in Zone A");

    fireEvent.press(create);
    await waitFor(() =>
      expect(api.createReservation).toHaveBeenCalledWith(
        expect.objectContaining({ zoneId: "z1", vehicleId: "v1" }),
      ),
    );
    expect(await screen.findByTestId("reservation-confirmed-mascot")).toHaveTextContent(
      "Reserved Zone A for you!",
    );
  });

  it("does not show the reservation panel while a session is active", async () => {
    (api.activeSession as jest.Mock).mockResolvedValue({
      id: "s1",
      zoneId: "z1",
      userId: "u1",
      vehicleId: "v1",
      entryEventId: "e1",
      exitEventId: null,
      enteredAt: new Date().toISOString(),
      exitedAt: null,
      durationSeconds: null,
      feeAmount: null,
      status: "ACTIVE",
      zone: { id: "z1", name: "Zone A", code: "A" },
      vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
      entryEvent: { id: "e1", detectedAt: new Date().toISOString() },
      exitEvent: null,
    });
    renderWithProviders(<ParkScreen />);
    await waitFor(() => expect(screen.getByTestId("zones-grid")).toBeOnTheScreen());
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

describe("park screen: connection honesty", () => {
  it("shows the real connection state instead of a live or 30-second claim", async () => {
    renderWithProviders(<ParkScreen />);
    await waitFor(() => expect(screen.getByTestId("park-screen-subtitle")).toHaveTextContent(/^Not live · Updated \d{2}:\d{2}$/));
    expect(screen.queryByText(/live gate-camera availability/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/every 30 seconds/i)).not.toBeOnTheScreen();
  });
});

describe("park screen: shares the tab area's vehicle choice", () => {
  /** Stands in for the Now tab: picks a plate in the shared (layout-level) selection. */
  function PickOnAnotherTab({ vehicleId }: { vehicleId: string }) {
    const { select } = useVehicleSelection();
    useEffect(() => select(vehicleId), [select, vehicleId]);
    return null;
  }

  it("uses a plate picked elsewhere instead of mounting its own selection", async () => {
    const v1 = {
      id: "v1", userId: "u1", plateNumber: "ABC-1234", normalizedPlate: "ABC1234", vehicleType: "CAR",
      make: null, model: null, color: null, status: "ACTIVE", isPrimary: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    (api.vehicles as jest.Mock).mockResolvedValue([v1, { ...v1, id: "v2", plateNumber: "XYZ-5678", normalizedPlate: "XYZ5678" }]);

    // renderWithProviders supplies the one VehicleSelectionProvider, as (tabs)/_layout does.
    renderWithProviders(
      <>
        <PickOnAnotherTab vehicleId="v2" />
        <ParkScreen />
      </>,
    );

    fireEvent.press(await screen.findByTestId("zone-A"));
    // The Zones panel already knows the plate: no "choose a vehicle" nag, and
    // the plate it will submit is the one picked on the other tab.
    await waitFor(() => expect(screen.getByTestId("assignment-vehicles")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-vehicle-hint")).not.toBeOnTheScreen();
    const compact = screen.queryByTestId("assignment-vehicle-compact");
    if (compact) {
      expect(compact).toHaveTextContent(/XYZ-5678/);
    } else {
      expect(screen.getByTestId("assignment-vehicle-v2").props.accessibilityState).toMatchObject({ selected: true });
    }
  });
});
