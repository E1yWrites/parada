import * as SecureStore from "expo-secure-store";
import { api, ApiError } from "@/lib/api/client";
import { getToken, setToken, onAuthInvalidated } from "@/lib/auth/session";

type SecureStoreMock = typeof SecureStore & { __reset: () => void };

function mockFetch(payload: unknown, status = 200): jest.Mock {
  return jest.fn().mockImplementation(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }));
}

beforeEach(() => {
  (SecureStore as SecureStoreMock).__reset();
  (global.fetch as unknown) = mockFetch({ data: null });
});

describe("api client: success envelopes", () => {
  it("unwraps { data } envelopes", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: { name: "Zone A" } });
    await expect(api.zones()).resolves.toEqual({ name: "Zone A" });
  });

  it("unwraps { data: null } to null (never the envelope object)", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: null });
    await expect(api.zones()).resolves.toBeNull();
  });

  it("resolves a null active session instead of an invalid-session error", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: null });
    await expect(api.activeSession()).resolves.toBeNull();
  });

  it("accepts account-less guest sessions in the sessions list (vehicle: null)", async () => {
    const guest = {
      id: "g1",
      zoneId: "z1",
      userId: null,
      vehicleId: null,
      entryEventId: "e1",
      exitEventId: null,
      enteredAt: new Date(2026, 8, 1, 10, 0, 0).toISOString(),
      exitedAt: null,
      durationSeconds: null,
      feeAmount: null,
      status: "ACTIVE",
      zone: { id: "z1", name: "Zone A", code: "A" },
      vehicle: null,
      entryEvent: null,
      exitEvent: null,
    };
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: [guest] });
    await expect(api.sessions()).resolves.toEqual([guest]);
  });

  it("accepts a guest active session (userId/vehicleId/vehicle null)", async () => {
    const guest = {
      id: "g2",
      zoneId: "z1",
      userId: null,
      vehicleId: null,
      entryEventId: "e2",
      exitEventId: null,
      enteredAt: new Date(2026, 8, 1, 10, 0, 0).toISOString(),
      exitedAt: null,
      durationSeconds: null,
      feeAmount: null,
      status: "ACTIVE",
      zone: { id: "z1", name: "Zone A", code: "A" },
      vehicle: null,
      entryEvent: null,
      exitEvent: null,
    };
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: guest });
    await expect(api.activeSession()).resolves.toEqual(guest);
  });

  it("zoneOccupancy matches the backend zoneId contract", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({
      data: {
        zoneId: "z1",
        name: "Zone A",
        code: "A",
        capacity: 20,
        occupiedCount: 15,
        availableCount: 5,
        status: "ACTIVE",
        availability: "LOW_AVAILABILITY",
        navigationLat: null,
        navigationLng: null,
      },
    });
    await expect(api.zoneOccupancy("z1")).resolves.toMatchObject({
      zoneId: "z1",
      name: "Zone A",
      code: "A",
      capacity: 20,
      occupiedCount: 15,
      availableCount: 5,
      status: "ACTIVE",
      availability: "LOW_AVAILABILITY",
      navigationLat: null,
      navigationLng: null,
    });
  });

  it("attaches the Bearer token when present", async () => {
    await setToken("tok-123");
    const fetchMock = mockFetch({ data: [] });
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await api.vehicles();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-123" });
  });

  it("skips the Authorization header on public endpoints", async () => {
    await setToken("tok-123");
    const fetchMock = mockFetch({ data: [] });
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await api.zones();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });
});

// Test fixtures matching the real backend response shapes (see services/api
// routes/domain). These are test-only values, never used in production code.
const FIXTURE_ZONE_REF = { id: "z2", name: "Zone B", code: "B" };
const FIXTURE_VEHICLE_REF = { id: "v1", plateNumber: "ABC-1234", vehicleType: "CAR" };
const FIXTURE_NOW = "2026-09-05T08:00:00.000Z";

const FIXTURE_RECOMMENDATION = {
  recommendedZone: {
    id: "z2",
    name: "Zone B",
    code: "B",
    capacity: 20,
    occupiedCount: 4,
    availableCount: 16,
    status: "ACTIVE",
  },
};

const FIXTURE_ASSIGNMENT = {
  id: "a1",
  userId: "u1",
  vehicleId: "v1",
  zoneId: "z2",
  status: "ACTIVE",
  assignedAt: FIXTURE_NOW,
  expiresAt: FIXTURE_NOW,
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
  zone: FIXTURE_ZONE_REF,
  vehicle: FIXTURE_VEHICLE_REF,
};

