import * as SecureStore from "expo-secure-store";
import { Linking } from "react-native";
import * as LocationMock from "expo-location";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { ParkingRecommendation } from "@/src/components/ParkingRecommendation";
import { api, ApiError } from "@/lib/api/client";
import type { Vehicle, ZoneAssignmentResponse } from "@parada/types";

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
      establishment: jest.fn(),
    },
  };
});

type SecureStoreMock = typeof SecureStore & { __reset: () => void };

// Test fixtures mirroring the real backend response shapes.
const recZone = {
  recommendedZone: {
    id: "z2",
    name: "Zone B",
    code: "B",
    capacity: 20,
    occupiedCount: 8,
    availableCount: 12,
    status: "ACTIVE",
  },
};

const vehicle: Vehicle = {
  id: "v1",
  userId: "u1",
  plateNumber: "ABC-1234",
  normalizedPlate: "ABC1234",
  vehicleType: "CAR",
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const otherVehicle: Vehicle = {
  ...vehicle,
  id: "v2",
  plateNumber: "XYZ-5678",
  normalizedPlate: "XYZ5678",
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

const networkError = new ApiError("NETWORK", "Cannot reach the PARADA server. Check your connection and try again.", 0);

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as SecureStoreMock).__reset?.();
  (api.recommendedZone as jest.Mock).mockResolvedValue(recZone);
  (api.vehicles as jest.Mock).mockResolvedValue([vehicle]);
  (api.assignments as jest.Mock).mockResolvedValue([]);
  (api.createAssignment as jest.Mock).mockResolvedValue(assignment);
  (api.zones as jest.Mock).mockResolvedValue([]);
  (api.establishment as jest.Mock).mockResolvedValue({ location: null });
  (api.activeSession as jest.Mock).mockResolvedValue(null);
});

describe("parking recommendation: states", () => {
  it("shows a loading state while the recommendation resolves", () => {
    (api.recommendedZone as jest.Mock).mockReturnValue(new Promise(() => undefined));

    renderWithProviders(<ParkingRecommendation />);

    expect(screen.getByTestId("recommendation-loading")).toBeOnTheScreen();
  });

  it("renders the recommended zone with availability from backend numbers", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-zone")).toBeOnTheScreen());
    expect(screen.getByText("Zone B")).toBeOnTheScreen();
    expect(screen.getByTestId("recommendation-available")).toHaveTextContent("12");
    expect(screen.getByTestId("recommendation-occupancy-percent")).toHaveTextContent("8 of 20 · 40%");
  });

  it("exposes an accessible recommendation summary", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-zone")).toBeOnTheScreen());
    expect(screen.getByTestId("recommendation-zone").props.accessibilityLabel).toBe(
      "Recommended Zone B. 12 spaces available. 40 percent occupied.",
    );
  });

  it("labels the accept button with the recommended zone", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    expect(screen.getByTestId("accept-recommendation").props.accessibilityLabel).toBe(
      "Accept recommended Zone B.",
    );
  });

  it("shows a friendly empty state when the backend returns no recommendation", async () => {
    (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-empty")).toBeOnTheScreen());
    expect(screen.getByText("No suitable parking zone is currently available.")).toBeOnTheScreen();
    expect(screen.queryByTestId("accept-recommendation")).not.toBeOnTheScreen();
  });

  it("maps a 409 CONFLICT (no suitable zone) to the friendly empty state", async () => {
    (api.recommendedZone as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "No suitable zone is currently available.", 409),
    );
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-empty")).toBeOnTheScreen());
    expect(screen.getByText("No suitable parking zone is currently available.")).toBeOnTheScreen();
    expect(screen.queryByText(/409|CONFLICT|No suitable zone is currently available\./)).not.toBeOnTheScreen();
  });

  it("retries a 409 empty state and recovers", async () => {
    (api.recommendedZone as jest.Mock)
      .mockRejectedValueOnce(new ApiError("CONFLICT", "No suitable zone is currently available.", 409))
      .mockResolvedValueOnce(recZone);
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-empty")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("recommendation-empty-retry"));

    await waitFor(() => expect(screen.getByTestId("recommendation-card")).toBeOnTheScreen());
    expect(api.recommendedZone).toHaveBeenCalledTimes(2);
  });

  it("shows a friendly retry state on a network failure", async () => {
    (api.recommendedZone as jest.Mock).mockRejectedValueOnce(networkError).mockResolvedValueOnce(recZone);
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-error")).toBeOnTheScreen());
    expect(screen.getByText(/Cannot reach the PARADA server/)).toBeOnTheScreen();
    expect(screen.queryByText(/NETWORK|status/i)).not.toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("recommendation-error-retry"));

    await waitFor(() => expect(screen.getByTestId("recommendation-card")).toBeOnTheScreen());
  });
});

