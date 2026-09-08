import { isRealtimeEvent, type RealtimeEvent } from "./realtime";

describe("isRealtimeEvent", () => {
  it("accepts a well-formed ZONE_OCCUPANCY_UPDATED event", () => {
    const event: RealtimeEvent = {
      type: "ZONE_OCCUPANCY_UPDATED",
      occurredAt: "2026-09-08T00:00:00.000Z",
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
    expect(isRealtimeEvent({ occurredAt: "x", payload: {} })).toBe(false);
  });

  it("rejects an unknown event type", () => {
    expect(isRealtimeEvent({ type: "NOT_REAL", occurredAt: "x", payload: {} })).toBe(false);
  });

  it("rejects a scalar", () => {
    expect(isRealtimeEvent("hello")).toBe(false);
    expect(isRealtimeEvent(null)).toBe(false);
  });
});
