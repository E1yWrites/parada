import { act, fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { __router, useLocalSearchParams } from "expo-router";
import { queryKeys } from "@/lib/query";
import ParkScreen from "@/app/(tabs)/park";
import { useEffect } from "react";
import { useVehicleSelection } from "@/src/components/VehicleSelection";
import { api, ApiError, type PublicZone } from "@/lib/api/client";
import type { ReservationResponse, ZoneAssignmentResponse } from "@parada/types";

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
      vehicles: jest.fn(),
      createVehicle: jest.fn(),
      sessions: jest.fn(),
      activeSession: jest.fn(),
      recommendedZone: jest.fn(),
      assignments: jest.fn(),
      createAssignment: jest.fn(),
      cancelAssignment: jest.fn(),
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
    await renderWithProviders(<ParkScreen />);

    // "Available" is the normal case and is left unsaid; only exceptions get a badge.
    await waitFor(() => expect(screen.getByText("Few spaces")).toBeOnTheScreen());
    expect(screen.queryByText("Available")).not.toBeOnTheScreen();
    expect(screen.getByText("Full")).toBeOnTheScreen();
    expect(screen.getByText("Offline")).toBeOnTheScreen();
    expect(screen.getByTestId("zone-A-available")).toHaveTextContent("5");
    expect(screen.getByTestId("zone-C-available")).toHaveTextContent("0");
  });

  it("shows a loading state while zones resolve", async () => {
    let resolveZones!: (value: PublicZone[]) => void;
    (api.zones as jest.Mock).mockReturnValue(
      new Promise<PublicZone[]>((r) => {
        resolveZones = r;
      }),
    );

    await renderWithProviders(<ParkScreen />);

    expect(screen.getByTestId("zones-loading")).toBeOnTheScreen();
    resolveZones(zones);
  });

  it("shows an error and recovers via retry", async () => {
    (api.zones as jest.Mock)
      .mockRejectedValueOnce(new ApiError("BAD_GATEWAY", "The server is down.", 502))
      .mockResolvedValueOnce(zones);

    await renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByText("The server is down.")).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId("zones-error-retry"));

    await waitFor(() => expect(screen.getByTestId("zone-A-available")).toBeOnTheScreen());
    expect(api.zones).toHaveBeenCalledTimes(2);
  });
});

