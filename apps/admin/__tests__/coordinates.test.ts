import { formatPickedCoordinate, mapFallbackCenter, pinFromFields } from "@/lib/coordinates";

describe("pinFromFields", () => {
  it("returns a point only when both fields are valid coordinates", () => {
    expect(pinFromFields("13.76447", " 121.06462 ")).toEqual({ lat: 13.76447, lng: 121.06462 });
    expect(pinFromFields("", "")).toBeNull();
    expect(pinFromFields("13.7", "")).toBeNull();
    expect(pinFromFields("13.", "121")).toEqual({ lat: 13, lng: 121 });
    expect(pinFromFields("abc", "121")).toBeNull();
    expect(pinFromFields("91", "121")).toBeNull();
  });
});

describe("formatPickedCoordinate", () => {
  it("rounds to six decimals and drops trailing zeros", () => {
    expect(formatPickedCoordinate(13.764881234567)).toBe("13.764881");
    expect(formatPickedCoordinate(121.5)).toBe("121.5");
    expect(formatPickedCoordinate(-0.0000001)).toBe("0");
  });
});

describe("mapFallbackCenter", () => {
  const zones = [
    { id: "a", navigationLat: null, navigationLng: null },
    { id: "b", navigationLat: 13.1, navigationLng: 121.1 },
    { id: "c", navigationLat: 13.2, navigationLng: 121.2 },
  ];

  it("uses the first other zone that has a pin", () => {
    expect(mapFallbackCenter(zones)).toEqual({ lat: 13.1, lng: 121.1 });
    expect(mapFallbackCenter(zones, "b")).toEqual({ lat: 13.2, lng: 121.2 });
  });

  it("returns null when no zone has a pin, or zones are not loaded", () => {
    expect(mapFallbackCenter([zones[0]])).toBeNull();
    expect(mapFallbackCenter(undefined)).toBeNull();
  });
});