const FIXTURE_RESERVATION = {
  id: "r1",
  userId: "u1",
  vehicleId: "v1",
  zoneId: "z2",
  startAt: FIXTURE_NOW,
  endAt: FIXTURE_NOW,
  status: "CONFIRMED",
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
  zone: FIXTURE_ZONE_REF,
  vehicle: FIXTURE_VEHICLE_REF,
};

describe("api client: parking operations", () => {
  it("recommendedZone unwraps the recommendation envelope", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: FIXTURE_RECOMMENDATION });
    await expect(api.recommendedZone()).resolves.toEqual(FIXTURE_RECOMMENDATION);
  });

  it("recommendedZone accepts a null recommendedZone (no suitable zone)", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: { recommendedZone: null } });
    await expect(api.recommendedZone()).resolves.toEqual({ recommendedZone: null });
  });

  it("recommendedZone is a public endpoint (no Authorization header)", async () => {
    await setToken("tok-123");
    const fetchMock = mockFetch({ data: FIXTURE_RECOMMENDATION });
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await api.recommendedZone();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("assignments resolves the backend list with the Bearer token attached", async () => {
    await setToken("tok-123");
    const fetchMock = mockFetch({ data: [FIXTURE_ASSIGNMENT] });
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await expect(api.assignments()).resolves.toEqual([FIXTURE_ASSIGNMENT]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-123" });
  });

  it("createAssignment POSTs zoneId + vehicleId and resolves the confirmed assignment", async () => {
    await setToken("tok-123");
    const fetchMock = mockFetch({ data: FIXTURE_ASSIGNMENT }, 201);
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await expect(api.createAssignment({ zoneId: "z2", vehicleId: "v1" })).resolves.toEqual(FIXTURE_ASSIGNMENT);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/assignments$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ zoneId: "z2", vehicleId: "v1" });
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-123" });
  });

  it("reservations resolves the backend list", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: [FIXTURE_RESERVATION] });
    await expect(api.reservations()).resolves.toEqual([FIXTURE_RESERVATION]);
  });

  it("createReservation POSTs the input and resolves the confirmed reservation", async () => {
    await setToken("tok-123");
    const fetchMock = mockFetch({ data: FIXTURE_RESERVATION }, 201);
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await expect(
      api.createReservation({ zoneId: "z2", vehicleId: "v1" }),
    ).resolves.toEqual(FIXTURE_RESERVATION);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/reservations$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ zoneId: "z2", vehicleId: "v1" });
  });

  it("cancelReservation PATCHes the cancel route", async () => {
    await setToken("tok-123");
    const fetchMock = mockFetch({ data: { ...FIXTURE_RESERVATION, status: "CANCELLED" } });
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await expect(api.cancelReservation("r1")).resolves.toMatchObject({ id: "r1", status: "CANCELLED" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/reservations\/r1\/cancel$/);
    expect(init.method).toBe("PATCH");
  });

  it("maps a malformed recommendation to a friendly error", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({
      data: { recommendedZone: { id: "z2", name: "Zone B" } },
    });
    const err = (await api.recommendedZone().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_RECOMMENDATION_RESPONSE");
    expect(err.message).toBe("We couldn't load a parking recommendation.");
  });

  it("maps a malformed assignment list to a friendly error", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: [{ id: "a1" }] });
    const err = (await api.assignments().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_ASSIGNMENT_RESPONSE");
    expect(err.message).toBe("We couldn't load your zone assignment.");
  });

  it("maps a malformed reservation list to a friendly error", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: { not: "a list" } });
    const err = (await api.reservations().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_RESERVATION_RESPONSE");
    expect(err.message).toBe("We couldn't load your reservations.");
  });

  it("maps a malformed created reservation to a friendly error", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: { id: "r1" } });
    const err = (await api
      .createReservation({ zoneId: "z2", vehicleId: "v1" })
      .catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_RESERVATION_RESPONSE");
    expect(err.message).toBe("We couldn't confirm your reservation.");
  });

  it("surfaces a backend CONFLICT when assigning to an unavailable zone", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch(
      { error: { code: "CONFLICT", message: "This vehicle already has an active zone assignment." } },
      409,
    );
    const err = (await api.createAssignment({ zoneId: "z2", vehicleId: "v1" }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
    expect(err.message).toContain("already has an active zone assignment");
  });
});

