import { isRealtimeEvent, isRealtimeSyncFrame, type RealtimeEvent } from "./realtime";

describe("isRealtimeEvent", () => {
  it("accepts a well-formed ZONE_OCCUPANCY_UPDATED event", () => {
    const event: RealtimeEvent = {
      type: "ZONE_OCCUPANCY_UPDATED",
      occurredAt: "2026-09-08T00:00:00.000Z",
      seq: 1,
      payload: {
        zoneId: "z1",
        name: "Zone A",
        code: "A",
        capacity: 10,
        occupiedCount: 3,
        availableCount: 7,
        status: "ACTIVE",
      },
    };
    expect(isRealtimeEvent(event)).toBe(true);
  });

  it("rejects a payload missing a discriminant", () => {
    expect(isRealtimeEvent({ occurredAt: "x", seq: 1, payload: {} })).toBe(false);
  });

  it("rejects an unknown event type", () => {
    expect(isRealtimeEvent({ type: "NOT_REAL", occurredAt: "x", seq: 1, payload: {} })).toBe(false);
  });

  it("rejects a scalar", () => {
    expect(isRealtimeEvent("hello")).toBe(false);
    expect(isRealtimeEvent(null)).toBe(false);
  });

  it("rejects an event with no seq — without one a client cannot tell it apart from a stale replay", () => {
    expect(
      isRealtimeEvent({
        type: "ZONE_OCCUPANCY_UPDATED",
        occurredAt: "2026-09-08T00:00:00.000Z",
        payload: { zoneId: "z1" },
      })
    ).toBe(false);
  });

  it("rejects a non-finite or non-numeric seq", () => {
    const base = { type: "ZONE_OCCUPANCY_UPDATED", occurredAt: "x", payload: { zoneId: "z1" } };
    expect(isRealtimeEvent({ ...base, seq: "3" })).toBe(false);
    expect(isRealtimeEvent({ ...base, seq: Number.NaN })).toBe(false);
    expect(isRealtimeEvent({ ...base, seq: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe("isRealtimeSyncFrame", () => {
  it("accepts a GAP frame", () => {
    expect(isRealtimeSyncFrame({ reason: "GAP", sinceSeq: 4, headSeq: 90 })).toBe(true);
  });

  it("rejects a domain event — SYNC is transport bookkeeping, not parking state", () => {
    expect(isRealtimeSyncFrame({ type: "ZONE_OCCUPANCY_UPDATED", occurredAt: "x", seq: 1, payload: {} })).toBe(false);
  });

  it("rejects a frame with no headSeq", () => {
    expect(isRealtimeSyncFrame({ reason: "GAP", sinceSeq: 4 })).toBe(false);
  });
});
