import request from "supertest";
import { prisma } from "@parada/database";
import { createApp } from "./app";
import { TokenService } from "./domain/token";

/**
 * Phase 6 — occupancy simulator + admin occupancy infrastructure.
 *
 * The simulator intentionally drives the SAME pipeline as real vision events:
 * it produces NormalizedVisionEvent inputs and submits them through
 * OccupancyService.processEvent(..., "SIMULATOR"). These tests verify the
 * simulator API surface (ADMIN-only), the eight deterministic scenarios, and
 * the admin operational endpoints (occupancy history, notifications).
 */

const TEST_SECRET = "test-secret-key-for-testing-only-32chars";
const tokenService = new TokenService({
  secret: TEST_SECRET,
  issuer: "parada-api-test",
  expiresIn: "1d",
});

const TABLES = [
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
];

async function cleanDatabase() {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }
}

interface SeedCtx {
  app: ReturnType<typeof createApp>;
  zoneId: string;
  zoneCode: string;
  capacity: number;
  adminToken: string;
  userToken: string;
  vehicleIds: string[];
  plates: string[];
}

async function seed(options?: { capacity?: number; vehicles?: number }): Promise<SeedCtx> {
  // Each seed is self-contained: wipe the DB so a fresh zone, cameras, users,
  // and vehicles are always created in isolation (no fixed-email collisions).
  await cleanDatabase();

  const capacity = options?.capacity ?? 8;
  const vehicleCount = options?.vehicles ?? 2;

  const zone = await prisma.parkingZone.create({
    data: { name: `Sim Zone ${capacity}`, code: `S${capacity}`, capacity, occupiedCount: 0 },
  });
  await prisma.camera.create({
    data: { zoneId: zone.id, name: "Sim Entry", identifier: `cam-sim-entry`, gateType: "ENTRY", status: "ONLINE" },
  });
  await prisma.camera.create({
    data: { zoneId: zone.id, name: "Sim Exit", identifier: "cam-sim-exit", gateType: "EXIT", status: "ONLINE" },
  });

  const admin = await prisma.user.create({
    data: { name: "Admin", email: "sim-admin@test.local", passwordHash: "x", role: "ADMIN" },
  });
  const user = await prisma.user.create({
    data: { name: "Driver", email: "sim-user@test.local", passwordHash: "x", role: "USER" },
  });

  const vehicleIds: string[] = [];
  const plates: string[] = [];
  for (let i = 0; i < vehicleCount; i++) {
    const plate = `SIM-${String(i + 1).padStart(3, "0")}`;
    const vehicle = await prisma.vehicle.create({
      data: {
        userId: user.id,
        plateNumber: plate,
        normalizedPlate: plate.replace(/[^A-Z0-9]/g, ""),
        vehicleType: "CAR",
        status: "ACTIVE",
      },
    });
    vehicleIds.push(vehicle.id);
    plates.push(plate);
  }

  return {
    app: createApp(),
    zoneId: zone.id,
    zoneCode: zone.code,
    capacity,
    adminToken: tokenService.sign({ id: admin.id, role: "ADMIN" }).token,
    userToken: tokenService.sign({ id: user.id, role: "USER" }).token,
    vehicleIds,
    plates,
  };
}

async function occupancy(app: ReturnType<typeof createApp>, zoneId: string) {
  const res = await request(app).get(`/zones/${zoneId}/occupancy`).expect(200);
  return res.body.data as { occupiedCount: number; availableCount: number };
}