describe("api client: error codes and messages", () => {
  it("rejects an active session without the required relations", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({
      data: { id: "session-1", status: "ACTIVE", enteredAt: new Date().toISOString() },
    });

    const err = (await api.activeSession().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_SESSION_RESPONSE");
    expect(err.status).toBe(502);
  });

  it("never exposes the raw HTTP status when the backend omits a message", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ error: { code: "INTERNAL" } }, 500);

    const err = (await api.me().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INTERNAL");
    expect(err.status).toBe(500);
    expect(err.message).toBe("Something went wrong. Please try again.");
    expect(err.message).not.toMatch(/500|status/i);
  });

  it("maps a malformed active session to a friendly message", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({
      data: { id: "session-1", status: "ACTIVE", enteredAt: new Date().toISOString() },
    });

    const err = (await api.activeSession().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_SESSION_RESPONSE");
    expect(err.message).toBe("We couldn't load your parking session.");
    expect(err.message).not.toMatch(/server|invalid/i);
  });

  it("maps malformed session list data to a friendly message", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: { not: "a list" } });

    const err = (await api.sessions().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_SESSION_RESPONSE");
    expect(err.message).toBe("We couldn't load your parking sessions.");
  });

  it("500 maps to ApiError with backend code/message", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch(
      { error: { code: "INTERNAL", message: "Something went wrong." } },
      500,
    );
    const err = await api.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("INTERNAL");
    expect((err as ApiError).message).toBe("Something went wrong.");
    expect((err as ApiError).status).toBe(500);
  });

  it("403 FORBIDDEN", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch(
      { error: { code: "FORBIDDEN", message: "Admin access required." } },
      403,
    );
    const err = (await api.sessions().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("FORBIDDEN");
    expect(err.status).toBe(403);
  });

  it("409 CONFLICT", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch(
      { error: { code: "CONFLICT", message: "Email already registered." } },
      409,
    );
    const err = (await api.register("A", "a@b.co", "password123").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("CONFLICT");
    expect(err.status).toBe(409);
  });

  it("422 UNPROCESSABLE for duplicate vehicle plates", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch(
      { error: { code: "UNPROCESSABLE", message: "You already have a vehicle with this plate number." } },
      422,
    );
    const err = (await api.createVehicle({ plateNumber: "ABC123", vehicleType: "CAR" }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("UNPROCESSABLE");
    expect(err.message).toContain("already have a vehicle");
    expect(err.status).toBe(422);
  });

  it("does NOT globally invalidate for a login 401 (screen handles it)", async () => {
    const listener = jest.fn();
    const unsubscribe = onAuthInvalidated(listener);
    (global.fetch as unknown as jest.Mock) = mockFetch(
      { error: { code: "UNAUTHORIZED", message: "Invalid email or password." } },
      401,
    );
    const err = (await api.login("a@b.co", "wrong").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("UNAUTHORIZED");
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("auto-invalidates the session on any other 401", async () => {
    await setToken("tok-expired");
    const listener = jest.fn();
    const unsubscribe = onAuthInvalidated(listener);
    (global.fetch as unknown as jest.Mock) = mockFetch(
      { error: { code: "UNAUTHORIZED", message: "Session expired." } },
      401,
    );
    const err = (await api.me().catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(getToken()).resolves.toBeNull();
    unsubscribe();
  });
});

describe("api client: network failures", () => {
  it("wraps fetch rejections as NETWORK ApiError", async () => {
    (global.fetch as unknown as jest.Mock) = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    const err = (await api.zones().catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK");
    expect(err.message).toContain("Cannot reach the PARADA server");
  });

  it("does NOT invalidate the stored session on a network failure", async () => {
    await setToken("tok-alive");
    const listener = jest.fn();
    const unsubscribe = onAuthInvalidated(listener);
    (global.fetch as unknown as jest.Mock) = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    const err = (await api.me().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("NETWORK");
    expect(listener).not.toHaveBeenCalled();
    await expect(getToken()).resolves.toBe("tok-alive");
    unsubscribe();
  });

  it("does NOT invalidate the stored session on a timeout", async () => {
    await setToken("tok-alive");
    const listener = jest.fn();
    const unsubscribe = onAuthInvalidated(listener);
    (global.fetch as unknown as jest.Mock) = jest
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError"));
    const err = (await api.me().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("TIMEOUT");
    expect(listener).not.toHaveBeenCalled();
    await expect(getToken()).resolves.toBe("tok-alive");
    unsubscribe();
  });

  it("preserves the token for non-401 failures that are not a revocation", async () => {
    await setToken("tok-alive");
    const listener = jest.fn();
    const unsubscribe = onAuthInvalidated(listener);
    (global.fetch as unknown as jest.Mock) = mockFetch(
      { error: { code: "INTERNAL", message: "Something went wrong." } },
      500,
    );
    const err = (await api.me().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INTERNAL");
    expect(listener).not.toHaveBeenCalled();
    await expect(getToken()).resolves.toBe("tok-alive");
    unsubscribe();
  });
});

const FIXTURE_NOTIFICATION = {
  id: "n1",
  zoneId: "z2",
  type: "VIOLATION_ISSUED",
  message: "A wrong-zone violation was issued for your vehicle. Fine: 500.",
  read: false,
  createdAt: FIXTURE_NOW,
  zone: FIXTURE_ZONE_REF,
};

const FIXTURE_VIOLATION = {
  id: "v1",
  userId: "u1",
  vehicleId: "veh1",
  zoneId: "z2",
  sessionId: null,
  violationType: "WRONG_ZONE",
  description: "Entered a zone other than the assigned zone 'A' after 2 warning(s).",
  fineAmount: 500,
  status: "PENDING",
  issuedAt: FIXTURE_NOW,
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
  zone: FIXTURE_ZONE_REF,
  vehicle: FIXTURE_VEHICLE_REF,
  appeal: null,
};

describe("api client: notifications and violations", () => {
  it("notifications resolves the list + unread count", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({
      data: { notifications: [FIXTURE_NOTIFICATION], unreadCount: 1 },
    });
    await expect(api.notifications()).resolves.toEqual({
      notifications: [FIXTURE_NOTIFICATION],
      unreadCount: 1,
    });
  });

  it("maps a malformed notifications payload to a friendly error", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: { notifications: [{ id: "n1" }] } });
    const err = (await api.notifications().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_NOTIFICATIONS_RESPONSE");
    expect(err.message).toBe("We couldn't load your notifications.");
  });

  it("markNotificationRead PATCHes the notification", async () => {
    const fetchMock = mockFetch({ data: { id: "n1", read: true } });
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await expect(api.markNotificationRead("n1")).resolves.toEqual({ id: "n1", read: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/notifications\/n1\/read$/);
    expect(init.method).toBe("PATCH");
  });

  it("violations resolves the driver's own violations, including a null appeal", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: [FIXTURE_VIOLATION] });
    await expect(api.violations()).resolves.toEqual([FIXTURE_VIOLATION]);
  });

  it("violations accepts a violation with an appeal attached", async () => {
    const withAppeal = {
      ...FIXTURE_VIOLATION,
      status: "APPEALED",
      appeal: { id: "ap1", status: "PENDING", reason: "It was a mistake.", reviewedAt: null, createdAt: FIXTURE_NOW },
    };
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: [withAppeal] });
    await expect(api.violations()).resolves.toEqual([withAppeal]);
  });

  it("maps a malformed violation list to a friendly error", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: [{ id: "v1" }] });
    const err = (await api.violations().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_VIOLATION_RESPONSE");
    expect(err.message).toBe("We couldn't load your violations.");
  });

  it("appealViolation POSTs the reason and resolves the appeal", async () => {
    const appeal = {
      id: "ap1",
      violationId: "v1",
      userId: "u1",
      reason: "It was a mistake.",
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    };
    const fetchMock = mockFetch({ data: appeal });
    (global.fetch as unknown as jest.Mock) = fetchMock;
    await expect(api.appealViolation("v1", "It was a mistake.")).resolves.toEqual(appeal);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/violations\/v1\/appeal$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ reason: "It was a mistake." });
  });

  it("maps a malformed appeal response to a friendly error", async () => {
    (global.fetch as unknown as jest.Mock) = mockFetch({ data: { id: "ap1" } });
    const err = (await api.appealViolation("v1", "reason").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("INVALID_APPEAL_RESPONSE");
    expect(err.message).toBe("We couldn't submit your appeal.");
  });
});