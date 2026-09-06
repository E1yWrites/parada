import { Linking } from "react-native";
import {
  fallbackNavigationUrl,
  NavigationUnavailableError,
  openNavigation,
  primaryNavigationUrl,
  resolveEstablishmentDestination,
} from "@/lib/navigation";

const current = { latitude: 14.5995, longitude: 120.9842 };
const destination = { label: "PARADA HQ", latitude: 14.5502, longitude: 121.0402 };

describe("lib/navigation: destination resolution", () => {
  it("resolves the establishment location into a navigable destination", () => {
    const dest = resolveEstablishmentDestination({
      location: { address: "123 Test Ave", latitude: 14.5, longitude: 121.25 },
    });
    expect(dest).toEqual({ label: "123 Test Ave", latitude: 14.5, longitude: 121.25 });
  });

  it("returns null when no location is configured (never invents one)", () => {
    expect(resolveEstablishmentDestination({ location: null })).toBeNull();
    expect(resolveEstablishmentDestination(null)).toBeNull();
    expect(resolveEstablishmentDestination(undefined)).toBeNull();
  });
});

describe("lib/navigation: URL creation", () => {
  it("builds an Apple Maps directions link with current + destination coordinates", () => {
    const url = primaryNavigationUrl(current, destination, "ios");
    expect(url).toBe(
      "maps://?saddr=14.5995,120.9842&daddr=14.5502,121.0402",
    );
  });

  it("builds a Google navigation link on Android with both coordinates", () => {
    const url = primaryNavigationUrl(current, destination, "android");
    expect(url).toBe(
      "google.navigation:q=14.5502,121.0402&saddr=14.5995,120.9842",
    );
  });

  it("builds a universal coordinate fallback", () => {
    expect(fallbackNavigationUrl(current, destination)).toBe(
      "geo:14.5502,121.0402?q=14.5502,121.0402",
    );
  });
});

describe("lib/navigation: launch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });

  it("opens the platform primary link from real coordinates", async () => {
    const opened = await openNavigation(current, destination, "ios");
    expect(opened).toContain("14.5995");
    expect(opened).toContain("120.9842");
    expect(opened).toContain("14.5502");
    expect(opened).toContain("121.0402");
    expect(Linking.openURL).toHaveBeenCalledWith(
      "maps://?saddr=14.5995,120.9842&daddr=14.5502,121.0402",
    );
  });

  it("falls back to the universal link when the primary scheme is unavailable", async () => {
    jest
      .spyOn(Linking, "canOpenURL")
      .mockImplementation(async (url) => !url.startsWith("google.navigation:"));
    const opened = await openNavigation(current, destination, "android");
    expect(opened).toBe("geo:14.5502,121.0402?q=14.5502,121.0402");
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
  });

  it("throws a friendly error when no scheme can be opened (no raw errors)", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(false);
    const err = (await openNavigation(current, destination, "ios").catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(NavigationUnavailableError);
    expect(err.message).toBe("Unable to open navigation. Please try again.");
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("falls through when openURL itself fails", async () => {
    jest
      .spyOn(Linking, "canOpenURL")
      .mockImplementation(async (url) => url.startsWith("maps://"));
    jest.spyOn(Linking, "openURL").mockImplementation(async () => {
      throw new Error("open failed");
    });
    const err = (await openNavigation(current, destination, "ios").catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(NavigationUnavailableError);
    expect(err.message).not.toMatch(/open failed/);
  });
});