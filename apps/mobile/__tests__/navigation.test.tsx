import { renderWithAppProviders, renderWithProviders, screen } from "@/src/test/utils";
import ParkingScreen from "@/app/(tabs)/parking";
import VehiclesScreen from "@/app/(tabs)/vehicles";
import SessionsScreen from "@/app/(tabs)/sessions";
import AccountScreen from "@/app/(tabs)/account";
import { api, type PublicZone, type SessionDto } from "@/lib/api/client";
import type { Vehicle } from "@parada/types";

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

const user = {
  id: "u1",
  name: "Alex Driver",
  email: "alex@parada.test",
  role: "USER",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
};

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

const vehicles: Vehicle[] = [
  {
    id: "v1",
    userId: "u1",
    plateNumber: "XYZ-5678",
    normalizedPlate: "XYZ5678",
    vehicleType: "CAR",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

const completed: SessionDto = {
  id: "s1",
  zoneId: "z1",
  userId: "u1",
  vehicleId: "v1",
  entryEventId: "e1",
  exitEventId: "e2",
  enteredAt: new Date(2026, 8, 1, 10, 0, 0).toISOString(),
  exitedAt: new Date(2026, 8, 1, 10, 51, 0).toISOString(),
  durationSeconds: 3060,
  feeAmount: null,
  status: "COMPLETED",
  zone: { id: "z1", name: "Zone A", code: "A" },
  vehicle: { id: "v1", plateNumber: "XYZ-5678", vehicleType: "CAR" },
  entryEvent: { id: "e1", detectedAt: new Date(2026, 8, 1, 10, 0, 0).toISOString() },
  exitEvent: { id: "e2", detectedAt: new Date(2026, 8, 1, 10, 51, 0).toISOString() },
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.me as jest.Mock).mockResolvedValue(user);
  (api.zones as jest.Mock).mockResolvedValue(zones);
  (api.activeSession as jest.Mock).mockResolvedValue(null);
  (api.vehicles as jest.Mock).mockResolvedValue(vehicles);
  (api.sessions as jest.Mock).mockResolvedValue([completed]);
  (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
  (api.assignments as jest.Mock).mockResolvedValue([]);
  (api.createAssignment as jest.Mock).mockResolvedValue({});
  (api.reservations as jest.Mock).mockResolvedValue([]);
  (api.establishment as jest.Mock).mockResolvedValue({ location: null });
});

describe("tab route smoke tests", () => {
  it("renders the Parking route", async () => {
    renderWithProviders(<ParkingScreen />);
    expect(await screen.findByTestId("parking-screen-title")).toHaveTextContent("Parking");
  });

  it("renders the Vehicles route", async () => {
    renderWithProviders(<VehiclesScreen />);
    expect(await screen.findByTestId("vehicles-list")).toBeOnTheScreen();
  });

  it("renders the Sessions route", async () => {
    renderWithProviders(<SessionsScreen />);
    expect(await screen.findByTestId("sessions-list")).toBeOnTheScreen();
  });

  it("renders the Account route", async () => {
    renderWithAppProviders(<AccountScreen />);
    expect(await screen.findByTestId("account-screen-title")).toHaveTextContent("Account");
  });
});