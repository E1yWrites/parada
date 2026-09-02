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

describe("api client: error codes and messages", () => {
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
    const err = (await api.createVehicle("ABC123", "CAR").catch((e: unknown) => e)) as ApiError;
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
});