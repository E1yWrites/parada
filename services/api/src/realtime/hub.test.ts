import { RealtimeHub } from "./hub";
import type { RealtimeEventInput } from "@parada/types";

function makeClient(id: string, userId: string, role: "USER" | "ADMIN") {
  const chunks: string[] = [];
  return {
    client: { id, userId, role, write: (chunk: string) => chunks.push(chunk) },
    chunks,
  };
}

const zoneEvent: RealtimeEventInput = {
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

  describe("sequencing", () => {
    it("assigns a strictly increasing seq across every audience", () => {
      const hub = new RealtimeHub();
      const first = hub.publish(zoneEvent, { audience: "PUBLIC" });
      const second = hub.publish(zoneEvent, { audience: "ADMIN" });
      const third = hub.publish(zoneEvent, { audience: "USER", userId: "userA" });

      expect([first.seq, second.seq, third.seq]).toEqual([1, 2, 3]);
      expect(hub.headSeq()).toBe(3);
    });

    it("writes the seq as the SSE id line so clients echo it back as Last-Event-ID", () => {
      const hub = new RealtimeHub();
      const user = makeClient("c1", "user1", "USER");
      hub.subscribe(user.client);

      hub.publish(zoneEvent, { audience: "PUBLIC" });

      expect(user.chunks.join("")).toMatch(/^id: 1\nevent: ZONE_OCCUPANCY_UPDATED\ndata: /);
    });

    it("puts the same seq on the wire that it returns to the caller", () => {
      const hub = new RealtimeHub();
      const user = makeClient("c1", "user1", "USER");
      hub.subscribe(user.client);
      hub.publish(zoneEvent, { audience: "PUBLIC" });

      const published = hub.publish(zoneEvent, { audience: "PUBLIC" });
      const lastFrame = user.chunks[user.chunks.length - 1]!;
      const parsed = JSON.parse(lastFrame.split("data: ")[1]!.trim());
      expect(parsed.seq).toBe(published.seq);
    });
  });

  describe("replay", () => {
    it("returns nothing when the client's cursor is already at the head", () => {
      const hub = new RealtimeHub();
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      const user = makeClient("c1", "user1", "USER");

      expect(hub.replay(user.client, 1)).toEqual([]);
    });

    it("returns only the events published after the cursor, in order", () => {
      const hub = new RealtimeHub();
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      const user = makeClient("c1", "user1", "USER");

      const missed = hub.replay(user.client, 1);

      expect(missed?.map((e) => e.seq)).toEqual([2, 3]);
    });

    it("re-authorizes on replay: a reconnecting user never receives another user's buffered events", () => {
      const hub = new RealtimeHub();
      hub.publish(zoneEvent, { audience: "USER", userId: "userA" });
      hub.publish(zoneEvent, { audience: "ADMIN" });
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      const userB = makeClient("c1", "userB", "USER");

      const missed = hub.replay(userB.client, 0);

      expect(missed?.map((e) => e.seq)).toEqual([3]);
    });

    it("replays every audience to a reconnecting ADMIN", () => {
      const hub = new RealtimeHub();
      hub.publish(zoneEvent, { audience: "USER", userId: "userA" });
      hub.publish(zoneEvent, { audience: "ADMIN" });
      const admin = makeClient("c1", "admin1", "ADMIN");

      expect(hub.replay(admin.client, 0)?.map((e) => e.seq)).toEqual([1, 2]);
    });

    it("reports an unrecoverable gap when the cursor has aged out of the buffer", () => {
      const hub = new RealtimeHub({ replayBufferSize: 2 });
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      const user = makeClient("c1", "user1", "USER");

      // The buffer now holds seq 2 and 3 only. A client sitting at seq 0 missed
      // seq 1, which is gone — say so rather than implying continuity.
      expect(hub.replay(user.client, 0)).toBeNull();
      expect(hub.replay(user.client, 1)).not.toBeNull();
    });

    it("treats a cursor at the head as nothing-missed, and a negative cursor as a gap", () => {
      const hub = new RealtimeHub();
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      const user = makeClient("c1", "user1", "USER");

      expect(hub.replay(user.client, 1)).toEqual([]);
      expect(hub.replay(user.client, -1)).toBeNull();
    });

    it("reports a gap when the cursor is ahead of the head (the process restarted)", () => {
      // seq restarts at 0 with the process, so a client reconnecting with a
      // cursor from the previous lifetime is ahead of our head. Answering []
      // would claim it is up to date, and the client's own seq gate would then
      // drop every event this process publishes.
      const hub = new RealtimeHub();
      hub.publish(zoneEvent, { audience: "PUBLIC" });
      const user = makeClient("c1", "user1", "USER");

      expect(hub.replay(user.client, 999)).toBeNull();
    });

    it("never grows the replay buffer past its cap", () => {
      const hub = new RealtimeHub({ replayBufferSize: 3 });
      for (let i = 0; i < 25; i += 1) hub.publish(zoneEvent, { audience: "PUBLIC" });
      const user = makeClient("c1", "user1", "USER");

      expect(hub.replay(user.client, 22)?.map((e) => e.seq)).toEqual([23, 24, 25]);
      expect(hub.replay(user.client, 21)).toBeNull();
    });
  });
});
