import * as SecureStore from "expo-secure-store";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { ReservationPanel } from "@/src/components/ReservationPanel";
import { ZoneAssignmentPanel } from "@/src/components/ZoneAssignmentPanel";
import { api, type PublicZone } from "@/lib/api/client";
import type { Vehicle } from "@parada/types";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: {
      vehicles: jest.fn(),
      assignments: jest.fn(),
      createAssignment: jest.fn(),
      reservations: jest.fn(),
      createReservation: jest.fn(),
      cancelReservation: jest.fn(),
      zones: jest.fn(),
    },
  };
});

type SecureStoreMock = typeof SecureStore & { __reset: () => void };

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
  isPrimary: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const otherVehicle: Vehicle = {
  ...vehicle,
  id: "v2",
  plateNumber: "XYZ-5678",
  normalizedPlate: "XYZ5678",
};

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as SecureStoreMock).__reset?.();
  (api.vehicles as jest.Mock).mockResolvedValue([vehicle, otherVehicle]);
  (api.assignments as jest.Mock).mockResolvedValue([]);
  (api.reservations as jest.Mock).mockResolvedValue([]);
  (api.zones as jest.Mock).mockResolvedValue([zoneA]);
});

/**
 * Assignment and reservation are two ways to start the same parking action, so
 * the vehicle is chosen once for the action rather than once per panel. Each
 * panel used to own its own selection state, which made a driver with two
 * vehicles pick the same plate again in every panel on the screen.
 */
describe("the chosen vehicle belongs to the parking action, not to one panel", () => {
  it("carries a plate chosen in the assignment panel over to the reservation panel", async () => {
    renderWithProviders(
      <>
        <ZoneAssignmentPanel selectedZone={zoneA} />
        <ReservationPanel selectedZone={zoneA} />
      </>,
    );

    // Nothing is auto-picked while the choice is real.
    await waitFor(() => expect(screen.getByTestId("assignment-vehicle-v2")).toBeOnTheScreen());
    expect(screen.getByTestId("assignment-vehicle-hint")).toBeOnTheScreen();
    expect(screen.getByTestId("reservation-vehicle-hint")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("assignment-vehicle-v2"));

    // The reservation panel reflects the same choice without being touched.
    await waitFor(() =>
      expect(screen.getByTestId("reservation-vehicle-v2").props.accessibilityState).toMatchObject({
        selected: true,
      }),
    );
    expect(screen.getByTestId("reservation-vehicle-v1").props.accessibilityState.selected).toBe(
      false,
    );
    // With the action's vehicle settled, neither panel still nags for one.
    expect(screen.queryByTestId("assignment-vehicle-hint")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-vehicle-hint")).not.toBeOnTheScreen();
  });

  it("asks for no choice at all when the driver has a single vehicle", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);

    renderWithProviders(
      <>
        <ZoneAssignmentPanel selectedZone={zoneA} />
        <ReservationPanel selectedZone={zoneA} />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("assignment-vehicle")).toHaveTextContent(/ABC-1234/),
    );
    expect(screen.getByTestId("reservation-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.queryByTestId("assignment-vehicle-v1")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-vehicle-v1")).not.toBeOnTheScreen();
  });

  it("preselects the driver's primary vehicle, without forcing it over an explicit pick", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle, { ...otherVehicle, isPrimary: true }]);

    renderWithProviders(
      <>
        <ZoneAssignmentPanel selectedZone={zoneA} />
        <ReservationPanel selectedZone={zoneA} />
      </>,
    );

    // The primary is preselected: no hint nagging for a choice, and the
    // primary's chip already shows selected.
    await waitFor(() =>
      expect(screen.getByTestId("assignment-vehicle-v2").props.accessibilityState).toMatchObject({
        selected: true,
      }),
    );
    expect(screen.queryByTestId("assignment-vehicle-hint")).not.toBeOnTheScreen();

    // Picking the other vehicle overrides the primary for this action.
    fireEvent.press(screen.getByTestId("assignment-vehicle-v1"));
    await waitFor(() =>
      expect(screen.getByTestId("reservation-vehicle-v1").props.accessibilityState).toMatchObject({
        selected: true,
      }),
    );
    expect(screen.getByTestId("reservation-vehicle-v2").props.accessibilityState.selected).toBe(
      false,
    );
  });

  it("offers the add-vehicle route from every parking action when there is none", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([]);

    renderWithProviders(
      <>
        <ZoneAssignmentPanel selectedZone={zoneA} />
        <ReservationPanel selectedZone={zoneA} />
      </>,
    );

    await waitFor(() => expect(screen.getByTestId("assignment-add-vehicle")).toBeOnTheScreen());
    expect(screen.getByTestId("reservation-add-vehicle")).toBeOnTheScreen();
  });
});
