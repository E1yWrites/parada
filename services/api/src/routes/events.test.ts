import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

function spyClient(userId: string, role: "ADMIN" | "USER"): { client: RealtimeClient; frames: string[] } {
  const frames: string[] = [];
  return { client: { id: `${userId}-${Math.random()}`, userId, role, write: (c) => frames.push(c) }, frames };
}

describe("POST /zones/:zoneId/events publishes ZONE_OCCUPANCY_UPDATED after commit", () => {
  let zoneId: string;
  let cameraIdentifier: string;
  // A registered-vehicle plate match is used (rather than an unmatched/guest
  // plate) so the ENTRY/EXIT actually commits an occupancy change: the guest
  // path is subject to the PRIMARY_ZONE admission policy (default: deny when
  // no primary zone is configured), which would otherwise leave
  // occupiedCount at 0 regardless of the realtime-publish behavior under test.
  const detectedPlate = "RT-9999";

  beforeAll(async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "RT Zone", code: "RT1", capacity: 5 } });
    zoneId = zone.id;
    const camera = await prisma.camera.create({
      data: { zoneId, name: "Gate", identifier: "RT-CAM-1", gateType: "BIDIRECTIONAL", status: "ONLINE" },
    });
    cameraIdentifier = camera.identifier;
    const user = await prisma.user.create({
      data: { name: "RT Driver", email: "rt-driver@test.local", passwordHash: "x", role: "USER" },
    });
    await prisma.vehicle.create({
      data: {
        userId: user.id,
        plateNumber: detectedPlate,
        normalizedPlate: "RT9999",
        vehicleType: "CAR",
        status: "ACTIVE",
      },
    });
  });

  it("publishes an ADMIN-scoped ZONE_OCCUPANCY_UPDATED with the post-commit occupancy count", async () => {
    const hub = new RealtimeHub();
    const admin = spyClient("admin1", "ADMIN");
    hub.subscribe(admin.client);
    const app = createApp({ auth, realtimeHub: hub });

    const res = await request(app).post(`/zones/${zoneId}/events`).send({
      cameraIdentifier,
      sourceEventId: "evt-rt-1",
      eventType: "ENTRY",
      detectedPlate,
      ocrConfidence: 0.95,
    });

    expect(res.status).toBe(201);
    const frame = admin.frames.find((f) => f.includes("ZONE_OCCUPANCY_UPDATED"));
    expect(frame).toBeDefined();
    const payload = JSON.parse(frame!.split("data: ")[1]!);
    expect(payload.payload.zoneId).toBe(zoneId);
    expect(payload.payload.occupiedCount).toBe(1);
  });

  it("does NOT publish when the event is rejected (e.g. duplicate sourceEventId)", async () => {
    const hub = new RealtimeHub();
    const admin = spyClient("admin2", "ADMIN");
    hub.subscribe(admin.client);
    const app = createApp({ auth, realtimeHub: hub });

    // First call succeeds and publishes once.
    await request(app).post(`/zones/${zoneId}/events`).send({
      cameraIdentifier,
      sourceEventId: "evt-rt-dup",
      eventType: "EXIT",
      detectedPlate,
      ocrConfidence: 0.95,
    });
    const countAfterFirst = admin.frames.filter((f) => f.includes("ZONE_OCCUPANCY_UPDATED")).length;

    // Duplicate sourceEventId -> 409, must not publish again.
    const dup = await request(app).post(`/zones/${zoneId}/events`).send({
      cameraIdentifier,
      sourceEventId: "evt-rt-dup",
      eventType: "EXIT",
      detectedPlate,
      ocrConfidence: 0.95,
    });

    expect(dup.status).toBe(409);
    const countAfterDup = admin.frames.filter((f) => f.includes("ZONE_OCCUPANCY_UPDATED")).length;
    expect(countAfterDup).toBe(countAfterFirst);
  });
});
