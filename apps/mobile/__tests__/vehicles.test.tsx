import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import VehiclesScreen from "@/app/(tabs)/vehicles";
import { api, ApiError } from "@/lib/api/client";
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
    },
  };
});

const baseVehicle = (over: Partial<Vehicle>): Vehicle => ({
  id: "v1",
  userId: "u1",
  plateNumber: "XYZ-5678",
  normalizedPlate: "XYZ5678",
  vehicleType: "MOTORCYCLE",
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...over,
});

const vehicles: Vehicle[] = [
  baseVehicle({}),
  baseVehicle({ id: "v2", plateNumber: "ABC-1234", normalizedPlate: "ABC1234", vehicleType: "CAR" }),
];

const addedVehicle: Vehicle = baseVehicle({
  id: "v3",
  plateNumber: "QRS-9999",
  normalizedPlate: "QRS9999",
  vehicleType: "MOTORCYCLE",
});

beforeEach(() => {
  jest.clearAllMocks();
  (api.vehicles as jest.Mock).mockResolvedValue(vehicles);
});

describe("vehicles screen", () => {
  it("lists registered vehicles with plates and types", async () => {
    renderWithProviders(<VehiclesScreen />);

    expect(await screen.findByText("XYZ-5678")).toBeOnTheScreen();
    expect(screen.getByText("ABC-1234")).toBeOnTheScreen();
    expect(screen.getAllByText("Motorcycle").length).toBeGreaterThan(0);
    expect(screen.getByText("2 registered")).toBeOnTheScreen();
  });

  it("shows an empty state when there are no vehicles", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([]);
    renderWithProviders(<VehiclesScreen />);

    expect(await screen.findByText("No vehicles registered")).toBeOnTheScreen();
  });

  it("adds a vehicle and refreshes the list", async () => {
    (api.createVehicle as jest.Mock).mockResolvedValue(addedVehicle);
    (api.vehicles as jest.Mock)
      .mockResolvedValueOnce(vehicles)
      .mockResolvedValue([...vehicles, addedVehicle]);

    renderWithProviders(<VehiclesScreen />);

    fireEvent.press(await screen.findByTestId("vehicles-add-button"));
    fireEvent.changeText(screen.getByTestId("vehicle-plate"), "qrs-9999");
    fireEvent.press(screen.getByTestId("vehicle-type-MOTORCYCLE"));
    fireEvent.press(screen.getByTestId("vehicle-submit"));

    await waitFor(() => expect(api.createVehicle).toHaveBeenCalledWith("QRS9999", "MOTORCYCLE"));
    await waitFor(() => expect(screen.getByText("QRS-9999")).toBeOnTheScreen());
    expect(api.vehicles).toHaveBeenCalledTimes(2);
  });

  it("surfaces duplicate-plate 422 errors inline", async () => {
    (api.createVehicle as jest.Mock).mockRejectedValue(
      new ApiError("UNPROCESSABLE", "You already have a vehicle with this plate number.", 422),
    );

    renderWithProviders(<VehiclesScreen />);

    fireEvent.press(await screen.findByTestId("vehicles-add-button"));
    fireEvent.changeText(screen.getByTestId("vehicle-plate"), "ABC-1234");
    fireEvent.press(screen.getByTestId("vehicle-submit"));

    await waitFor(() =>
      expect(screen.getByText("You already have a vehicle with this plate number.")).toBeOnTheScreen(),
    );
  });

  it("rejects an empty plate locally", async () => {
    renderWithProviders(<VehiclesScreen />);

    fireEvent.press(await screen.findByTestId("vehicles-add-button"));
    fireEvent.changeText(screen.getByTestId("vehicle-plate"), "   ");
    fireEvent.press(screen.getByTestId("vehicle-submit"));

    expect(screen.getByText("Enter a plate number.")).toBeOnTheScreen();
    expect(api.createVehicle).not.toHaveBeenCalled();
  });
});