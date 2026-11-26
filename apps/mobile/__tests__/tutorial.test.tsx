import { __router } from "expo-router";
import type { Vehicle } from "@parada/types";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { api } from "@/lib/api/client";
import { configureTutorialStore, markTutorialDone, shouldShowTutorial, tutorialKey } from "@/lib/tutorial";
import TutorialScreen from "@/app/tutorial";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return { ...actual, api: { vehicles: jest.fn(), createVehicle: jest.fn(), setPrimaryVehicle: jest.fn() } };
});

jest.mock("@/src/providers/SessionProvider", () => ({
  useSession: () => ({ user: { id: "u1", name: "Alex Reyes", email: "alex@parada.test" } }),
}));

const vehicle = (over: Partial<Vehicle>): Vehicle => ({
  id: "v1",
  userId: "u1",
  plateNumber: "NBC4821",
  normalizedPlate: "NBC4821",
  vehicleType: "CAR",
  make: null,
  model: null,
  color: null,
  status: "ACTIVE",
  isPrimary: true,
  createdAt: new Date("2026-11-24T00:00:00.000Z"),
  updatedAt: new Date("2026-11-24T00:00:00.000Z"),
  ...over,
});

let marked = new Set<string>();
beforeEach(() => {
  jest.clearAllMocks();
  marked = new Set();
  configureTutorialStore({ read: async (k) => marked.has(k), write: async (k) => void marked.add(k) });
});
afterAll(() => configureTutorialStore(null));

describe("tutorial trigger", () => {
  it("shows for a signed-in driver with no active vehicle", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle({ status: "INACTIVE" })]);
    await expect(shouldShowTutorial("alex@parada.test")).resolves.toBe(true);
  });

  it("does not show once the driver has a vehicle", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle({})]);
    await expect(shouldShowTutorial("alex@parada.test")).resolves.toBe(false);
  });

  it("does not show again after it was finished or skipped", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([]);
    await markTutorialDone("Alex@Parada.test ");
    await expect(shouldShowTutorial("alex@parada.test")).resolves.toBe(false);
  });

  it("never blocks sign-in when vehicles can't be loaded", async () => {
    (api.vehicles as jest.Mock).mockRejectedValue(new Error("offline"));
    await expect(shouldShowTutorial("alex@parada.test")).resolves.toBe(false);
  });

  it("keys the marker by a hash, not the email address", () => {
    expect(tutorialKey("alex@parada.test")).not.toContain("alex");
    expect(tutorialKey("alex@parada.test")).toBe(tutorialKey(" ALEX@parada.test"));
  });
});