describe("park screen: manual zone selection (phase 9.3)", () => {
  it("selecting a zone is local UI state only (no assignment request)", async () => {
    await renderWithProviders(<ParkScreen />);

    await fireEvent.press(await screen.findByTestId("zone-A"));
    expect(screen.getByTestId("zone-A").props.accessibilityState).toMatchObject({ checked: true });
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("tapping another zone moves the selection", async () => {
    await renderWithProviders(<ParkScreen />);

    await fireEvent.press(await screen.findByTestId("zone-A"));
    await fireEvent.press(screen.getByTestId("zone-B"));

    expect(screen.getByTestId("zone-B").props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId("zone-A").props.accessibilityState).toMatchObject({ checked: false });
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("marks full zones as unselectable and explains why", async () => {
    await renderWithProviders(<ParkScreen />);

    await screen.findByTestId("zone-C");
    expect(screen.getByTestId("zone-C-unavailable")).toHaveTextContent(/No spaces available/);
    expect(screen.getByTestId("zone-C").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId("zone-C"));
    expect(screen.getByTestId("zone-C").props.accessibilityState).toMatchObject({ checked: false });
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("does not allow selecting an offline zone", async () => {
    await renderWithProviders(<ParkScreen />);

    await screen.findByTestId("zone-D");
    expect(screen.getByTestId("zone-D").props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId("zone-D"));
    expect(screen.getByTestId("zone-D").props.accessibilityState).toMatchObject({ checked: false });
  });

  it("pre-selects the zone handed over by zone detail (?zone=<id>)", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ zone: "z2" });
    try {
      await renderWithProviders(<ParkScreen />);
      await screen.findByTestId("zone-B");
      expect(screen.getByTestId("zone-B").props.accessibilityState).toMatchObject({ checked: true });
      expect(screen.getByTestId("zone-A").props.accessibilityState).toMatchObject({ checked: false });
      expect(api.createAssignment).not.toHaveBeenCalled();
    } finally {
      (useLocalSearchParams as jest.Mock).mockReturnValue({});
    }
  });

  it("keeps the details link out of the zone radio (one role per control)", async () => {
    await renderWithProviders(<ParkScreen />);

    await screen.findByTestId("zone-A");
    const details = screen.getByTestId("zone-A-details");
    expect(details.props.accessibilityRole).toBe("link");
    // Not a descendant of the radio: pressing it must not select the zone.
    await fireEvent.press(details);
    expect(screen.getByTestId("zone-A").props.accessibilityState).toMatchObject({ checked: false });
  });
});

describe("park screen: least busy zone (redesign)", () => {
  it("tags only the backend's least-occupied zone, and never calls it a recommendation", async () => {
    (api.recommendedZone as jest.Mock).mockResolvedValue({
      recommendedZone: { id: "z1", name: "Zone A", code: "A", capacity: 20, occupiedCount: 15, availableCount: 5, status: "ACTIVE" },
    });
    await renderWithProviders(<ParkScreen />);

    expect(await screen.findByTestId("zone-A-least-busy")).toHaveTextContent(/Least busy/);
    expect(screen.queryByTestId("zone-B-least-busy")).not.toBeOnTheScreen();
    expect(screen.getByTestId("zone-A").props.accessibilityLabel).toMatch(/Least busy zone\./);
    expect(screen.queryByText(/recommended/i)).not.toBeOnTheScreen();
  });

  it("offers the least-busy zone up top and Choose selects it", async () => {
    (api.recommendedZone as jest.Mock).mockResolvedValue({
      recommendedZone: { id: "z1", name: "Zone A", code: "A", capacity: 20, occupiedCount: 15, availableCount: 5, status: "ACTIVE" },
    });
    await renderWithProviders(<ParkScreen />);

    expect(await screen.findByTestId("zones-least-busy-card")).toHaveTextContent(/Least busy now/);
    await fireEvent.press(screen.getByTestId("zones-least-busy-choose"));
    expect(screen.getByTestId("zone-A").props.accessibilityState).toMatchObject({ checked: true });
    // Once chosen, the shortcut steps aside.
    expect(screen.queryByTestId("zones-least-busy-card")).not.toBeOnTheScreen();
  });

  it("still lists every zone when the least-busy lookup fails (409 or network)", async () => {
    (api.recommendedZone as jest.Mock).mockRejectedValue(new ApiError("CONFLICT", "No suitable zone is currently available.", 409));
    await renderWithProviders(<ParkScreen />);

    expect(await screen.findByTestId("zone-A")).toBeOnTheScreen();
    expect(screen.queryByTestId("zone-A-least-busy")).not.toBeOnTheScreen();
    expect(screen.queryByText(/409|CONFLICT|No suitable zone/)).toBeNull();
  });

  it("shows no tag when the backend has no pick", async () => {
    await renderWithProviders(<ParkScreen />);

    await screen.findByTestId("zone-A");
    expect(screen.queryByTestId("zone-A-least-busy")).not.toBeOnTheScreen();
  });
});

describe("park screen: action labels match their domain effect (redesign)", () => {
  it("names the two actions by what they do, not 'Park now' / 'Reserve for later'", async () => {
    await renderWithProviders(<ParkScreen />);

    // The two actions live in the sheet that opens when a zone is tapped.
    expect(screen.queryByTestId("zone-sheet")).not.toBeOnTheScreen();
    await fireEvent.press(await screen.findByTestId("zone-A"));
    expect(await screen.findByTestId("zone-sheet")).toBeOnTheScreen();
    expect(screen.getByTestId("parking-action-assign")).toHaveTextContent("Go to this zone");
    expect(screen.getByTestId("parking-action-reserve")).toHaveTextContent("Reserve a space");
    expect(screen.queryByText(/park now/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/for later/i)).not.toBeOnTheScreen();
    // No copy that points at a control on another tab.
    expect(screen.queryByText(/Current parking|Park tab|Sessions tab/)).toBeNull();
  });
});

describe("park screen: capacity indicator", () => {
  it("shows the occupancy ratio and percent for a normal zone", async () => {
    await renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-A-occupancy-percent")).toHaveTextContent("15 of 20 · 75%"));
  });

  it("shows a full zone at 100% with zero available", async () => {
    await renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-C-occupancy-percent")).toHaveTextContent("10 of 10 · 100%"));
    expect(screen.getByTestId("zone-C-available")).toHaveTextContent("0");
  });

  it("reflects low availability from backend numbers", async () => {
    await renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-B-occupancy-percent")).toHaveTextContent("19 of 20 · 95%"));
  });

  it("renders a zero-capacity zone without NaN, Infinity or an invalid width", async () => {
    (api.zones as jest.Mock).mockResolvedValue([...zones, zoneZero]);
    await renderWithProviders(<ParkScreen />);

    await waitFor(() => expect(screen.getByTestId("zone-Z0-occupancy-percent")).toHaveTextContent("No capacity data"));
    const fill = flattenStyle(screen.getByTestId("zone-Z0-occupancy-fill").props.style);
    expect(fill.width).toBe("0%");
  });

  it("exposes an accessible occupancy summary on the zone card", async () => {
    await renderWithProviders(<ParkScreen />);

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
    (api.reservations as jest.Mock).mockResolvedValueOnce([]).mockResolvedValue([confirmed]);
    await renderWithProviders(<ParkScreen />);

    await fireEvent.press(await screen.findByTestId("zone-A"));
    await fireEvent.press(await screen.findByTestId("parking-action-reserve"));
    const create = await screen.findByTestId("reservation-create");
    expect(create).toHaveTextContent("Reserve ABC-1234 in Zone A");

    await fireEvent.press(create);
    await waitFor(() =>
      expect(api.createReservation).toHaveBeenCalledWith(
        expect.objectContaining({ zoneId: "z1", vehicleId: "v1" }),
      ),
    );
    // Plain confirmation of what the backend did (no mascot, no "for you!").
    expect(await screen.findByTestId("zones-current-plan")).toHaveTextContent(
      /Reserved Zone A\. Space kept .+ – .+\./,
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
    await renderWithProviders(<ParkScreen />);
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
    await renderWithProviders(<ParkScreen />);
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
    await renderWithProviders(
      <>
        <PickOnAnotherTab vehicleId="v2" />
        <ParkScreen />
      </>,
    );

    await fireEvent.press(await screen.findByTestId("zone-A"));
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

describe("park screen: reserve for a later arrival (redesign)", () => {
  const confirmed = {
    id: "r1",
    userId: "u1",
    vehicleId: "v1",
    zoneId: "z1",
    startAt: "2026-09-05T09:30:00.000Z",
    endAt: "2026-09-05T09:45:00.000Z",
    status: "CONFIRMED",
    createdAt: "2026-09-05T09:00:00.000Z",
    updatedAt: "2026-09-05T09:00:00.000Z",
    zone: { id: "z1", name: "Zone A", code: "A" },
    vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
  } as ReservationResponse;
  const car = {
    id: "v1", userId: "u1", plateNumber: "ABC-1234", normalizedPlate: "ABC1234", vehicleType: "CAR",
    make: null, model: null, color: null, status: "ACTIVE", isPrimary: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const activeAssignment = {
    id: "a1", userId: "u1", vehicleId: "v1", zoneId: "z2", status: "ACTIVE",
    assignedAt: "2026-09-05T09:00:00.000Z", expiresAt: new Date(Date.now() + 600_000).toISOString(),
    createdAt: "2026-09-05T09:00:00.000Z", updatedAt: "2026-09-05T09:00:00.000Z",
    zone: { id: "z2", name: "Zone B", code: "B" },
    vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
  } as ZoneAssignmentResponse;

  it("offers no second plan while a reservation exists", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([car]);
    (api.reservations as jest.Mock).mockResolvedValue([confirmed]);
    await renderWithProviders(<ParkScreen />);

    expect(await screen.findByTestId("zones-current-plan")).toHaveTextContent(/Reserved Zone A\. Space kept/);
    expect(screen.queryByTestId("assignment-submit")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-create")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("parking-action-toggle")).not.toBeOnTheScreen();
    expect(screen.getByTestId("zone-A").props.accessibilityState?.selected).toBeFalsy();
  });

  it("drops a zone selected before a plan was created", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([car]);
    (api.createReservation as jest.Mock).mockResolvedValue(confirmed);
    (api.reservations as jest.Mock).mockResolvedValueOnce([]).mockResolvedValue([confirmed]);
    await renderWithProviders(<ParkScreen />);

    await fireEvent.press(await screen.findByTestId("zone-A"));
    await fireEvent.press(await screen.findByTestId("parking-action-reserve"));
    await fireEvent.press(await screen.findByTestId("reservation-create"));

    expect(await screen.findByTestId("zones-current-plan")).toBeOnTheScreen();
    expect(screen.queryByTestId("parking-action-toggle")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-create")).not.toBeOnTheScreen();
  });

  it("brings the panels back, with no stale 'Assigned to', once an assignment is cancelled", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([car]);
    (api.assignments as jest.Mock).mockResolvedValue([activeAssignment]);
    const { client } = await renderWithProviders(<ParkScreen />);
    expect(await screen.findByTestId("zones-current-plan")).toHaveTextContent(/assigned to Zone B/);
    expect(screen.queryByTestId("assignment-submit")).not.toBeOnTheScreen();

    await act(async () => {
      client.setQueryData(queryKeys.assignments, [{ ...activeAssignment, status: "CANCELLED" }]);
    });

    await waitFor(() => expect(screen.queryByTestId("zones-current-plan")).not.toBeOnTheScreen());
    // Zones are choosable again: tapping one opens the sheet with the action.
    await fireEvent.press(screen.getByTestId("zone-A"));
    expect(await screen.findByTestId("assignment-submit")).toBeOnTheScreen();
    expect(screen.queryByText(/Assigned to/)).not.toBeOnTheScreen();
  });

  it("sends startAt 30 minutes ahead for 'In 30 min' and never sends endAt", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([car]);
    (api.createReservation as jest.Mock).mockResolvedValue(confirmed);
    await renderWithProviders(<ParkScreen />);

    await fireEvent.press(await screen.findByTestId("zone-A"));
    await fireEvent.press(await screen.findByTestId("parking-action-reserve"));
    await fireEvent.press(await screen.findByTestId("reservation-start-30"));
    expect(screen.getByTestId("reservation-start-preview")).toHaveTextContent(/^A space is kept for you from \d{2}:\d{2}\.$/);

    const before = Date.now();
    await fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    const input = (api.createReservation as jest.Mock).mock.calls[0][0];
    expect(input).not.toHaveProperty("endAt");
    const offsetMin = (new Date(input.startAt).getTime() - before) / 60_000;
    expect(offsetMin).toBeGreaterThanOrEqual(29.9);
    expect(offsetMin).toBeLessThanOrEqual(30.1);
  });

  it("defaults to Now and shows the window the backend returned, with a button to Now", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([car]);
    (api.createReservation as jest.Mock).mockResolvedValue(confirmed);
    (api.reservations as jest.Mock).mockResolvedValueOnce([]).mockResolvedValue([confirmed]);
    await renderWithProviders(<ParkScreen />);

    await fireEvent.press(await screen.findByTestId("zone-A"));
    await fireEvent.press(await screen.findByTestId("parking-action-reserve"));
    expect(screen.getByTestId("reservation-start-now").props.accessibilityState).toMatchObject({ selected: true });
    const before = Date.now();
    await fireEvent.press(await screen.findByTestId("reservation-create"));
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    const input = (api.createReservation as jest.Mock).mock.calls[0][0];
    expect(Math.abs(new Date(input.startAt).getTime() - before)).toBeLessThan(5_000);

    expect(await screen.findByTestId("zones-current-plan")).toHaveTextContent(/Space kept/);
    expect(screen.getByTestId("zones-open-now")).toBeOnTheScreen();
    // Selecting another plan type is no longer possible once one exists.
    expect(screen.queryByTestId("parking-action-toggle")).not.toBeOnTheScreen();
  });
});

describe("park screen: zone action sheet", () => {
  const car = {
    id: "v1", userId: "u1", plateNumber: "ABC-1234", normalizedPlate: "ABC1234", vehicleType: "CAR",
    make: null, model: null, color: null, status: "ACTIVE", isPrimary: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const activeAssignment = {
    id: "a1", userId: "u1", vehicleId: "v1", zoneId: "z1", status: "ACTIVE",
    assignedAt: "2026-09-05T09:00:00.000Z", expiresAt: new Date(Date.now() + 600_000).toISOString(),
    createdAt: "2026-09-05T09:00:00.000Z", updatedAt: "2026-09-05T09:00:00.000Z",
    zone: { id: "z1", name: "Zone A", code: "A" },
    vehicle: { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" },
  } as ZoneAssignmentResponse;

  it("opens on tap with the zone, both choices and the final button — and closes", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([car]);
    await renderWithProviders(<ParkScreen />);
    await fireEvent.press(await screen.findByTestId("zone-A"));
    expect(await screen.findByTestId("zone-sheet-title")).toHaveTextContent("Zone A");
    expect(await screen.findByTestId("assignment-submit")).toBeOnTheScreen();
    // No duplicate zone summary inside the sheet; its header already names the zone.
    expect(screen.queryByTestId("assignment-summary")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("parking-action-reserve"));
    expect(screen.getByTestId("reservation-create")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("zone-sheet-close"));
    await waitFor(() => expect(screen.queryByTestId("zone-sheet")).not.toBeOnTheScreen());
    expect(screen.getByTestId("zone-A").props.accessibilityState).toMatchObject({ checked: false });
  });

  it("goes to a zone in two taps: the zone, then the button", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([car]);
    (api.createAssignment as jest.Mock).mockResolvedValue(activeAssignment);
    await renderWithProviders(<ParkScreen />);
    await fireEvent.press(await screen.findByTestId("zone-A"));
    await fireEvent.press(await screen.findByTestId("assignment-submit"));
    await waitFor(() => expect(api.createAssignment).toHaveBeenCalled());
  });

  it("returns to Now once the zone is confirmed", async () => {
    __router.push.mockClear();
    (api.vehicles as jest.Mock).mockResolvedValue([car]);
    (api.createAssignment as jest.Mock).mockResolvedValue(activeAssignment);
    await renderWithProviders(<ParkScreen />);
    await fireEvent.press(await screen.findByTestId("zone-A"));
    await fireEvent.press(await screen.findByTestId("assignment-submit"));
    await waitFor(() => expect(__router.push).toHaveBeenCalledWith("/parking"));
  });

  it("changes zone: releases the current assignment, assigns the new one, back to Now", async () => {
    __router.push.mockClear();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ change: "1" });
    try {
      const assignedB = { ...activeAssignment, zoneId: "z2", zone: { id: "z2", name: "Zone B", code: "B" } };
      (api.vehicles as jest.Mock).mockResolvedValue([car]);
      (api.assignments as jest.Mock).mockResolvedValue([assignedB]);
      (api.cancelAssignment as jest.Mock).mockResolvedValue({ ...assignedB, status: "CANCELLED" });
      (api.createAssignment as jest.Mock).mockResolvedValue(activeAssignment);
      await renderWithProviders(<ParkScreen />);

      expect(await screen.findByTestId("zones-changing-notice")).toHaveTextContent(/Zone B stays yours until you confirm/);
      expect(screen.queryByTestId("zones-current-plan")).not.toBeOnTheScreen();
      // The zone you already have can't be picked again.
      expect(screen.getByTestId("zone-B").props.accessibilityState).toMatchObject({ disabled: true });

      await fireEvent.press(screen.getByTestId("zone-A"));
      expect(await screen.findByTestId("zone-sheet-replacing")).toHaveTextContent(/Moves you from Zone B/);
      expect(screen.queryByTestId("parking-action-toggle")).not.toBeOnTheScreen();
      await fireEvent.press(await screen.findByTestId("assignment-submit"));

      await waitFor(() => expect(api.createAssignment).toHaveBeenCalled());
      expect(api.cancelAssignment).toHaveBeenCalledWith("a1");
      expect((api.cancelAssignment as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (api.createAssignment as jest.Mock).mock.invocationCallOrder[0]!,
      );
      await waitFor(() => expect(__router.push).toHaveBeenCalledWith("/parking"));
      expect(__router.setParams).toHaveBeenCalledWith({ change: undefined });
    } finally {
      (useLocalSearchParams as jest.Mock).mockReturnValue({});
    }
  });
});