describe("parking recommendation: vehicle requirement", () => {
  it("auto-uses the single active vehicle and shows it", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-vehicle")).toBeOnTheScreen());
    expect(screen.getByTestId("recommendation-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.queryByTestId("recommendation-no-vehicle")).not.toBeOnTheScreen();
  });

  it("requires an explicit vehicle choice when the user owns several", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle, otherVehicle]);
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("vehicle-choice-v1")).toBeOnTheScreen());
    expect(screen.getByTestId("accept-recommendation").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.press(screen.getByTestId("accept-recommendation"));
    expect(api.createAssignment).not.toHaveBeenCalled();
  });

  it("uses the explicitly chosen vehicle for the assignment", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle, otherVehicle]);
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("vehicle-choice-v2")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("vehicle-choice-v2"));
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(api.createAssignment).toHaveBeenCalledTimes(1));
    expect(api.createAssignment).toHaveBeenCalledWith({ zoneId: "z2", vehicleId: "v2" });
  });

  it("asks the user to add a vehicle instead of accepting", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([]);
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-no-vehicle")).toBeOnTheScreen());
    expect(screen.queryByTestId("accept-recommendation")).not.toBeOnTheScreen();
  });
});

describe("parking recommendation: accept recommendation", () => {
  it("accepts with the recommendation zone and the active vehicle", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(api.createAssignment).toHaveBeenCalledTimes(1));
    expect(api.createAssignment).toHaveBeenCalledWith({ zoneId: "z2", vehicleId: "v1" });
  });

  it("shows the confirmed assignment only after backend success and refreshes state", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(screen.getByTestId("assignment-confirmed")).toBeOnTheScreen());
    expect(screen.getByTestId("assignment-zone-name")).toHaveTextContent("Zone B");
    expect(screen.getByTestId("assignment-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.queryByTestId("accept-recommendation")).not.toBeOnTheScreen();

    // Recommendation + assignments are refreshed after the mutation settles
    // (the zone invalidation also prefix-matches the recommendation key).
    await waitFor(() =>
      expect((api.recommendedZone as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    await waitFor(() =>
      expect((api.assignments as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it("does not show assigned state when the assignment fails", async () => {
    (api.createAssignment as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "This vehicle already has an active zone assignment.", 409),
    );
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(screen.getByTestId("assignment-error")).toBeOnTheScreen());
    expect(screen.getByText("This vehicle already has an active zone assignment.")).toBeOnTheScreen();
    expect(screen.queryByTestId("assignment-confirmed")).not.toBeOnTheScreen();
    expect(screen.queryByText(/409|CONFLICT/)).not.toBeOnTheScreen();
  });

  it("preserves authentication when assignment fails (no revocation)", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-alive");
    (api.createAssignment as jest.Mock).mockRejectedValue(
      new ApiError("BAD_GATEWAY", "The server is down.", 502),
    );
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(screen.getByTestId("assignment-error")).toBeOnTheScreen());
    const token = await SecureStore.getItemAsync("parada.session.token");
    expect(token).toBe("tok-alive");
  });
});

describe("parking recommendation: existing assignment", () => {
  it("shows the assigned zone from the backend without an accept action", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("assignment-confirmed")).toBeOnTheScreen());
    expect(screen.getByTestId("assignment-zone-name")).toHaveTextContent("Zone B");
    expect(screen.getByTestId("assignment-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.queryByTestId("accept-recommendation")).not.toBeOnTheScreen();
    expect(api.createAssignment).not.toHaveBeenCalled();
  });
});

describe("parking recommendation: Phase 9.5 GPS navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (LocationMock as LocationModule).__reset();
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });

  it("shows navigation as unavailable when no destination is configured", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    (api.establishment as jest.Mock).mockResolvedValue({ location: null });
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("assignment-confirmed")).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByTestId("assignment-navigate")).toBeOnTheScreen());
    expect(screen.getByTestId("assignment-navigate")).toBeDisabled();
    expect(screen.getByTestId("assignment-navigate-unavailable")).toHaveTextContent(
      "Navigation isn't available right now.",
    );
  });

  it("navigates to the establishment from the configured destination + real device location", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    (api.establishment as jest.Mock).mockResolvedValue({
      location: { address: "123 Test Ave", latitude: 14.5502, longitude: 121.0402 },
    });
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition({ latitude: 14.5995, longitude: 120.9842 });
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("assignment-confirmed")).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByTestId("assignment-navigate")).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId("assignment-navigate"));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining("maps://?saddr=14.5995,120.9842&daddr=14.5502,121.0402"),
      ),
    );
    expect(api.createAssignment).not.toHaveBeenCalled();
    expect(api.cancelReservation).not.toHaveBeenCalled();
  });

  it("does not show navigation while the establishment data is still loading", async () => {
    (api.assignments as jest.Mock).mockResolvedValue([assignment]);
    (api.establishment as jest.Mock).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("assignment-confirmed")).toBeOnTheScreen());
    expect(screen.queryByTestId("assignment-navigate")).not.toBeOnTheScreen();
  });
});