import * as Location from "expo-location";
import { render, screen, waitFor } from "@/src/test/utils";
import { ZoneMap, distanceMeters, formatDistance } from "@/src/components/ZoneMap";

const dest = { label: "Main Loop", latitude: 13.7644, longitude: 121.0646 };

describe("ZoneMap", () => {
  it("draws the zone on a Leaflet map without asking for location", async () => {
    await render(<ZoneMap destination={dest} testID="map" />);
    const web = screen.getByTestId("map-web");
    expect((web.props.source as { html: string }).html).toMatch(/leaflet@1\.9\.4/);
    expect((web.props.source as { html: string }).html).toContain("13.7644");
    expect(web).toHaveProp("accessibilityLabel", "Map of Main Loop");
    expect(screen.queryByTestId("map-distance")).toBeNull();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it("shows the straight-line distance when location is already allowed", async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    (Location.watchPositionAsync as jest.Mock).mockImplementationOnce(async (_o, cb) => {
      cb({ coords: { latitude: 13.7660, longitude: 121.0646 } });
      return { remove: jest.fn() };
    });
    await render(<ZoneMap destination={dest} testID="map" />);
    await waitFor(() => expect(screen.getByTestId("map-distance")).toHaveTextContent("180 m away"));
  });

  it("measures and formats distance", () => {
    expect(Math.round(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }))).toBe(111195);
    expect(formatDistance(178)).toBe("180 m");
    expect(formatDistance(2345)).toBe("2.3 km");
  });
});
