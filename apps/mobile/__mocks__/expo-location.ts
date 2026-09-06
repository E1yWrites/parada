/**
 * Deterministic expo-location mock (Phase 9.5). Production code always uses the
 * real device location API; tests drive this mock and never leak test
 * coordinates into production defaults.
 */

const defaultPermission = { status: "granted", granted: true, canAskAgain: true };
const defaultPosition = {
  coords: { latitude: 0, longitude: 0, accuracy: 1 },
  timestamp: Date.now(),
};

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
};

export const requestForegroundPermissionsAsync = jest.fn(async () => defaultPermission);
export const getCurrentPositionAsync = jest.fn(async () => defaultPosition);

export const __setPermission = (result: {
  granted: boolean;
  canAskAgain: boolean;
  status?: string;
}) => {
  requestForegroundPermissionsAsync.mockResolvedValueOnce({
    status: result.status ?? (result.granted ? "granted" : "denied"),
    granted: result.granted,
    canAskAgain: result.canAskAgain,
  });
  return requestForegroundPermissionsAsync;
};

export const __rejectPermission = (err: unknown) => {
  requestForegroundPermissionsAsync.mockRejectedValueOnce(err);
};

export const __setPosition = (coords: { latitude: number; longitude: number }) => {
  getCurrentPositionAsync.mockResolvedValueOnce({
    coords: { ...coords, accuracy: 1 },
    timestamp: Date.now(),
  });
  return getCurrentPositionAsync;
};

export const __rejectPosition = (err: unknown) => {
  getCurrentPositionAsync.mockRejectedValueOnce(err);
};

export const __reset = () => {
  requestForegroundPermissionsAsync.mockResolvedValue(defaultPermission);
  getCurrentPositionAsync.mockResolvedValue(defaultPosition);
};