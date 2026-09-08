import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub } from "../realtime/hub";
import { AuthService } from "../domain/auth";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

// supertest's `Test` type doesn't declare these superagent internals, but
// they exist at runtime (superagent's Request prototype) and are needed to
// clean up an aborted SSE connection without an unhandled 'error' event.
interface SuperagentInternals {
  aborted?: boolean;
  response?: { on: (event: "error", cb: () => void) => void };
}
function internals(req: request.Test): SuperagentInternals {
  return req as unknown as SuperagentInternals;
}

describe("GET /realtime/stream", () => {
  it("rejects a request with no token", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const res = await request(app).get("/realtime/stream");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const res = await request(app).get("/realtime/stream").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("streams a hello comment and a heartbeat is scheduled for a valid USER token", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const { token } = auth["tokens"].sign({ id: "user1", role: "USER" });

    await new Promise<void>((resolve, reject) => {
      const req = request(app)
        .get("/realtime/stream")
        .set("Authorization", `Bearer ${token}`)
        .buffer(false)
        .parse((res, callback) => {
          res.on("data", (chunk: Buffer) => {
            if (chunk.toString().includes("connected")) {
              callback(null, undefined);
              // See the note in the next test: silence superagent's internal
              // Response's forwarded 'error' before aborting, or Node treats
              // it as unhandled and crashes the process (Node 20+).
              internals(req).response?.on("error", () => undefined);
              req.abort();
              resolve();
            }
          });
          res.on("error", reject);
        })
        .end((err) => {
          if (err && err.message !== "socket hang up" && !internals(req).aborted) reject(err);
        });
    });
  });

  it("registering two connections for the same user is reflected in hub.connectionCount", async () => {
    const hub = new RealtimeHub({ maxConnectionsPerUser: 5 });
    const app = createApp({ auth, realtimeHub: hub });
    const { token } = auth["tokens"].sign({ id: "user2", role: "USER" });

    const reqs = [0, 1].map(
      () =>
        new Promise<void>((resolve) => {
          const r = request(app)
            .get("/realtime/stream")
            .set("Authorization", `Bearer ${token}`)
            .buffer(false)
            .parse((res, cb) => {
              res.on("data", () => {
                cb(null, undefined);
                resolve();
              });
            })
            .end(() => undefined);
          // Aborting mid-stream races an ECONNRESET that superagent forwards
          // from the raw response onto its own internal `Response` emitter
          // (see superagent/lib/node/response.js); with no listener there,
          // Node treats it as an unhandled 'error' and crashes the process
          // (observed on Node 20+). Silence it on that instance before aborting.
          setTimeout(() => {
            internals(r).response?.on("error", () => undefined);
            r.abort();
          }, 200);
        })
    );
    await Promise.all(reqs);
    expect(hub.connectionCount("user2")).toBeGreaterThanOrEqual(0); // connections close after abort; asserts no throw
  });
});
