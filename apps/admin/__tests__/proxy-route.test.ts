/**
 * @jest-environment node
 */
import { GET } from "@/app/api/proxy/[...path]/route";

jest.mock("@/lib/auth", () => ({
  getSessionToken: jest.fn(),
  clearSessionToken: jest.fn(),
  apiBaseUrl: () => "http://backend.test",
}));

const { getSessionToken, clearSessionToken } = jest.requireMock("@/lib/auth") as {
  getSessionToken: jest.Mock;
  clearSessionToken: jest.Mock;
};

function backend(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("GET /api/proxy/[...path] — session mapping", () => {
  afterEach(() => jest.resetAllMocks());

  it("returns 401 with no session cookie", async () => {
    getSessionToken.mockReturnValue(null);
    const res = await GET(new Request("http://admin.test/api/proxy/admin/zones"), { params: { path: ["admin", "zones"] } });
    expect(res.status).toBe(401);
    expect(clearSessionToken).not.toHaveBeenCalled();
  });

  it("relays an expired/revoked token as 401 (not 403) and clears the cookie so the console returns to login", async () => {
    getSessionToken.mockReturnValue("expired-token");
    global.fetch = jest.fn().mockResolvedValue(backend(401, { error: { code: "UNAUTHORIZED", message: "Token has been revoked." } })) as unknown as typeof fetch;

    const res = await GET(new Request("http://admin.test/api/proxy/admin/zones"), { params: { path: ["admin", "zones"] } });

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(clearSessionToken).toHaveBeenCalledTimes(1);
    // Nothing was forwarded: only the /auth/me check ran.
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("returns 403 for a valid non-admin token without touching the cookie", async () => {
    getSessionToken.mockReturnValue("user-token");
    global.fetch = jest.fn().mockResolvedValue(backend(200, { data: { role: "USER" } })) as unknown as typeof fetch;

    const res = await GET(new Request("http://admin.test/api/proxy/admin/zones"), { params: { path: ["admin", "zones"] } });

    expect(res.status).toBe(403);
    expect(clearSessionToken).not.toHaveBeenCalled();
  });

  it("returns 503 when the backend is unreachable and keeps the session", async () => {
    getSessionToken.mockReturnValue("admin-token");
    global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    const res = await GET(new Request("http://admin.test/api/proxy/admin/zones"), { params: { path: ["admin", "zones"] } });

    expect(res.status).toBe(503);
    expect(clearSessionToken).not.toHaveBeenCalled();
  });

  it("forwards an admin request with the bearer token and relays the backend body", async () => {
    getSessionToken.mockReturnValue("admin-token");
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(backend(200, { data: { role: "ADMIN" } }))
      .mockResolvedValueOnce(backend(200, { data: [{ id: "z1" }] })) as unknown as typeof fetch;

    const res = await GET(new Request("http://admin.test/api/proxy/admin/zones?limit=5"), { params: { path: ["admin", "zones"] } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: "z1" }] });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
    expect(url).toBe("http://backend.test/admin/zones?limit=5");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer admin-token");
  });
});
