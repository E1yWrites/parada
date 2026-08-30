import { api, ApiError } from "@/lib/api/client";

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);
}

describe("admin api client", () => {
  const fetchMock = jest.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
    Object.defineProperty(window, "location", {
      value: { assign: jest.fn() },
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });

  it("unwraps the { data } envelope for dashboard", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { summary: { totalCapacity: 50, totalOccupied: 10 } } })
    );
    const d = await api.dashboard();
    expect(fetchMock).toHaveBeenCalledWith("/api/proxy/admin/dashboard", undefined);
    expect((d.summary as { totalCapacity: number }).totalCapacity).toBe(50);
  });

  it("throws ApiError with the backend message on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "FORBIDDEN", message: "Insufficient role." } }, 403)
    );
    await expect(api.dashboard()).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "Insufficient role.",
    });
  });

  it("redirects to /login on an unauthenticated 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "Not authenticated." } }, 401)
    );
    await expect(api.users()).rejects.toBeInstanceOf(ApiError);
    expect(window.location.assign).toHaveBeenCalledWith("/login");
  });

  it("throws a NETWORK error when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.dashboard()).rejects.toMatchObject({
      status: 0,
      code: "NETWORK",
    });
  });

  it("markNotificationRead issues a PATCH to the read endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: "n1", read: true } }));
    await api.markNotificationRead("n1");
    expect(fetchMock).toHaveBeenCalledWith("/api/proxy/admin/notifications/n1/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("login posts credentials through the Next auth route", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { user: { id: "u1", email: "a@x.com", role: "ADMIN" } } })
    );
    const user = await api.login("a@x.com", "secret");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    );
    expect((user as { role: string }).role).toBe("ADMIN");
  });

  it("login surface backend unauthorized error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "Invalid email or password." } }, 401)
    );
    await expect(api.login("a@x.com", "wrong")).rejects.toMatchObject({
      message: "Invalid email or password.",
    });
  });

  it("history forwards query parameters", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { entries: [] } }));
    await api.history("z1", { limit: 100 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/proxy/admin/zones/z1/history?limit=100",
      undefined
    );
  });

  it("simulatorRun POSTs the payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { scenario: "FILL_ZONE" } }));
    await api.simulatorRun({ scenario: "FILL_ZONE", fillTo: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/proxy/simulator/run",
      expect.objectContaining({ method: "POST" })
    );
  });
});
