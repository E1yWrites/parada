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
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function binaryBackend(status: number, bytes: Uint8Array, contentType: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType, etag: '"abc"', "cache-control": "private, max-age=0, must-revalidate" }),
    json: async () => {
      throw new Error("not json");
    },
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
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

  it("relays a profile picture byte-for-byte with its real content type (not as JSON)", async () => {
    getSessionToken.mockReturnValue("admin-token");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(backend(200, { data: { role: "ADMIN" } }))
      .mockResolvedValueOnce(binaryBackend(200, png, "image/png")) as unknown as typeof fetch;

    const res = await GET(new Request("http://admin.test/api/proxy/users/u1/avatar?v=1"), { params: { path: ["users", "u1", "avatar"] } });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);
  });
});
