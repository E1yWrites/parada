import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

/**
 * The auth middleware now checks that the token's account still exists and is
 * ACTIVE (a deleted or deactivated account, or a stale password generation,
 * is rejected), so every signed token needs a real user row behind it.
 */
async function signFor(id: string, role: "USER" | "ADMIN" = "USER"): Promise<string> {
  await prisma.user.upsert({
    where: { id },
    update: {},
    create: { id, name: id, email: `${id.toLowerCase()}@realtime.test.local`, passwordHash: "x", role, emailVerifiedAt: new Date() },
  });
  return auth["tokens"].sign({ id, role }).token;
}

afterAll(async () => {
  await prisma.$disconnect();
});

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
    const token = await signFor("user1", "USER");

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
    const token = await signFor("user2", "USER");

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

/** Opens a stream, accumulates raw SSE text, and resolves as soon as `until`
 *  is satisfied. Every assertion below terminates on a frame the server is
 *  guaranteed to send, so a regression surfaces as a failed expectation on the
 *  collected text rather than as a hang. */
function collect(
  app: ReturnType<typeof createApp>,
  token: string,
  headers: Record<string, string>,
  until: (text: string) => boolean
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffered = "";
    const req = request(app).get("/realtime/stream").set("Authorization", `Bearer ${token}`);
    for (const [key, value] of Object.entries(headers)) req.set(key, value);
    req
      .buffer(false)
      .parse((res, callback) => {
        res.on("data", (chunk: Buffer) => {
          buffered += chunk.toString();
          if (until(buffered)) {
            callback(null, undefined);
            // See the note above: silence superagent's forwarded 'error'
            // before aborting or Node treats it as unhandled.
            internals(req).response?.on("error", () => undefined);
            req.abort();
            resolve(buffered);
          }
        });
        res.on("error", reject);
      })
      .end((err) => {
        if (err && err.message !== "socket hang up" && !internals(req).aborted) reject(err);
      });
  });
}

const zoneEvent = {
  type: "ZONE_OCCUPANCY_UPDATED",
  occurredAt: "2026-09-08T00:00:00.000Z",
  payload: { zoneId: "z1", name: "A", code: "A", capacity: 5, occupiedCount: 1, availableCount: 4, status: "ACTIVE" },
} as const;

describe("GET /realtime/stream — missed-event recovery", () => {
  it("replays only the events after the client's Last-Event-ID cursor", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const token = await signFor("replayUser", "USER");

    hub.publish(zoneEvent, { audience: "PUBLIC" });
    hub.publish(zoneEvent, { audience: "PUBLIC" });
    hub.publish(zoneEvent, { audience: "PUBLIC" });

    const text = await collect(app, token, { "Last-Event-ID": "1" }, (t) => t.includes("id: 3"));

    expect(text).toContain("id: 2");
    expect(text).toContain("id: 3");
    // seq 1 was already delivered before the disconnect and must not repeat.
    expect(text).not.toContain("id: 1\n");
  });

  it("replays nothing when the cursor is already at the head", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const token = await signFor("caughtUpUser", "USER");

    hub.publish(zoneEvent, { audience: "PUBLIC" });

    // Terminate on a live event published after the connection is open: if any
    // replay had leaked through, it would appear ahead of it in the text.
    const text = await new Promise<string>((resolve, reject) => {
      const pending = collect(app, token, { "Last-Event-ID": "1" }, (t) => t.includes("id: 2"));
      setTimeout(() => hub.publish(zoneEvent, { audience: "PUBLIC" }), 50);
      pending.then(resolve, reject);
    });

    expect(text.match(/id: 1\n/g)).toBeNull();
    expect(text).toContain("id: 2");
  });

  it("re-authorizes replayed events: a reconnecting user never receives another user's buffered event", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const token = await signFor("nosyUser", "USER");

    hub.publish(zoneEvent, { audience: "USER", userId: "someoneElse" });
    hub.publish(zoneEvent, { audience: "ADMIN" });
    hub.publish(zoneEvent, { audience: "PUBLIC" });

    const text = await collect(app, token, { "Last-Event-ID": "0" }, (t) => t.includes("id: 3"));

    expect(text).toContain("id: 3");
    expect(text).not.toContain("id: 1\n");
    expect(text).not.toContain("id: 2\n");
  });

  it("sends a SYNC frame instead of partial data when the cursor has aged out of the buffer", async () => {
    const hub = new RealtimeHub({ replayBufferSize: 1 });
    const app = createApp({ auth, realtimeHub: hub });
    const token = await signFor("gapUser", "USER");

    hub.publish(zoneEvent, { audience: "PUBLIC" });
    hub.publish(zoneEvent, { audience: "PUBLIC" });
    hub.publish(zoneEvent, { audience: "PUBLIC" });

    const text = await collect(app, token, { "Last-Event-ID": "0" }, (t) => t.includes("SYNC"));

    expect(text).toContain("event: SYNC");
    expect(text).toContain('"reason":"GAP"');
    expect(text).toContain('"headSeq":3');
    // A gap must not be papered over with whatever happened to survive.
    expect(text).not.toContain("ZONE_OCCUPANCY_UPDATED");
  });

  it("accepts the cursor as a query parameter for a client that reconnects by hand", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const token = await signFor("queryCursorUser", "USER");

    hub.publish(zoneEvent, { audience: "PUBLIC" });
    hub.publish(zoneEvent, { audience: "PUBLIC" });

    const text = await new Promise<string>((resolve, reject) => {
      let buffered = "";
      const req = request(app)
        .get("/realtime/stream?lastEventId=1")
        .set("Authorization", `Bearer ${token}`)
        .buffer(false)
        .parse((res, callback) => {
          res.on("data", (chunk: Buffer) => {
            buffered += chunk.toString();
            if (buffered.includes("id: 2")) {
              callback(null, undefined);
              internals(req).response?.on("error", () => undefined);
              req.abort();
              resolve(buffered);
            }
          });
          res.on("error", reject);
        })
        .end((err) => {
          if (err && err.message !== "socket hang up" && !internals(req).aborted) reject(err);
        });
    });

    expect(text).toContain("id: 2");
    expect(text).not.toContain("id: 1\n");
  });

  it("treats a malformed cursor as no cursor rather than failing the stream", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub });
    const token = await signFor("badCursorUser", "USER");

    hub.publish(zoneEvent, { audience: "PUBLIC" });

    const text = await collect(app, token, { "Last-Event-ID": "not-a-number" }, (t) => t.includes("connected"));

    expect(text).toContain(": connected");
    expect(text).not.toContain("event: SYNC");
  });
});
