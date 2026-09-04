import request from "supertest";
import { prisma } from "@parada/database";
import { createApp, type AppOptions } from "./app";

/**
 * Phase 5 — Vision/OCR integration foundation.
 *
 * These are SIMULATED vision events driven through the documented event
 * contract (POST /zones/:id/events). They exercise the full backend pipeline
 * (camera validation -> dedupe -> plate normalization -> vehicle matching ->
 * occupancy + session) without any real camera or OCR model, matching the 10
 * required scenarios. Physical occupancy and vehicle identity are kept as
 * separate, independently-consistent concerns.
 */

const TABLES = [
  "guest_sessions",
  "violation_appeals",
  "violations",
  "parking_fees",
  "reservations",
  "zone_assignments",
  "occupancy_anomalies",
  "occupancy_history",
  "notifications",
  "parking_sessions",
  "occupancy_events",
  "parking_slots",
  "cameras",
  "vehicles",
  "users",
  "parking_zones",
  "establishment_config",
];

async function cleanDatabase() {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }
}

interface ZoneCtx {
  zoneId: string;
  capacity: number;
  entryCamId: string;
  exitCamId: string;
  vehicleABC: string;
  vehicleXYZ: string;
}

async function seedZone(capacity = 20, slug = "a"): Promise<ZoneCtx> {
  const code = slug.toUpperCase();
  const zone = await prisma.parkingZone.create({
    data: { name: `Zone ${code}`, code, capacity, occupiedCount: 0 },
  });
  const entry = await prisma.camera.create({
    data: { zoneId: zone.id, name: `Zone ${code} Entry`, identifier: `cam-${slug}-entry`, gateType: "ENTRY", status: "ONLINE" },
  });
  const exit = await prisma.camera.create({
    data: { zoneId: zone.id, name: `Zone ${code} Exit`, identifier: `cam-${slug}-exit`, gateType: "EXIT", status: "ONLINE" },
  });
  const userA = await prisma.user.create({
    data: { name: `Driver ${code}`, email: `driver-${slug}@test.local`, passwordHash: "x", role: "USER" },
  });
  const abc = await prisma.vehicle.create({
    data: { userId: userA.id, plateNumber: "ABC-1234", normalizedPlate: "ABC1234", vehicleType: "CAR", status: "ACTIVE" },
  });
  const xyz = await prisma.vehicle.create({
    data: { userId: userA.id, plateNumber: "XYZ-5678", normalizedPlate: "XYZ5678", vehicleType: "MOTORCYCLE", status: "ACTIVE" },
  });
  return {
    zoneId: zone.id,
    capacity,
    entryCamId: entry.identifier,
    exitCamId: exit.identifier,
    vehicleABC: abc.id,
    vehicleXYZ: xyz.id,
  };
}

