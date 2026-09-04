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

  it("omits the banner when there is no active session", async () => {
    renderWithProviders(<ParkingScreen />);
    await waitFor(() => expect(screen.getByText("Available")).toBeOnTheScreen());
    expect(screen.queryByTestId("active-banner")).not.toBeOnTheScreen();
  });
});