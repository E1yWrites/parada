import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "@parada/database";
import { createApp, type AppOptions } from "./app";
import { ConfigService } from "./domain/config";

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

/** Seeds the EstablishmentConfig singleton so guests are admitted to `primaryZoneId`. */
async function seedGuestPrimaryZone(primaryZoneId: string, allowWhenFull = false): Promise<ConfigService> {
  await prisma.establishmentConfig.upsert({
    where: { id: "singleton" },
    update: {
      guestPolicy: {
        policy: "PRIMARY_ZONE",
        primaryZoneId,
        maxDurationHours: 8,
        allowWhenFull,
      },
    },
    create: {
      id: "singleton",
      guestPolicy: {
        policy: "PRIMARY_ZONE",
        primaryZoneId,
        maxDurationHours: 8,
        allowWhenFull,
      },
      parkingFee: {},
      violations: {},
      zoneDefaults: {},
    },
  });
  return new ConfigService();
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
    it("denies the guest (no fake vehicle/user/session, occupancy unchanged)", async () => {
      const res = await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s4", eventType: "ENTRY", detectedPlate: "ZZZ-0001", ocrConfidence: 0.85 })
        .expect(201);

      expect(res.body.data.admitted).toBe(false);
      expect(res.body.data.deniedReason).toBe("GUEST_POLICY_MISCONFIGURED");

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(0);

      expect(await sessions()).toHaveLength(0);
      expect(await prisma.vehicle.count()).toBe(2);
      expect(await prisma.user.count()).toBe(1);

      const anomaly = await prisma.occupancyAnomaly.findFirst();
      expect(anomaly).not.toBeNull();
      expect(anomaly!.anomalyType).toBe("GUEST_DENIED");
    });
  });

  describe("Scenario 4b — admitted guest (primary zone configured)", () => {
    it("admits the guest to the primary zone and creates an account-less session", async () => {
      const g = await seedZone(5, "gz");
      const gApp = createApp({ config: await seedGuestPrimaryZone(g.zoneId) });
      const res = await request(gApp)
        .post(`/zones/${g.zoneId}/events`)
        .send({ cameraIdentifier: g.entryCamId, sourceEventId: "g1", eventType: "ENTRY", detectedPlate: "ZZZ-0100", ocrConfidence: 0.85 })
        .expect(201);

      expect(res.body.data.admitted).toBe(true);
      expect(res.body.data.deniedReason).toBeNull();
      expect(res.body.data.newOccupied).toBe(1);
      expect(res.body.data.guestSessionId).not.toBeNull();

      const session = await prisma.parkingSession.findUnique({
        where: { id: res.body.data.guestSessionId },
        include: { guestSession: true },
      });
      expect(session).not.toBeNull();
      expect(session!.userId).toBeNull();
      expect(session!.vehicleId).toBeNull();
      expect(session!.status).toBe("ACTIVE");

      const guest = await prisma.guestSession.findUnique({
        where: { parkingSessionId: res.body.data.guestSessionId },
      });
      expect(guest!.detectedPlate).toBe("ZZZ0100");
    });

    it("closes a guest only in its admitted zone and ignores duplicate exits", async () => {
      const g = await seedZone(5, "gx");
      const other = await seedZone(5, "gy");
      const gApp = createApp({ config: await seedGuestPrimaryZone(g.zoneId) });

      await request(gApp)
        .post(`/zones/${g.zoneId}/events`)
        .send({ cameraIdentifier: g.entryCamId, sourceEventId: "gx-entry", eventType: "ENTRY", detectedPlate: "GUEST-0100" })
        .expect(201);

      const wrongZone = await request(gApp)
        .post(`/zones/${other.zoneId}/events`)
        .send({ cameraIdentifier: other.exitCamId, sourceEventId: "gx-wrong-exit", eventType: "EXIT", detectedPlate: "GUEST-0100" })
        .expect(201);
      expect(wrongZone.body.data.deniedReason).toBe("GUEST_EXIT_WRONG_ZONE");
      expect((await occupancy()).occupiedCount).toBe(0);
      expect((await request(gApp).get(`/zones/${other.zoneId}/occupancy`).expect(200)).body.data.occupiedCount).toBe(0);

      await request(gApp)
        .post(`/zones/${g.zoneId}/events`)
        .send({ cameraIdentifier: g.exitCamId, sourceEventId: "gx-exit", eventType: "EXIT", detectedPlate: "GUEST-0100" })
        .expect(201);
      expect((await request(gApp).get(`/zones/${g.zoneId}/occupancy`).expect(200)).body.data.occupiedCount).toBe(0);

      const duplicate = await request(gApp)
        .post(`/zones/${g.zoneId}/events`)
        .send({ cameraIdentifier: g.exitCamId, sourceEventId: "gx-duplicate-exit", eventType: "EXIT", detectedPlate: "GUEST-0100" })
        .expect(201);
      expect(duplicate.body.data.deniedReason).toBe("GUEST_EXIT_WITHOUT_SESSION");
      expect((await request(gApp).get(`/zones/${g.zoneId}/occupancy`).expect(200)).body.data.occupiedCount).toBe(0);
    });

    it("denies allowWhenFull rather than violating the occupancy invariant", async () => {
      const g = await seedZone(1, "go");
      const gApp = createApp({ config: await seedGuestPrimaryZone(g.zoneId, true) });
      const user = await prisma.user.create({
        data: { name: "Overflow Driver", email: "overflow-driver@test.local", passwordHash: "x", role: "USER" },
      });
      await prisma.vehicle.create({
        data: {
          userId: user.id,
          plateNumber: "OVERFLOW-0100",
          normalizedPlate: "OVERFLOW0100",
          vehicleType: "CAR",
          status: "ACTIVE",
        },
      });
      await request(gApp)
        .post(`/zones/${g.zoneId}/events`)
        .send({ cameraIdentifier: g.entryCamId, sourceEventId: "go-fill", eventType: "ENTRY", detectedPlate: "OVERFLOW-0100" })
        .expect(201);

      const denied = await request(gApp)
        .post(`/zones/${g.zoneId}/events`)
        .send({ cameraIdentifier: g.entryCamId, sourceEventId: "go-guest", eventType: "ENTRY", detectedPlate: "UNKNOWN-0100" })
        .expect(201);
      expect(denied.body.data.admitted).toBe(false);
      expect(denied.body.data.deniedReason).toBe("GUEST_ZONE_FULL");
      expect(denied.body.data.newOccupied).toBe(1);
      expect((await request(gApp).get(`/zones/${g.zoneId}/occupancy`).expect(200)).body.data.occupiedCount).toBe(1);
      expect(await prisma.guestSession.count({ where: { session: { zoneId: g.zoneId } } })).toBe(0);
    });
  });

  describe("Scenario 5 — low-confidence plate", () => {
    it("treats the low-confidence plate as an untrusted guest (denied, no session)", async () => {
      // Threshold is 0.5; a 0.3-confidence plate below the threshold must not
      // create a registered session even though it matches a registered vehicle.
      const res = await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "s5", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.3 })
        .expect(201);

      expect(res.body.data.plateMatched).toBe(false);
      expect(res.body.data.admitted).toBe(false);
      expect(res.body.data.deniedReason).toBe("GUEST_POLICY_MISCONFIGURED");
      expect(await sessions()).toHaveLength(0);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(0);

      const anomaly = await prisma.occupancyAnomaly.findFirst();
      expect(anomaly!.anomalyType).toBe("GUEST_DENIED");
    });
  });

  describe("Scenario 5b — reservation camera integration", () => {
    it("activates a valid reservation only after a successful registered ENTRY", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Reservation Camera Zone", code: "RCZ", capacity: 2 },
      });
      const camera = await prisma.camera.create({
        data: { zoneId: zone.id, name: "RCZ Entry", identifier: "cam-rcz-entry", gateType: "ENTRY", status: "ONLINE" },
      });
      const user = await prisma.user.create({
        data: { name: "Reservation Driver", email: "reservation-camera@test.local", passwordHash: "x", role: "USER" },
      });
      const vehicle = await prisma.vehicle.create({
        data: { userId: user.id, plateNumber: "RES-CAM-1", normalizedPlate: "RESCAM1", vehicleType: "CAR", status: "ACTIVE" },
      });
      const reservation = await prisma.reservation.create({
        data: {
          userId: user.id,
          vehicleId: vehicle.id,
          zoneId: zone.id,
          startAt: new Date(Date.now() - 60_000),
          endAt: new Date(Date.now() + 15 * 60_000),
          status: "CONFIRMED",
        },
      });

      await request(app)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: camera.identifier, sourceEventId: "reservation-entry", eventType: "ENTRY", detectedPlate: vehicle.plateNumber })
        .expect(201);

      expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("ACTIVE");
    });

    it("does not consume a reservation when the registered ENTRY is rejected at capacity", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Reservation Full Zone", code: "RFZ", capacity: 1 },
      });
      const camera = await prisma.camera.create({
        data: { zoneId: zone.id, name: "RFZ Entry", identifier: "cam-rfz-entry", gateType: "ENTRY", status: "ONLINE" },
      });
      const user = await prisma.user.create({
        data: { name: "Reserved Driver", email: "reserved-full@test.local", passwordHash: "x", role: "USER" },
      });
      const reservedVehicle = await prisma.vehicle.create({
        data: { userId: user.id, plateNumber: "RES-FULL-1", normalizedPlate: "RESFULL1", vehicleType: "CAR", status: "ACTIVE" },
      });
      const occupyingVehicle = await prisma.vehicle.create({
        data: { userId: user.id, plateNumber: "RES-FULL-2", normalizedPlate: "RESFULL2", vehicleType: "CAR", status: "ACTIVE" },
      });
      const reservation = await prisma.reservation.create({
        data: {
          userId: user.id,
          vehicleId: reservedVehicle.id,
          zoneId: zone.id,
          startAt: new Date(Date.now() - 60_000),
          endAt: new Date(Date.now() + 15 * 60_000),
          status: "CONFIRMED",
        },
      });

      await request(app)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: camera.identifier, sourceEventId: "reservation-fill", eventType: "ENTRY", detectedPlate: occupyingVehicle.plateNumber })
        .expect(201);
      await request(app)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: camera.identifier, sourceEventId: "reservation-rejected", eventType: "ENTRY", detectedPlate: reservedVehicle.plateNumber })
        .expect(409);

      expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("CONFIRMED");
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
    it("rejects a registered ENTRY at capacity without changing occupancy", async () => {
      // Build an isolated zone with its OWN user + unique registered plates so
      // they never collide with the beforeEach ctx plates (which would create
      // ambiguity and route the vehicle to the guest path).
      const zone = await prisma.parkingZone.create({
        data: { name: "Zone FZ", code: "FZ", capacity: 1, occupiedCount: 0 },
      });
      const entry = await prisma.camera.create({
        data: { zoneId: zone.id, name: "FZ Entry", identifier: "cam-fz2-entry", gateType: "ENTRY", status: "ONLINE" },
      });
      const user = await prisma.user.create({
        data: { name: "FZ Driver", email: `fz2-${randomUUID()}@test.local`, passwordHash: "x", role: "USER" },
      });
      const v1 = await prisma.vehicle.create({
        data: { userId: user.id, plateNumber: "FZ-REG-1", normalizedPlate: "FZREG1", vehicleType: "CAR", status: "ACTIVE" },
      });
      const v2 = await prisma.vehicle.create({
        data: { userId: user.id, plateNumber: "FZ-REG-2", normalizedPlate: "FZREG2", vehicleType: "CAR", status: "ACTIVE" },
      });

      const fullApp = createApp();
      await request(fullApp)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: entry.identifier, sourceEventId: "s7a", eventType: "ENTRY", detectedPlate: v1.plateNumber, ocrConfidence: 0.96 })
        .expect(201);

      const before = await request(fullApp).get(`/zones/${zone.id}/occupancy`).expect(200);
      expect(before.body.data.occupiedCount).toBe(1);

      await request(fullApp)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: entry.identifier, sourceEventId: "s7b", eventType: "ENTRY", detectedPlate: v2.plateNumber, ocrConfidence: 0.9 })
        .expect(409);

      const after = await request(fullApp).get(`/zones/${zone.id}/occupancy`).expect(200);
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

  describe("Event validation (400)", () => {
    it("rejects a missing sourceEventId", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(400);
    });

    it("rejects a missing cameraIdentifier", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ sourceEventId: "v1", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(400);
    });

    it("rejects an invalid event type", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "v2", eventType: "SOMETHING", detectedPlate: "ABC-1234" })
        .expect(400);
    });

    it("rejects an out-of-range OCR confidence", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "v3", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 1.5 })
        .expect(400);
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "v4", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: -0.1 })
        .expect(400);
    });

    it("rejects a malformed detectedAt timestamp", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "v5", eventType: "ENTRY", detectedPlate: "ABC-1234", detectedAt: "not-a-date" })
        .expect(400);
      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(0);
    });
  });

  describe("Camera resolution", () => {
    it("rejects an event from an unknown camera", async () => {
      const res = await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: "no-such-camera", sourceEventId: "c1", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect((await occupancy()).occupiedCount).toBe(0);
    });

    it("rejects an ENTRY event on an EXIT-only camera", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.exitCamId, sourceEventId: "c2", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(409);
      expect((await occupancy()).occupiedCount).toBe(0);
    });
  });

  describe("BIDIRECTIONAL camera", () => {
    it("accepts both ENTRY and EXIT events", async () => {
      const bi = await prisma.camera.create({
        data: { zoneId: ctx.zoneId, name: "Bi Cam", identifier: "cam-bi", gateType: "BIDIRECTIONAL", status: "ONLINE" },
      });

      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: bi.identifier, sourceEventId: "bi1", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);
      expect((await occupancy()).occupiedCount).toBe(1);

      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: bi.identifier, sourceEventId: "bi2", eventType: "EXIT", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);
      expect((await occupancy()).occupiedCount).toBe(0);
    });
  });

  describe("OCR confidence policy", () => {
    it("trusts a registered plate when OCR confidence is absent (trusted source)", async () => {
      const res = await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "oc1", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(201);
      expect(res.body.data.plateMatched).toBe(true);
      const all = await sessions();
      expect(all).toHaveLength(1);
      expect(all[0]!.vehicleId).toBe(ctx.vehicleABC);
      expect(all[0]!.status).toBe("ACTIVE");
    });

    it("normalizes a plate before matching a registered vehicle", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "oc2", eventType: "ENTRY", detectedPlate: "abc-1 234", ocrConfidence: 0.95 })
        .expect(201);
      const all = await sessions();
      expect(all).toHaveLength(1);
      expect(all[0]!.vehicleId).toBe(ctx.vehicleABC);
    });
  });

  describe("Occupancy idempotency — duplicate EXIT", () => {
    it("does not double-decrement or duplicate state for a repeated EXIT", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "de1", eventType: "ENTRY", detectedPlate: "ABC-1234", ocrConfidence: 0.96 })
        .expect(201);

      const exitBody = { cameraIdentifier: ctx.exitCamId, sourceEventId: "de2", eventType: "EXIT", detectedPlate: "ABC-1234", ocrConfidence: 0.98 };
      await request(app).post(`/zones/${ctx.zoneId}/events`).send(exitBody).expect(201);
      await request(app).post(`/zones/${ctx.zoneId}/events`).send(exitBody).expect(409);

      const occ = await occupancy();
      expect(occ.occupiedCount).toBe(0);
      expect(await prisma.occupancyEvent.count({ where: { eventType: "EXIT" } })).toBe(1);

      const all = await sessions();
      expect(all).toHaveLength(1);
      expect(all[0]!.status).toBe("COMPLETED");
    });
  });

  describe("Camera authentication — trusted-machine boundary", () => {
    it("rejects a user JWT even when it is a valid backend token (cannot impersonate a camera)", async () => {
      // A signed Bearer JWT (valid authentication) without the camera API key must
      // NOT be sufficient to submit vision events.
      const userJwt = jwt.sign(
        { sub: "some-user", jti: randomUUID(), role: "USER" },
        "test-secret-key-for-testing-only-32chars",
        { algorithm: "HS256", issuer: "parada-api-test", expiresIn: "1h" }
      );
      const secured = createApp({ cameraApiKey: "secret-camera-key" });

      await request(secured)
        .post(`/zones/${ctx.zoneId}/events`)
        .set("Authorization", `Bearer ${userJwt}`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "jwt1", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(401);

      expect(await prisma.occupancyEvent.count()).toBe(0);
    });
  });

  describe("Transaction safety — no partial state on rejected write", () => {
    it("leaves no partial occupancy/event/history/session/notification when an EXIT is rejected", async () => {
      // Zone A starts at occupiedCount 0 in a fresh beforeEach. An EXIT on an
      // empty zone is physically invalid -> the transaction must roll back.
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.exitCamId, sourceEventId: "tx1", eventType: "EXIT", detectedPlate: "ABC-1234", ocrConfidence: 0.95 })
        .expect(409);

      expect((await occupancy()).occupiedCount).toBe(0);
      expect(await prisma.occupancyEvent.count()).toBe(0);
      expect(await prisma.occupancyHistory.count()).toBe(0);
      expect(await prisma.parkingSession.count()).toBe(0);
      expect(await prisma.notification.count()).toBe(0);
      expect(await prisma.occupancyAnomaly.count()).toBe(0);
    });
  });
});
