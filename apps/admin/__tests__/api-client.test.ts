import { api, ApiError, navigation } from "@/lib/api/client";

const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function jsonErrorResponse(body: unknown, status: number) {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}

let toLogin: jest.SpyInstance;

beforeEach(() => {
  toLogin = jest.spyOn(navigation, "toLogin").mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  toLogin.mockRestore();
});

describe("api client proxy requests", () => {
  it("carries the rejected field from error.details so a form can mark that input", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonErrorResponse({ error: { code: "CONFLICT", message: "Camera identifier already exists.", details: { field: "identifier" } } }, 409)
    );
    const err = await api.cameras().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "CONFLICT", status: 409, field: "identifier" });

    global.fetch = jest.fn().mockResolvedValue(jsonErrorResponse({ error: { code: "CONFLICT", message: "x" } }, 409));
    expect(await api.cameras().catch((e: unknown) => e)).toMatchObject({ field: undefined });
  });

  it("unwraps the { data } envelope for GET endpoints", async () => {
    const payload = [{ id: "z1", code: "A" }];
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: payload }));

    await expect(api.zones()).resolves.toEqual(payload);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/proxy/admin/zones");
  });

  it("sends a PATCH JSON body for markNotificationRead", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: {} }));

    await api.markNotificationRead("n1");
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/proxy/admin/notifications/n1/read");
    expect(init.method).toBe("PATCH");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends one PATCH to the bulk endpoint for markAllNotificationsRead", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: { updated: 2 } }));

    await expect(api.markAllNotificationsRead()).resolves.toEqual({ updated: 2 });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/proxy/admin/notifications/read-all");
    expect(init.method).toBe("PATCH");
  });

  it("sends a POST JSON body for simulatorRun", async () => {
    const result = { scenario: "SINGLE_ENTRY", events: [], rejects: [], occupancy: null, zone: null };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: result }));

    await expect(
      api.simulatorRun({ scenario: "SINGLE_ENTRY", zoneId: "z1" })
    ).resolves.toEqual(result);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/proxy/simulator/run");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ scenario: "SINGLE_ENTRY", zoneId: "z1" });
  });

  it("sends a POST JSON body for guest admission", async () => {
    const result = { id: "e1", admitted: true, deniedReason: null };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: result }));

    await expect(api.guestAdmit({
      zoneId: "z1",
      cameraIdentifier: "cam-entry",
      sourceEventId: "admin-1",
      detectedPlate: "GUEST-1",
    })).resolves.toEqual(result);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/proxy/admin/guest-admit");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ zoneId: "z1", sourceEventId: "admin-1" });
  });

  it("reads and updates establishment configuration", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: { parkingFee: {} } }));
    await api.config();
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/proxy/admin/config");
    await api.updateConfig({ parkingFee: {}, guestPolicy: {}, zoneDefaults: {}, violations: [] } as never);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect(url).toBe("/api/proxy/admin/config");
    expect(init.method).toBe("PUT");
  });

  it("reads and cancels admin reservations", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: [] }));
    await api.reservations();
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/proxy/admin/reservations");
    await api.cancelReservation("r1");
    expect((global.fetch as jest.Mock).mock.calls[1][1].method).toBe("PATCH");
  });

  it("appends query params to history requests", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: { entries: [] } }));

    await api.history("z1", { from: "2026-01-01T00:00:00.000Z", limit: 50 });
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/api/proxy/admin/zones/z1/history");
    expect(url).toContain("from=2026-01-01T00%3A00%3A00.000Z");
    expect(url).toContain("limit=50");
  });

  it("throws ApiError on backend error body and does not redirect for non-401", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonErrorResponse({ error: { code: "ZONE_FULL", message: "Zone is full." } }, 409)
    );

    const err = await api.zones().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("ZONE_FULL");
    expect(err.message).toBe("Zone is full.");
    expect(toLogin).not.toHaveBeenCalled();
  });

  it("redirects to /login on 401", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonErrorResponse({ error: { code: "UNAUTHORIZED", message: "Not authorized." } }, 401)
    );

    await api.zones().catch(() => undefined);
    expect(toLogin).toHaveBeenCalledTimes(1);
  });

  it("resolves the current session user from GET /api/auth/me", async () => {
    // The route forwards the backend's { data: <user> } envelope verbatim —
    // there is no nested `.user` in the response body.
    const user = { id: "u1", name: "Admin", email: "admin@parada.local", role: "ADMIN", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: user }));

    await expect(api.me()).resolves.toEqual(user);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/auth/me");
  });

  it("throws a network ApiError when fetch rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));

    const err = await api.dashboard().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK");
    expect(err.status).toBe(0);
  });
});
