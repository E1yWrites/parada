/**
 * @jest-environment node
 */
import { GET } from "@/app/api/realtime/route";

jest.mock("@/lib/auth", () => ({
  getSessionToken: jest.fn(),
  clearSessionToken: jest.fn(),
  apiBaseUrl: () => "http://backend.test",
}));

const { getSessionToken, clearSessionToken } = jest.requireMock("@/lib/auth") as {
  getSessionToken: jest.Mock;
  clearSessionToken: jest.Mock;
};

describe("GET /api/realtime", () => {
  afterEach(() => jest.resetAllMocks());

  it("returns 401 with no session cookie", async () => {
    getSessionToken.mockReturnValue(null);
    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(401);
    expect(clearSessionToken).not.toHaveBeenCalled();
  });

  it("relays an expired/revoked token as 401 and clears the cookie (an EventSource never retries a 401, so the console must re-login)", async () => {
    getSessionToken.mockReturnValue("expired-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token." } }),
    }) as unknown as typeof fetch;
    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(401);
    expect(clearSessionToken).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when the token is not an admin", async () => {
    getSessionToken.mockReturnValue("user-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { role: "USER" } }),
    }) as unknown as typeof fetch;
    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(403);
    // A valid credential that simply lacks the role must survive: signing the
    // operator out here would make a permissions problem look like an expiry.
    expect(clearSessionToken).not.toHaveBeenCalled();
  });

  it("returns 503 when the backend is unreachable and keeps the session", async () => {
    getSessionToken.mockReturnValue("admin-token");
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(503);
    // An outage is not an authentication failure.
    expect(clearSessionToken).not.toHaveBeenCalled();
  });

  it("streams the backend's SSE body through when the token is an admin", async () => {
    getSessionToken.mockReturnValue("admin-token");
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(": connected\n\n"));
        controller.close();
      },
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { role: "ADMIN" } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, body: upstreamBody, headers: new Headers({ "Content-Type": "text/event-stream" }) });

    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("connected");
  });

  it("forwards the browser Last-Event-ID upstream so a resumed stream can be replayed", async () => {
    getSessionToken.mockReturnValue("admin-token");
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { role: "ADMIN" } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, body: upstreamBody, headers: new Headers() });
    global.fetch = fetchMock as unknown as typeof fetch;

    await GET(new Request("http://admin.test/api/realtime", { headers: { "Last-Event-ID": "42" } }));

    const streamCall = fetchMock.mock.calls[1]!;
    expect(streamCall[0]).toBe("http://backend.test/realtime/stream");
    expect(streamCall[1].headers["Last-Event-ID"]).toBe("42");
  });

  it("omits Last-Event-ID on a first connection rather than sending an empty cursor", async () => {
    getSessionToken.mockReturnValue("admin-token");
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { role: "ADMIN" } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, body: upstreamBody, headers: new Headers() });
    global.fetch = fetchMock as unknown as typeof fetch;

    await GET(new Request("http://admin.test/api/realtime"));

    expect(fetchMock.mock.calls[1]![1].headers).not.toHaveProperty("Last-Event-ID");
  });
});