describe("tutorial screen", () => {
  async function walkToForm() {
    await renderWithProviders(<TutorialScreen />);
    expect(screen.getByTestId("tutorial-title")).toHaveTextContent("Welcome, Alex.");
    await fireEvent.press(screen.getByTestId("tutorial-next"));
    expect(screen.getByTestId("tutorial-title")).toHaveTextContent("Your plate is your ticket.");
    await fireEvent.press(screen.getByTestId("tutorial-next"));
    expect(screen.getByTestId("tutorial-next")).toHaveTextContent("Add my vehicle");
    await fireEvent.press(screen.getByTestId("tutorial-next"));
  }

  it("ends by asking for the vehicle, with primary locked on for the first one", async () => {
    await walkToForm();
    expect(screen.getByText("Add your vehicle")).toBeOnTheScreen();
    expect(screen.getByTestId("vehicle-primary-switch")).toHaveProp("value", true);
    expect(screen.getByTestId("vehicle-primary-switch")).toHaveProp("disabled", true);
  });

  it("adds the first vehicle and shows it as primary and selected for parking", async () => {
    (api.createVehicle as jest.Mock).mockResolvedValue(vehicle({}));
    await walkToForm();
    await fireEvent.changeText(screen.getByTestId("vehicle-plate"), "nbc 4821");
    await fireEvent.press(screen.getByTestId("vehicle-submit"));
    expect(await screen.findByTestId("tutorial-pass")).toHaveTextContent(/NBC4821/);
    expect(screen.getByText("Primary")).toBeOnTheScreen();
    expect(screen.getByText("Selected for parking")).toBeOnTheScreen();
    expect(api.setPrimaryVehicle).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("tutorial-start"));
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith("/(tabs)/parking"));
    expect(marked.has(tutorialKey("alex@parada.test"))).toBe(true);
  });

  it("lets a second vehicle become primary, and the summary follows it", async () => {
    (api.createVehicle as jest.Mock)
      .mockResolvedValueOnce(vehicle({}))
      .mockResolvedValueOnce(vehicle({ id: "v2", plateNumber: "XYZ9087", normalizedPlate: "XYZ9087", isPrimary: false }));
    (api.setPrimaryVehicle as jest.Mock).mockResolvedValue(vehicle({ id: "v2", plateNumber: "XYZ9087", isPrimary: true }));
    (api.vehicles as jest.Mock).mockResolvedValue([
      vehicle({ isPrimary: false }),
      vehicle({ id: "v2", plateNumber: "XYZ9087", normalizedPlate: "XYZ9087", isPrimary: true }),
    ]);
    await walkToForm();
    await fireEvent.changeText(screen.getByTestId("vehicle-plate"), "NBC4821");
    await fireEvent.press(screen.getByTestId("vehicle-submit"));
    await fireEvent.press(await screen.findByTestId("tutorial-add-another"));
    const sw = screen.getByTestId("vehicle-primary-switch");
    expect(sw).toHaveProp("disabled", false);
    await fireEvent(sw, "valueChange", true);
    await fireEvent.changeText(screen.getByTestId("vehicle-plate"), "XYZ9087");
    await fireEvent.press(screen.getByTestId("vehicle-submit"));
    await waitFor(() => expect(api.setPrimaryVehicle).toHaveBeenCalledWith("v2"));
    expect(await screen.findByTestId("tutorial-selected")).toHaveTextContent(/XYZ9087/);
  });

  it("can back out of adding a second vehicle", async () => {
    (api.createVehicle as jest.Mock).mockResolvedValue(vehicle({}));
    await walkToForm();
    await fireEvent.changeText(screen.getByTestId("vehicle-plate"), "NBC4821");
    await fireEvent.press(screen.getByTestId("vehicle-submit"));
    await fireEvent.press(await screen.findByTestId("tutorial-add-another"));
    await fireEvent.press(screen.getByTestId("tutorial-another-back"));
    expect(screen.getByTestId("tutorial-pass")).toBeOnTheScreen();
  });

  it("treats a vehicle as added when only making it primary failed", async () => {
    (api.createVehicle as jest.Mock)
      .mockResolvedValueOnce(vehicle({}))
      .mockResolvedValueOnce(vehicle({ id: "v2", plateNumber: "XYZ9087", isPrimary: false }));
    (api.setPrimaryVehicle as jest.Mock).mockRejectedValue(new Error("network"));
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle({}), vehicle({ id: "v2", plateNumber: "XYZ9087", isPrimary: false })]);
    await walkToForm();
    await fireEvent.changeText(screen.getByTestId("vehicle-plate"), "NBC4821");
    await fireEvent.press(screen.getByTestId("vehicle-submit"));
    await fireEvent.press(await screen.findByTestId("tutorial-add-another"));
    await fireEvent(screen.getByTestId("vehicle-primary-switch"), "valueChange", true);
    await fireEvent.changeText(screen.getByTestId("vehicle-plate"), "XYZ9087");
    await fireEvent.press(screen.getByTestId("vehicle-submit"));
    // Moves on to the summary instead of leaving a form whose retry would 422.
    expect(await screen.findByTestId("tutorial-selected")).toHaveTextContent(/NBC4821/);
    expect(api.createVehicle).toHaveBeenCalledTimes(2);
  });

  it("lets the driver skip adding a vehicle for now", async () => {
    await walkToForm();
    await fireEvent.press(screen.getByTestId("tutorial-later"));
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith("/(tabs)/parking"));
    expect(api.createVehicle).not.toHaveBeenCalled();
  });
});
