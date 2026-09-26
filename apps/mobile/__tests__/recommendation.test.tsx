import * as SecureStore from "expo-secure-store";
import { Linking, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as LocationMock from "expo-location";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/src/test/utils";
import { ParkingRecommendation } from "@/src/components/ParkingRecommendation";
import { api, ApiError } from "@/lib/api/client";
import type { ReservationResponse, Vehicle } from "@parada/types";

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
      notifications: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
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

const reservation: ReservationResponse = {
  id: "r1",
  userId: "u1",
  vehicleId: "v1",
  zoneId: "z2",
  startAt: new Date(Date.now() - 60_000).toISOString(),
  endAt: new Date(Date.now() + 3_600_000).toISOString(),
  status: "CONFIRMED",
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
  (api.reservations as jest.Mock).mockResolvedValue([]);
  (api.createReservation as jest.Mock).mockResolvedValue(reservation);
  (api.zones as jest.Mock).mockResolvedValue([]);
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

  it("separates the section header from its card instead of rendering them flush", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-card")).toBeOnTheScreen());
    expect(StyleSheet.flatten(screen.getByTestId("parking-recommendation").props.style)).toMatchObject({ gap: 20 });
  });

  it("exposes an accessible recommendation summary", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-zone")).toBeOnTheScreen());
    expect(screen.getByTestId("recommendation-zone").props.accessibilityLabel).toBe(
      // The pick is the global lowest-occupancy zone, so it is named that — not "recommended for you".
      "Least busy zone: Zone B. 12 spaces available. 40 percent occupied.",
    );
  });

  it("labels the accept button with its domain effect and the zone", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    expect(screen.getByTestId("accept-recommendation").props.accessibilityLabel).toBe(
      "Reserve a space in Zone B",
    );
  });

  it("makes no personal or misleading suggestion claims", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-card")).toBeOnTheScreen());
    expect(screen.getByText("Least busy zone")).toBeOnTheScreen();
    expect(screen.queryByText(/recommended for you/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/suggestion only/i)).not.toBeOnTheScreen();
    expect(screen.queryByText(/Park tab/)).not.toBeOnTheScreen();
  });

  it("offers a way to choose a different zone on the Park tab", async () => {
    const router = useRouter();
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-choose-other")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("recommendation-choose-other"));
    expect(router.push).toHaveBeenCalledWith("/(tabs)/park");
  });

  it("shows a friendly empty state when the backend returns no recommendation", async () => {
    (api.recommendedZone as jest.Mock).mockResolvedValue({ recommendedZone: null });
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-empty")).toBeOnTheScreen());
    expect(screen.getByText("Every active zone is full, or no zone is open.")).toBeOnTheScreen();
    expect(screen.queryByTestId("accept-recommendation")).not.toBeOnTheScreen();
  });

  it("maps a 409 CONFLICT (no suitable zone) to the friendly empty state", async () => {
    (api.recommendedZone as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "No suitable zone is currently available.", 409),
    );
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("recommendation-empty")).toBeOnTheScreen());
    expect(screen.getByText("Every active zone is full, or no zone is open.")).toBeOnTheScreen();
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
    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it("uses the explicitly chosen vehicle for the reservation", async () => {
    (api.vehicles as jest.Mock).mockResolvedValue([vehicle, otherVehicle]);
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("vehicle-choice-v2")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("vehicle-choice-v2"));
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    expect(api.createReservation).toHaveBeenCalledWith({
      zoneId: "z2",
      vehicleId: "v2",
      startAt: expect.any(String),
    });
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

    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    expect(api.createReservation).toHaveBeenCalledWith({
      zoneId: "z2",
      vehicleId: "v1",
      startAt: expect.any(String),
    });
  });

  it("shows the confirmed reservation only after backend success and refreshes state", async () => {
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(screen.getByTestId("reservation-confirmed")).toBeOnTheScreen());
    expect(screen.getByTestId("reservation-confirmed-zone")).toHaveTextContent("Zone B");
    expect(screen.getByTestId("reservation-confirmed-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.queryByTestId("accept-recommendation")).not.toBeOnTheScreen();

    // Recommendation + reservations are refreshed after the mutation settles
    // (the zone invalidation also prefix-matches the recommendation key).
    await waitFor(() =>
      expect((api.recommendedZone as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
    await waitFor(() =>
      expect((api.reservations as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it("does not show reserved state when the reservation fails", async () => {
    (api.createReservation as jest.Mock).mockRejectedValue(
      new ApiError("CONFLICT", "This zone is no longer available for reservation.", 409),
    );
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(screen.getByTestId("reservation-error")).toBeOnTheScreen());
    expect(screen.getByText("This zone is no longer available for reservation.")).toBeOnTheScreen();
    expect(screen.queryByTestId("reservation-confirmed")).not.toBeOnTheScreen();
    expect(screen.queryByText(/409|CONFLICT/)).not.toBeOnTheScreen();
  });

  it("preserves authentication when the reservation fails (no revocation)", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-alive");
    (api.createReservation as jest.Mock).mockRejectedValue(
      new ApiError("BAD_GATEWAY", "The server is down.", 502),
    );
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("accept-recommendation")).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId("accept-recommendation"));

    await waitFor(() => expect(screen.getByTestId("reservation-error")).toBeOnTheScreen());
    const token = await SecureStore.getItemAsync("parada.session.token");
    expect(token).toBe("tok-alive");
  });
});

describe("parking recommendation: existing reservation", () => {
  it("shows the reserved zone from the backend without an accept action", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    renderWithProviders(<ParkingRecommendation />);

    await waitFor(() => expect(screen.getByTestId("reservation-confirmed")).toBeOnTheScreen());
    expect(screen.getByTestId("reservation-confirmed-zone")).toHaveTextContent("Zone B");
    expect(screen.getByTestId("reservation-confirmed-vehicle")).toHaveTextContent(/ABC-1234/);
    expect(screen.queryByTestId("accept-recommendation")).not.toBeOnTheScreen();
    expect(api.createReservation).not.toHaveBeenCalled();
  });
});

describe("parking recommendation: Phase 9.5 GPS navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (LocationMock as LocationModule).__reset();
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });

  it("shows navigation as unavailable when the reserved zone has no coordinates configured", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    renderWithProviders(<ParkingRecommendation destinationFor={() => null} destinationReady />);

    await waitFor(() => expect(screen.getByTestId("reservation-confirmed")).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByTestId("reservation-confirmed-navigate")).toBeOnTheScreen());
    expect(screen.getByTestId("reservation-confirmed-navigate")).toBeDisabled();
    expect(screen.getByTestId("reservation-confirmed-navigate-unavailable")).toHaveTextContent(
      "Navigation coordinates for this zone haven't been configured yet.",
    );
  });

  it("navigates to the reserved zone's configured coordinates + real device location", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    const destinationFor = jest.fn((zoneId: string) =>
      zoneId === reservation.zoneId ? { label: "Zone A", latitude: 14.5502, longitude: 121.0402 } : null,
    );
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    (LocationMock as LocationModule).__setPosition({ latitude: 14.5995, longitude: 120.9842 });
    renderWithProviders(<ParkingRecommendation destinationFor={destinationFor} destinationReady />);

    await waitFor(() => expect(screen.getByTestId("reservation-confirmed")).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByTestId("reservation-confirmed-navigate")).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId("reservation-confirmed-navigate"));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        expect.stringContaining("maps://?saddr=14.5995,120.9842&daddr=14.5502,121.0402"),
      ),
    );
    expect(destinationFor).toHaveBeenCalledWith(reservation.zoneId);
    expect(api.createReservation).not.toHaveBeenCalled();
    expect(api.cancelReservation).not.toHaveBeenCalled();
  });

  it("does not show navigation while the zones (coordinates) are still loading", async () => {
    (api.reservations as jest.Mock).mockResolvedValue([reservation]);
    renderWithProviders(<ParkingRecommendation destinationFor={() => null} destinationReady={false} />);

    await waitFor(() => expect(screen.getByTestId("reservation-confirmed")).toBeOnTheScreen());
    expect(screen.queryByTestId("reservation-confirmed-navigate")).not.toBeOnTheScreen();
  });
});
