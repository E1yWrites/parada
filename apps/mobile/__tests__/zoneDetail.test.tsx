import { __router, useLocalSearchParams } from "expo-router";
import { fireEvent, renderWithProviders, screen } from "@/src/test/utils";
import ZoneDetailScreen from "@/app/zones/[id]";
import { api, ApiError, type PublicZone } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: {
      zones: jest.fn(),
      establishment: jest.fn(),
      notifications: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 0 }),
    },
  };
});

const zoneB: PublicZone = {
  id: "z2",
  name: "Zone B",
  code: "B",
  description: "Keep right past Zone A — Zone B is the second entrance on your left.",
  capacity: 40,
  occupiedCount: 36,
  availableCount: 4,
  status: "ACTIVE",
  availability: "LOW_AVAILABILITY",
  navigationLat: null,
  navigationLng: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: "z2" });
  (api.establishment as jest.Mock).mockResolvedValue({ location: null });
});

describe("zone detail screen", () => {
  it("shows live capacity, availability and the wayfinding description", async () => {
    (api.zones as jest.Mock).mockResolvedValue([zoneB]);
    renderWithProviders(<ZoneDetailScreen />);

    expect(await screen.findByText("Zone B")).toBeOnTheScreen();
    expect(screen.getByText("B")).toBeOnTheScreen();
    expect(screen.getByText("Low")).toBeOnTheScreen();
    expect(screen.getByText("4")).toBeOnTheScreen();
    expect(screen.getByText(zoneB.description!)).toBeOnTheScreen();
  });

  it("shows an error state and retries", async () => {
    (api.zones as jest.Mock)
      .mockRejectedValueOnce(new ApiError("NETWORK", "Cannot reach the PARADA server.", 0))
      .mockResolvedValueOnce([zoneB]);
    renderWithProviders(<ZoneDetailScreen />);

    expect(await screen.findByText("Cannot reach the PARADA server.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("zone-detail-error-retry"));
    expect(await screen.findByText("Zone B")).toBeOnTheScreen();
  });

  it("routes to Parking when asked to reserve", async () => {
    (api.zones as jest.Mock).mockResolvedValue([zoneB]);
    renderWithProviders(<ZoneDetailScreen />);

    fireEvent.press(await screen.findByTestId("zone-detail-reserve"));
    expect(__router.push).toHaveBeenCalledWith("/(tabs)/parking");
  });
});
