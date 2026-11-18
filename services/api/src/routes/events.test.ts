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
  const runId = `${Date.now()}-${process.pid}`;
  const plateSuffix = runId.replace(/\D/g, "").slice(-8);
  // A registered-vehicle plate match is used (rather than an unmatched/guest
  // plate) so the ENTRY/EXIT actually commits an occupancy change: the guest
  // path is subject to the PRIMARY_ZONE admission policy (default: deny when
  // no primary zone is configured), which would otherwise leave
  // occupiedCount at 0 regardless of the realtime-publish behavior under test.
  const detectedPlate = `RT-${plateSuffix}`;

  beforeAll(async () => {
    const zone = await prisma.parkingZone.create({
      data: { name: `RT Zone ${runId}`, code: `RT${runId.replace(/\D/g, "").slice(-8)}`, capacity: 5 },
    });
    zoneId = zone.id;
    const camera = await prisma.camera.create({
      data: { zoneId, name: "Gate", identifier: `RT-CAM-${runId}`, gateType: "BIDIRECTIONAL", status: "ONLINE" },
    });
    cameraIdentifier = camera.identifier;
    const user = await prisma.user.create({
      data: { name: "RT Driver", email: `rt-driver-${runId}@test.local`, passwordHash: "x", role: "USER" },
    });
    await prisma.vehicle.create({
      data: {
        userId: user.id,
        plateNumber: detectedPlate,
        normalizedPlate: `RT${plateSuffix}`,
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

  it("tells an already-parked vehicle apart from a replayed event id (both 409)", async () => {
    const app = createApp({ auth, realtimeHub: new RealtimeHub() });
    const user = await prisma.user.findFirstOrThrow({ where: { email: `rt-driver-${runId}@test.local` } });
    const plate = `RTP-${plateSuffix}`;
    await prisma.vehicle.create({
      data: { userId: user.id, plateNumber: plate, normalizedPlate: `RTP${plateSuffix}`, vehicleType: "CAR", status: "ACTIVE" },
    });
    const send = (sourceEventId: string, eventType: "ENTRY" | "EXIT") =>
      request(app).post(`/zones/${zoneId}/events`).send({ cameraIdentifier, sourceEventId, eventType, detectedPlate: plate, ocrConfidence: 0.95 });

    expect((await send("evt-parked-1", "ENTRY")).status).toBe(201);

    const again = await send("evt-parked-2", "ENTRY");
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("This vehicle already has an active parking session; the ENTRY was not recorded.");

    const replay = await send("evt-parked-1", "ENTRY");
    expect(replay.status).toBe(409);
    expect(replay.body.error.message).toBe("Duplicate camera event for sourceEventId 'evt-parked-1'.");

    expect((await send("evt-parked-3", "EXIT")).status).toBe(201);
  });

  it("requires the configured camera API key before processing an event", async () => {
    const app = createApp({ auth, cameraApiKey: "trusted-camera-key" });

    const response = await request(app).post(`/zones/${zoneId}/events`).send({
      cameraIdentifier,
      sourceEventId: "evt-auth-required",
      eventType: "ENTRY",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects oversized event identifiers at the ingress boundary", async () => {
    const app = createApp({ auth });

    const response = await request(app).post(`/zones/${zoneId}/events`).send({
      cameraIdentifier: "c".repeat(129),
      sourceEventId: "evt-too-long",
      eventType: "ENTRY",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });
});
