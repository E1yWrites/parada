import * as LocationMock from "expo-location";
import {
  getCurrentLocation,
  LocationError,
  requestLocationPermission,
} from "@/lib/location";

type LocationModule = typeof LocationMock & {
  __reset: () => void;
  __setPermission: (result: { granted: boolean; canAskAgain: boolean; status?: string }) => void;
  __rejectPermission: (err: unknown) => void;
  __setPosition: (coords: { latitude: number; longitude: number }) => void;
  __rejectPosition: (err: unknown) => void;
};

describe("lib/location: permission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (LocationMock as LocationModule).__reset();
  });

  it("returns the granted state from the OS", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: true, canAskAgain: true });
    await expect(requestLocationPermission()).resolves.toEqual({
      granted: true,
      canAskAgain: true,
    });
  });

  it("returns the denied state without re-prompting on its own", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: false, canAskAgain: true });
    await expect(requestLocationPermission()).resolves.toEqual({
      granted: false,
      canAskAgain: true,
    });
    expect(LocationMock.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("surfaces a permanent denial (canAskAgain false)", async () => {
    (LocationMock as LocationModule).__setPermission({ granted: false, canAskAgain: false });
    await expect(requestLocationPermission()).resolves.toEqual({
      granted: false,
      canAskAgain: false,
    });
  });

  it("degrades to a safe denied state when the permission prompt itself fails", async () => {
    (LocationMock as LocationModule).__rejectPermission(new Error("native prompt failure"));
    await expect(requestLocationPermission()).resolves.toEqual({
      granted: false,
      canAskAgain: true,
    });
  });
});

describe("lib/location: current position", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (LocationMock as LocationModule).__reset();
  });

  it("returns the device coordinates from the OS (data-driven, never invented)", async () => {
    (LocationMock as LocationModule).__setPosition({ latitude: 14.5995, longitude: 120.9842 });
    await expect(getCurrentLocation()).resolves.toEqual({
      latitude: 14.5995,
      longitude: 120.9842,
    });
    expect(LocationMock.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it("maps error code 1 (permission denied) to a friendly denied error", async () => {
    (LocationMock as LocationModule).__rejectPosition(
      Object.assign(new Error("Permission denied"), { code: 1 }),
    );
    const err = (await getCurrentLocation().catch((e: unknown) => e)) as LocationError;
    expect(err).toBeInstanceOf(LocationError);
    expect(err.kind).toBe("denied");
    expect(err.message).toBe("Location permission is required for navigation.");
  });

  it("maps error code 2 (services unavailable) to a friendly unavailable error", async () => {
    (LocationMock as LocationModule).__rejectPosition(
      Object.assign(new Error("Location services disabled"), { code: 2 }),
    );
    const err = (await getCurrentLocation().catch((e: unknown) => e)) as LocationError;
    expect(err.kind).toBe("unavailable");
    expect(err.message).toBe("We couldn't determine your location.");
  });

  it("maps a timeout code to a friendly timeout error", async () => {
    (LocationMock as LocationModule).__rejectPosition(
      Object.assign(new Error("Timed out"), { code: -5 }),
    );
    const err = (await getCurrentLocation().catch((e: unknown) => e)) as LocationError;
    expect(err.kind).toBe("timeout");
  });

  it("maps an unknown failure to a friendly error with no raw details", async () => {
    (LocationMock as LocationModule).__rejectPosition(new Error("Error: [GpsProvider] sattelite sync boom"));
    const err = (await getCurrentLocation().catch((e: unknown) => e)) as LocationError;
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("We couldn't determine your location.");
    expect(err.message).not.toMatch(/GpsProvider|sattelite|boom/);
  });

  it("never exports or returns a hardcoded production coordinate", async () => {
    (LocationMock as LocationModule).__setPosition({ latitude: 99.001, longitude: -1.234 });
    const first = await getCurrentLocation();
    (LocationMock as LocationModule).__setPosition({ latitude: -33.8688, longitude: 151.2093 });
    const second = await getCurrentLocation();
    // Output must track the OS, not a constant.
    expect(first).not.toEqual(second);
  });
});