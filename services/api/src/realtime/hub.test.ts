import { RealtimeHub } from "./hub";
import type { RealtimeEvent } from "@parada/types";

function makeClient(id: string, userId: string, role: "USER" | "ADMIN") {
  const chunks: string[] = [];
  return {
    client: { id, userId, role, write: (chunk: string) => chunks.push(chunk) },
    chunks,
  };
}

const zoneEvent: RealtimeEvent = {
  type: "ZONE_OCCUPANCY_UPDATED",
  occurredAt: "2026-09-08T00:00:00.000Z",
  payload: { zoneId: "z1", name: "A", code: "A", capacity: 5, occupiedCount: 1, availableCount: 4, status: "ACTIVE" },
};

describe("RealtimeHub", () => {
  it("delivers a PUBLIC event to every connected client", () => {
    const hub = new RealtimeHub();
    const admin = makeClient("c1", "admin1", "ADMIN");
    const user = makeClient("c2", "user1", "USER");
    hub.subscribe(admin.client);
    hub.subscribe(user.client);

    hub.publish(zoneEvent, { audience: "PUBLIC" });

    expect(admin.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
    expect(user.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
  });

  it("delivers an ADMIN-scoped event only to ADMIN clients", () => {
    const hub = new RealtimeHub();
    const admin = makeClient("c1", "admin1", "ADMIN");
    const user = makeClient("c2", "user1", "USER");
    hub.subscribe(admin.client);
    hub.subscribe(user.client);

    hub.publish(zoneEvent, { audience: "ADMIN" });

    expect(admin.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
    expect(user.chunks.join("")).toBe("");
  });

  it("delivers a USER-scoped event only to that user's own clients, never another user's", () => {
    const hub = new RealtimeHub();
    const userA = makeClient("c1", "userA", "USER");
    const userB = makeClient("c2", "userB", "USER");
    hub.subscribe(userA.client);
    hub.subscribe(userB.client);

    hub.publish(zoneEvent, { audience: "USER", userId: "userA" });

    expect(userA.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
    expect(userB.chunks.join("")).toBe("");
  });

  it("a USER-scoped event still reaches ADMIN (admin sees everything)", () => {
    const hub = new RealtimeHub();
    const admin = makeClient("c1", "admin1", "ADMIN");
    hub.subscribe(admin.client);

    hub.publish(zoneEvent, { audience: "USER", userId: "someoneElse" });

    expect(admin.chunks.join("")).toContain("ZONE_OCCUPANCY_UPDATED");
  });

  it("stops delivering to a client after it unsubscribes", () => {
    const hub = new RealtimeHub();
    const user = makeClient("c1", "user1", "USER");
    const unsubscribe = hub.subscribe(user.client);
    unsubscribe();

    hub.publish(zoneEvent, { audience: "PUBLIC" });

    expect(user.chunks.join("")).toBe("");
  });

  it("never writes another user's data into a shared PUBLIC event frame", () => {
    const hub = new RealtimeHub();
    const user = makeClient("c1", "user1", "USER");
    hub.subscribe(user.client);
    hub.publish(zoneEvent, { audience: "PUBLIC" });
    const written = user.chunks.join("");
    expect(written).not.toContain("password");
    expect(written).not.toContain("passwordHash");
  });

  it("enforces a per-user connection cap", () => {
    const hub = new RealtimeHub({ maxConnectionsPerUser: 2 });
    const a = makeClient("c1", "user1", "USER");
    const b = makeClient("c2", "user1", "USER");
    hub.subscribe(a.client);
    hub.subscribe(b.client);
    expect(() => hub.subscribe(makeClient("c3", "user1", "USER").client)).toThrow();
    expect(hub.connectionCount("user1")).toBe(2);
  });
});
