/**
 * @jest-environment node
 */
import { GET } from "@/app/api/realtime/route";

jest.mock("@/lib/auth", () => ({
  getSessionToken: jest.fn(),
  apiBaseUrl: () => "http://backend.test",
}));

const { getSessionToken } = jest.requireMock("@/lib/auth") as { getSessionToken: jest.Mock };

describe("GET /api/realtime", () => {
  afterEach(() => jest.resetAllMocks());

  it("returns 401 with no session cookie", async () => {
    getSessionToken.mockReturnValue(null);
    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the token is not an admin", async () => {
    getSessionToken.mockReturnValue("user-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { role: "USER" } }),
    }) as unknown as typeof fetch;
    const res = await GET(new Request("http://admin.test/api/realtime"));
    expect(res.status).toBe(403);
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
});