describe("Phase 5 — Vision/OCR integration foundation", () => {
  let app: ReturnType<typeof createApp>;
  let ctx: ZoneCtx;

  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
    ctx = await seedZone(20);
    const options: AppOptions = {};
    app = createApp(options);
  });

  async function occupancy() {
    const res = await request(app).get(`/zones/${ctx.zoneId}/occupancy`).expect(200);
    return res.body.data as { occupiedCount: number; availableCount: number };
  }

  async function sessions() {
    return prisma.parkingSession.findMany({ orderBy: { enteredAt: "asc" } });
  }

  describe("Scenario 1 — single vehicle enters an empty zone", () => {
    it("records 1 occupied / 19 available and opens an ACTIVE session", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s1", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(1);
      expect(occ.availableCount).toBe(19);

      const all = await sessions();
      expect(all).toHaveLength(1);
      expect(all[0]!.vehicleId).toBe(ctx.vehicleABC);
      expect(all[0]!.status).toBe("ACTIVE");
    });
  });

  describe("Scenario 2 — a second vehicle enters", () => {
    it("2 occupied / 18 available, both sessions ACTIVE", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s2a", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s2b", eventType: "ENTRY", detectedPlate: "XYZ-5678", ocrConfidence: 0.97 })
        .expect(201);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(2);
      expect(occ.availableCount).toBe(18);

      const all = await sessions();
      expect(all).toHaveLength(2);
      expect(all.every((s) => s.status === "ACTIVE")).toBe(true);
    });
  });

  describe("Scenario 3 — a vehicle exits", () => {
    it("returns occupancy to 1 and completes the ABC session with duration", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s3a", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s3b", eventType: "ENTRY", detectedPlate: "XYZ-5678", ocrConfidence: 0.9 })
        .expect(201);

      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.exitCamId, sourceEventId: "s3c", eventType: "EXIT", detectedPlate: "ABC-1234", ocrConfidence: 0.98 })
        .expect(201);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(1);

      const all = await sessions();
      const abc = all.find((s) => s.vehicleId === ctx.vehicleABC)!;
      expect(abc.status).toBe("COMPLETED");
      expect(abc.exitEventId).not.toBeNull();
      expect(abc.exitedAt).not.toBeNull();
      expect(abc.durationSeconds).toBeGreaterThanOrEqual(0);

      const xyz = all.find((s) => s.vehicleId === ctx.vehicleXYZ)!;
      expect(xyz.status).toBe("ACTIVE");
    });
  });

  describe("Scenario 4 — unknown plate enters", () => {
    it("increases occupancy but creates no fake vehicle/user/session", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s4", eventType: "ENTRY", detectedPlate: "ZZZ-0001", ocrConfidence: 0.85 })
        .expect(201);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(1);

      expect(await sessions()).toHaveLength(0);
      expect(await prisma.vehicle.count()).toBe(2);
      expect(await prisma.user.count()).toBe(1);

      const anomaly = await prisma.occupancyAnomaly.findFirst();
      expect(anomaly).not.toBeNull();
      expect(anomaly!.anomalyType).toBe("UNREGISTERED_PLATE");
    });
  });

  describe("Scenario 5 — low-confidence plate", () => {
    it("records occupancy but does NOT trust the identity (no session)", async () => {
      // Threshold is 0.5; a 0.3-confidence plate below the threshold must not
      // create a session even though it matches a registered vehicle.
      const res = await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s5", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.3 })
        .expect(201);

      expect(res.body.data.plateMatched).toBe(false);
      expect(await sessions()).toHaveLength(0);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(1);

      const anomaly = await prisma.occupancyAnomaly.findFirst();
      expect(anomaly!.anomalyType).toBe("LOW_CONFIDENCE_PLATE");
    });
  });

  describe("Scenario 6 — duplicate camera event", () => {
    it("processes once only (no double increment/decrement, no dup session)", async () => {
      const body = { cameraIdentifier: ctx.entryCamId, sourceEventId: "s6", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 };
      await request(app).post(`/zones/${ctx.zoneId}/events`).send(body).expect(201);
      await request(app).post(`/zones/${ctx.zoneId}/events`).send(body).expect(409);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(1);
      expect(await sessions()).toHaveLength(1);
      expect(await prisma.occupancyEvent.count()).toBe(1);
    });
  });

  describe("Scenario 7 — zone full", () => {
    it("rejects ENTRY safely without changing occupancy", async () => {
      const full = await seedZone(1, "fz");
      const fullApp = createApp();
      await request(fullApp)
        .post(`/zones/${full.zoneId}/events`)
        .send({ cameraIdentifier: full.entryCamId, sourceEventId: "s7a", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);

      const before = await request(fullApp).get(`/zones/${full.zoneId}/occupancy`).expect(200);

      await request(fullApp)
        .post(`/zones/${full.zoneId}/events`)
        .send({ cameraIdentifier: full.entryCamId, sourceEventId: "s7b", eventType: "ENTRY", detectedPlate: "XYZ-5678", ocrConfidence: 0.9 })
        .expect(409);

      const after = await request(fullApp).get(`/zones/${full.zoneId}/occupancy`).expect(200);
      expect(after.body.data.occupiedCount).toBe(before.body.data.occupiedCount);
    });
  });

  describe("Scenario 8 — zone occupancy zero", () => {
    it("rejects EXIT safely", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.exitCamId, sourceEventId: "s8", eventType: "EXIT", detectedPlate: "ABC-1234", ocrConfidence: 0.9 })
        .expect(409);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(0);
    });
  });

  describe("Scenario 9 — EXIT with no active session", () => {
    it("releases occupancy but records an anomaly, fabricating no session", async () => {
      // Enter ABC -> ACTIVE session, occupancy 1.
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s9a", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);

      // Manually complete the ACTIVE session, simulating that it was ended
      // out-of-band (e.g. an earlier EXIT that the camera now re-reports).
      const active = await prisma.parkingSession.findFirstOrThrow({ where: { vehicleId: ctx.vehicleABC, status: "ACTIVE" } });
      await prisma.parkingSession.update({
        where: { id: active.id },
        data: { status: "COMPLETED", exitedAt: new Date() },
      });

      // EXIT reported again for ABC: occupancy is still 1 so the EXIT is
      // physically valid and releases it, but there is no ACTIVE session.
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.exitCamId, sourceEventId: "s9b", eventType: "EXIT", detectedPlate: "ABC-1234", ocrConfidence: 0.95 })
        .expect(201);

      const after = await occupancy();
      expect(after.occupiedCount).toBe(0);

      // The original session is untouched (status COMPLETED) and no new session
      // was fabricated.
      const all = await sessions();
      expect(all).toHaveLength(1);
      expect(all[0]!.vehicleId).toBe(ctx.vehicleABC);
      expect(all[0]!.status).toBe("COMPLETED");

      const anomaly = await prisma.occupancyAnomaly.findFirst({ where: { anomalyType: "EXIT_WITHOUT_ACTIVE_SESSION" } });
      expect(anomaly).not.toBeNull();
      expect(anomaly!.vehicleId).toBe(ctx.vehicleABC);
    });
  });

  describe("Scenario 10 — sessions never cross-match between zones", () => {
    it("keeps each zone's session separate even for the same plate owner", async () => {
      // Zone A holds ABC and XYZ. Create Zone B with its own ABC-equivalent
      // holder, then exit ABC via Zone A's exit camera.
      const zoneB = await prisma.parkingZone.create({
        data: { name: "Zone B", code: "B", capacity: 20, occupiedCount: 0 },
      });
      const exitB = await prisma.camera.create({
        data: { zoneId: zoneB.id, name: "Zone B Exit", identifier: "cam-b-exit", gateType: "EXIT", status: "ONLINE" },
      });

      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s10a", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s10b", eventType: "ENTRY", detectedPlate: "XYZ-5678", ocrConfidence: 0.9 })
        .expect(201);

      // Exit ABC through Zone B's EXIT camera -> should be rejected because
      // camera B does not belong to Zone A (no cross-zone session match).
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: exitB.identifier, sourceEventId: "s10c", eventType: "EXIT", detectedPlate: "ABC-1234", ocrConfidence: 0.95 })
        .expect(409);

      const occA = await occupancy();
      expect(occA.occupiedCount).toBe(2);
      const all = await sessions();
      expect(all.filter((s) => s.zoneId === ctx.zoneId)).toHaveLength(2);
      expect(all.every((s) => s.status === "ACTIVE")).toBe(true);
    });
  });

  describe("Camera direction gating", () => {
    it("rejects an EXIT event on an ENTRY camera (non-BIDIRECTIONAL)", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "dir1", eventType: "EXIT", detectedPlate: "ABC-1234" })
        .expect(409);
    });

    it("rejects an event from an OFFLINE camera", async () => {
      const offline = await prisma.camera.create({
        data: { zoneId: ctx.zoneId, name: "Off Cam", identifier: "cam-off", gateType: "BIDIRECTIONAL", status: "OFFLINE" },
      });
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: offline.identifier, sourceEventId: "off1", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(409);
    });
  });

  describe("Camera event ingestion security", () => {
    it("requires the configured X-API-Key when one is set", async () => {
      const secured = createApp({ cameraApiKey: "secret-key" });
      const zone = await prisma.parkingZone.create({
        data: { name: "Secure", code: "SC", capacity: 5 },
      });
      const cam = await prisma.camera.create({
        data: { zoneId: zone.id, name: "SC Entry", identifier: "cam-sc", gateType: "ENTRY", status: "ONLINE" },
      });

      await request(secured)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: cam.identifier, sourceEventId: "auth1", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(401);

      await request(secured)
        .post(`/zones/${zone.id}/events`)
        .set("X-API-Key", "wrong")
        .send({ cameraIdentifier: cam.identifier, sourceEventId: "auth2", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(401);

      const res = await request(secured)
        .post(`/zones/${zone.id}/events`)
        .set("X-API-Key", "secret-key")
        .send({ cameraIdentifier: cam.identifier, sourceEventId: "auth3", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);

      expect(res.body.data.newOccupied).toBe(1);
    });
  });
});