describe("Phase 6 — occupancy simulator & admin infrastructure", () => {
  let ctx: SeedCtx;

  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    ctx = await seed();
  });

  describe("Simulator authorization", () => {
    it("rejects unauthenticated simulator requests", async () => {
      await request(ctx.app).get("/simulator/status").expect(401);
      await request(ctx.app)
        .post("/simulator/run")
        .send({ scenario: "SINGLE_ENTRY", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(401);
    });

    it("rejects a normal USER with 403", async () => {
      await request(ctx.app)
        .get("/simulator/status")
        .set("Authorization", `Bearer ${ctx.userToken}`)
        .expect(403);
      await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.userToken}`)
        .send({ scenario: "SINGLE_ENTRY", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(403);
    });

    it("lets an ADMIN run the simulator and marks events as SIMULATOR source", async () => {
      const res = await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "SINGLE_ENTRY", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(201);

      expect(res.body.data.scenario).toBe("SINGLE_ENTRY");
      expect(res.body.data.occupancy.occupiedCount).toBe(1);

      const events = await prisma.occupancyEvent.findMany();
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.source === "SIMULATOR")).toBe(true);
      expect(events.every((e) => e.source !== "CAMERA")).toBe(true);
    });

    it("rejects an unknown scenario with 400", async () => {
      await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "NOT_A_SCENARIO", zoneId: ctx.zoneId })
        .expect(400);
    });

    it("reports simulator status shape", async () => {
      await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "SINGLE_ENTRY", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(201);

      const res = await request(ctx.app)
        .get("/simulator/status")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(200);

      expect(res.body.data.runs).toBe(1);
      expect(res.body.data.eventsProcessed).toBe(1);
      expect(res.body.data.lastRunAt).toBeDefined();
      expect(res.body.data.scenarios).toEqual(
        expect.arrayContaining([
          "SINGLE_ENTRY",
          "SINGLE_EXIT",
          "MULTIPLE_ENTRIES",
          "MULTIPLE_EXITS",
          "FILL_ZONE",
          "UNKNOWN_VEHICLE",
          "DUPLICATE_EVENT",
          "COMPLETE_PARKING_LIFECYCLE",
        ])
      );
    });
  });

  describe("Simulator scenarios", () => {
    it("SINGLE_ENTRY — occupancy +1, session ACTIVE", async () => {
      const res = await request(ctx.app)
        .post("/simulator/scenario")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "SINGLE_ENTRY", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(200);

      expect(res.body.data.occupancy.occupiedCount).toBe(1);
      const session = res.body.data.events[0]!.session;
      expect(session.status).toBe("ACTIVE");

      const occ = await occupancy(ctx.app, ctx.zoneId);
      expect(occ.occupiedCount).toBe(1);
    });

    it("SINGLE_EXIT — occupancy -1, session COMPLETED with duration", async () => {
      await request(ctx.app)
        .post("/simulator/scenario")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "SINGLE_ENTRY", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(200);

      const res = await request(ctx.app)
        .post("/simulator/scenario")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "SINGLE_EXIT", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(200);

      const occ = await occupancy(ctx.app, ctx.zoneId);
      expect(occ.occupiedCount).toBe(0);

      const session = res.body.data.events[0]!.session;
      expect(session.status).toBe("COMPLETED");
      expect(session.exitedAt).not.toBeNull();
      expect(session.durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it("MULTIPLE_ENTRIES — each registered vehicle enters, occupancy matches", async () => {
      const res = await request(ctx.app)
        .post("/simulator/scenario")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "MULTIPLE_ENTRIES", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(200);

      expect(res.body.data.occupancy.occupiedCount).toBe(ctx.vehicleIds.length);
      expect(res.body.data.events).toHaveLength(ctx.vehicleIds.length);

      const active = await prisma.parkingSession.count({ where: { status: "ACTIVE" } });
      expect(active).toBe(ctx.vehicleIds.length);
    });

    it("MULTIPLE_EXITS — closes the sessions, occupancy returns to 0", async () => {
      await request(ctx.app)
        .post("/simulator/scenario")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "MULTIPLE_ENTRIES", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(200);

      const res = await request(ctx.app)
        .post("/simulator/scenario")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "MULTIPLE_EXITS", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(200);

      expect(res.body.data.occupancy.occupiedCount).toBe(0);
      const completed = await prisma.parkingSession.count({ where: { status: "COMPLETED" } });
      expect(completed).toBe(ctx.vehicleIds.length);
    });

    it("FILL_ZONE — fills to capacity, and further ENTRY is rejected", async () => {
      const res = await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "FILL_ZONE", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(201);

      expect(res.body.data.occupancy.occupiedCount).toBe(ctx.capacity);
      expect(res.body.data.occupancy.availableCount).toBe(0);

      // The overflow attempt is captured as a rejection.
      expect(res.body.data.rejects.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.rejects[0]!.message).toContain("full");

      // A direct ENTRY against the full zone must also 409 through the API.
      const other = await prisma.vehicle.create({
        data: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: "sim-user@test.local" } })).id, plateNumber: "SIM-999", normalizedPlate: "SIM999", vehicleType: "CAR", status: "ACTIVE" },
      });
      await request(ctx.app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({
          cameraIdentifier: "cam-sim-entry",
          sourceEventId: "fill-overflow-direct",
          eventType: "ENTRY",
          detectedPlate: other.plateNumber,
          ocrConfidence: 0.98,
        })
        .expect(409);

      // Occupancy is unchanged after the rejected attempts.
      const occ = await occupancy(ctx.app, ctx.zoneId);
      expect(occ.occupiedCount).toBe(ctx.capacity);
    });

    it("UNKNOWN_VEHICLE — occupancy changes, no fake vehicle/user/session, anomaly recorded", async () => {
      const res = await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "UNKNOWN_VEHICLE", zoneId: ctx.zoneId, unknownPlate: "XXX-9999" })
        .expect(201);

      expect(res.body.data.occupancy.occupiedCount).toBe(1);
      expect(await prisma.parkingSession.count()).toBe(0);
      expect(await prisma.vehicle.count()).toBe(ctx.vehicleIds.length);
      expect(await prisma.user.count()).toBe(2);

      const anomaly = await prisma.occupancyAnomaly.findFirst({ where: { anomalyType: "UNREGISTERED_PLATE" } });
      expect(anomaly).not.toBeNull();
      expect(res.body.data.events[0]!.anomaly.anomalyType).toBe("UNREGISTERED_PLATE");
    });

    it("DUPLICATE_EVENT — first processed, second rejected, occupancy changes once", async () => {
      const res = await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "DUPLICATE_EVENT", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(201);

      expect(res.body.data.occupancy.occupiedCount).toBe(1);
      expect(res.body.data.rejects.length).toBe(1);
      expect(await prisma.occupancyEvent.count()).toBe(1);
    });

    it("COMPLETE_PARKING_LIFECYCLE — ENTRY -> ACTIVE -> EXIT -> COMPLETED", async () => {
      const res = await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "COMPLETE_PARKING_LIFECYCLE", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(201);

      const kinds = res.body.data.events.map((e: Record<string, unknown>) => e.kind);
      expect(kinds).toEqual(["ENTRY", "EXIT", "PARKING_SESSION"]);

      const session = res.body.data.events.find((e: Record<string, unknown>) => e.kind === "PARKING_SESSION").session;
      expect(session.status).toBe("COMPLETED");
      expect(session.enteredAt).not.toBeNull();
      expect(session.exitedAt).not.toBeNull();
      expect(session.durationSeconds).toBeGreaterThanOrEqual(0);

      expect(res.body.data.occupancy.occupiedCount).toBe(0);
    });
  });

  describe("Occupancy history (admin)", () => {
    it("rejects a USER with 403 and allows an ADMIN", async () => {
      await request(ctx.app)
        .get(`/admin/zones/${ctx.zoneId}/history`)
        .set("Authorization", `Bearer ${ctx.userToken}`)
        .expect(403);

      const res = await request(ctx.app)
        .get(`/admin/zones/${ctx.zoneId}/history`)
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(200);

      expect(res.body.data.zone.id).toBe(ctx.zoneId);
      expect(res.body.data.entries).toEqual([]);
    });

    it("returns historical snapshots from real events", async () => {
      await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "MULTIPLE_ENTRIES", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(201);

      const res = await request(ctx.app)
        .get(`/admin/zones/${ctx.zoneId}/history`)
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(200);

      expect(res.body.data.entries.length).toBe(ctx.vehicleIds.length);
      const seq = res.body.data.entries.map((e: Record<string, unknown>) => e.occupiedCount);
      expect(seq).toEqual([1, 2]);
      expect(res.body.data.entries[0]!.availableCount).toBe(ctx.capacity - 1);
    });

    it("supports time-range filtering (from/to)", async () => {
      await request(ctx.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .send({ scenario: "MULTIPLE_ENTRIES", zoneId: ctx.zoneId, vehicleIds: ctx.vehicleIds })
        .expect(201);

      const all = await prisma.occupancyHistory.findMany({ where: { zoneId: ctx.zoneId }, orderBy: { occurredAt: "asc" } });
      expect(all.length).toBe(ctx.vehicleIds.length);

      // Filter to only the second event onward (slice between first and now).
      const between = await request(ctx.app)
        .get(`/admin/zones/${ctx.zoneId}/history?from=${encodeURIComponent(all[0]!.occurredAt.toISOString())}&to=${encodeURIComponent(new Date().toISOString())}`)
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(200);

      expect(between.body.data.entries.length).toBeGreaterThanOrEqual(1);

      // A 'from' after all events returns nothing new.
      const future = await request(ctx.app)
        .get(`/admin/zones/${ctx.zoneId}/history?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`)
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(200);
      expect(future.body.data.entries).toEqual([]);

      // limit applies.
      const limited = await request(ctx.app)
        .get(`/admin/zones/${ctx.zoneId}/history?limit=1`)
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(200);
      expect(limited.body.data.entries.length).toBe(1);
    });

    it("404s for an unknown zone and validates bad params", async () => {
      await request(ctx.app)
        .get("/admin/zones/nope/history")
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(404);
      await request(ctx.app)
        .get(`/admin/zones/${ctx.zoneId}/history?from=not-a-date`)
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(400);
      await request(ctx.app)
        .get(`/admin/zones/${ctx.zoneId}/history?limit=0`)
        .set("Authorization", `Bearer ${ctx.adminToken}`)
        .expect(400);
    });
  });

  describe("Notifications (operational, ADMIN)", () => {
    it("creates ZONE_FULL and ZONE_LOW_AVAILABILITY on transitions only (no spam)", async () => {
      // capacity 8: low availability when avail <= 1.6 => occupied >= 7.
      const fill = await seed({ capacity: 8, vehicles: 2 });
      await request(fill.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${fill.adminToken}`)
        .send({ scenario: "FILL_ZONE", zoneId: fill.zoneId, vehicleIds: fill.vehicleIds })
        .expect(201);

      const notifications = await prisma.notification.findMany({ where: { zoneId: fill.zoneId }, orderBy: { createdAt: "asc" } });
      const types = notifications.map((n) => n.type);

      // Filling occupies 1..8: LOW on the first cross (occupied >= 7), FULL on 8.
      expect(types.filter((t) => t === "ZONE_LOW_AVAILABILITY").length).toBe(1);
      expect(types.filter((t) => t === "ZONE_FULL").length).toBe(1);
      // The fill pads with 6 unknown vehicles AFTER the registered ones, so
      // subsequent entries while already low must not add more notifications.
      expect(notifications.every((n) => n.targetRole === "ADMIN")).toBe(true);
    });

    it("re-triggers on a fresh transition after draining below the threshold", async () => {
      const raw = await seed({ capacity: 20, vehicles: 8 });
      const run = (scenario: string) =>
        request(raw.app)
          .post("/simulator/run")
          .set("Authorization", `Bearer ${raw.adminToken}`)
          .send({ scenario, zoneId: raw.zoneId, vehicleIds: raw.vehicleIds })
          .expect(201);

      await run("FILL_ZONE"); // LOW once (avail <= 4), FULL once (20) -> 2
      const before = await prisma.notification.count({ where: { zoneId: raw.zoneId } });
      expect(before).toBe(2);

      // Drain the 8 registered vehicles (occupancy 20 -> 12, above low threshold).
      await run("MULTIPLE_EXITS");
      const afterExit = await prisma.notification.count({ where: { zoneId: raw.zoneId } });
      expect(afterExit).toBe(before); // exitting never adds notifications

      // Refill to cross the threshold again -> a NEW LOW + FULL transition.
      await run("FILL_ZONE");
      const afterRefill = await prisma.notification.count({ where: { zoneId: raw.zoneId } });
      expect(afterRefill).toBe(before + 2);
    });

    it("rejects an overflow without state changes or new notifications", async () => {
      // capacity 1: the single ENTRY both fills AND becomes low-available, so
      // exactly one ZONE_LOW_AVAILABILITY + one ZONE_FULL notification fire.
      const tiny = await seed({ capacity: 1, vehicles: 1 });
      await request(tiny.app)
        .post("/simulator/run")
        .set("Authorization", `Bearer ${tiny.adminToken}`)
        .send({ scenario: "SINGLE_ENTRY", zoneId: tiny.zoneId, vehicleIds: tiny.vehicleIds })
        .expect(201);

      const occBefore = (await occupancy(tiny.app, tiny.zoneId)).occupiedCount;
      expect(occBefore).toBe(1);
      expect(await prisma.notification.count({ where: { zoneId: tiny.zoneId } })).toBe(2);

      // A rejected ENTRY on the full zone must leave occupancy, events, and
      // notifications untouched (transactional rollback behavior).
      await request(tiny.app)
        .post(`/zones/${tiny.zoneId}/events`)
        .send({ cameraIdentifier: "cam-sim-entry", sourceEventId: "x-overflow", eventType: "ENTRY", detectedPlate: "SIM-999", ocrConfidence: 0.98 })
        .expect(409);

      expect((await occupancy(tiny.app, tiny.zoneId)).occupiedCount).toBe(occBefore);
      expect(await prisma.notification.count({ where: { zoneId: tiny.zoneId } })).toBe(2);
      expect(await prisma.occupancyEvent.count({ where: { zoneId: tiny.zoneId } })).toBe(1);
    });
  });
});