import request from "supertest";
import { prisma } from "@parada/database";
import { createApp, type AppOptions } from "./app";

const TABLES = [
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
  zoneId: string;
  capacity: number;
  entryCamId: string;
  exitCamId: string;
  userId: string;
  vehicleId: string;
  normalizedPlate: string;
  zoneCode: string;
  zoneName: string;
}

async function seedZone(options?: {
  capacity?: number;
  slug?: string;
}): Promise<SeedCtx> {
  const capacity = options?.capacity ?? 5;
  const slug = options?.slug ?? "tz";
  const code = slug.toUpperCase();
  const zone = await prisma.parkingZone.create({
    data: { name: `${code} Test Zone`, code, capacity, occupiedCount: 0 },
  });
  const entry = await prisma.camera.create({
    data: { zoneId: zone.id, name: `${code} Entry`, identifier: `cam-${slug}-entry`, gateType: "ENTRY", status: "ONLINE" },
  });
  const exit = await prisma.camera.create({
    data: { zoneId: zone.id, name: `${code} Exit`, identifier: `cam-${slug}-exit`, gateType: "EXIT", status: "ONLINE" },
  });
  const user = await prisma.user.create({
    data: { name: "Driver", email: `${slug}@test.local`, passwordHash: "x", role: "USER" },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      userId: user.id,
      plateNumber: "ABC-1234",
      normalizedPlate: "ABC1234",
      vehicleType: "CAR",
      status: "ACTIVE",
    },
  });
  return {
    zoneId: zone.id,
    capacity,
    entryCamId: entry.identifier,
    exitCamId: exit.identifier,
    userId: user.id,
    vehicleId: vehicle.id,
    normalizedPlate: vehicle.normalizedPlate,
    zoneCode: zone.code,
    zoneName: zone.name,
  };
}

describe("PARADA API", () => {
  let app: ReturnType<typeof createApp>;
  let ctx: SeedCtx;

  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
    ctx = await seedZone();
    const options: AppOptions = {};
    app = createApp(options);
  });

  describe("GET /health", () => {
    it("reports healthy when DB is reachable", async () => {
      const res = await request(app).get("/health").expect(200);
      expect(res.body.data).toEqual({ status: "ok", database: "connected" });
    });
  });

  describe("GET /zones", () => {
    it("returns active zones with occupancy", async () => {
      const res = await request(app).get("/zones").expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const zone = res.body.data.find((z: { code: string }) => z.code === ctx.zoneCode);
      expect(zone).toBeDefined();
      expect(zone.availableCount).toBe(ctx.capacity);
      expect(zone.occupiedCount).toBe(0);
    });
  });

  describe("GET /zones/:id/occupancy", () => {
    it("returns occupancy for a known zone", async () => {
      const res = await request(app).get(`/zones/${ctx.zoneId}/occupancy`).expect(200);
      expect(res.body.data.occupiedCount).toBe(0);
      expect(res.body.data.availableCount).toBe(ctx.capacity);
    });

    it("404s for an unknown zone", async () => {
      await request(app).get("/zones/nope/occupancy").expect(404);
    });
  });

  describe("POST /zones/:id/events — camera input boundary", () => {
    it("records an ENTRY, updates occupancy, and opens a session for a registered vehicle", async () => {
      const res = await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({
          cameraIdentifier: ctx.entryCamId,
          sourceEventId: "evt-entry-1",
          eventType: "ENTRY",
          detectedPlate: "ABC-1234",
          ocrConfidence: 0.96,
        })
        .expect(201);

      expect(res.body.data.eventType).toBe("ENTRY");
      expect(res.body.data.normalizedPlate).toBe("ABC1234");
      expect(res.body.data.plateMatched).toBe(true);
      expect(res.body.data.newOccupied).toBe(1);

      const occ = await request(app).get(`/zones/${ctx.zoneId}/occupancy`).expect(200);
      expect(occ.body.data.occupiedCount).toBe(1);
      expect(occ.body.data.availableCount).toBe(ctx.capacity - 1);

      const session = await prisma.parkingSession.findFirst({ where: { vehicleId: ctx.vehicleId } });
      expect(session).not.toBeNull();
      expect(session!.status).toBe("ACTIVE");
    });

    it("records an EXIT, closes the session, and computes duration", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({
          cameraIdentifier: ctx.entryCamId,
          sourceEventId: "evt-in",
          eventType: "ENTRY",
          detectedPlate: "ABC-1234",
        })
        .expect(201);

      const started = await prisma.parkingSession.findFirstOrThrow({ where: { vehicleId: ctx.vehicleId } });

      const res = await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({
          cameraIdentifier: ctx.exitCamId,
          sourceEventId: "evt-out",
          eventType: "EXIT",
          detectedPlate: "ABC-1234",
        })
        .expect(201);

      expect(res.body.data.newOccupied).toBe(0);

      const finished = await prisma.parkingSession.findFirstOrThrow({ where: { id: started.id } });
      expect(finished.status).toBe("COMPLETED");
      expect(finished.exitEventId).not.toBeNull();
      expect(finished.durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it("records an unknown vehicle without creating a session", async () => {
      const res = await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({
          cameraIdentifier: ctx.entryCamId,
          sourceEventId: "evt-unknown",
          eventType: "ENTRY",
          detectedPlate: "ZZZ-0009",
          ocrConfidence: 0.8,
        })
        .expect(201);

      expect(res.body.data.plateMatched).toBe(false);
      expect(res.body.data.vehicleId).toBeNull();
      expect(res.body.data.newOccupied).toBe(1);

      const sessionCount = await prisma.parkingSession.count();
      expect(sessionCount).toBe(0);

      const occ = await request(app).get(`/zones/${ctx.zoneId}/occupancy`).expect(200);
      expect(occ.body.data.occupiedCount).toBe(1);
    });

    it("404s for an unknown camera", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: "cam-ghost", sourceEventId: "e1", eventType: "ENTRY" })
        .expect(404);
    });

    it("409s when the camera belongs to another zone", async () => {
      const other = await prisma.parkingZone
        .create({ data: { name: "Other", code: "OT", capacity: 3 } })
        .then((z) =>
          prisma.camera.create({
            data: { zoneId: z.id, name: "OT Cam", identifier: "cam-ot", gateType: "ENTRY", status: "ONLINE" },
          })
        );
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: other.identifier, sourceEventId: "e1", eventType: "ENTRY" })
        .expect(409);
    });

    it("409s on a duplicate sourceEventId (idempotency)", async () => {
      const body = { cameraIdentifier: ctx.entryCamId, sourceEventId: "dup", eventType: "ENTRY", detectedPlate: "ABC-1234" };
      await request(app).post(`/zones/${ctx.zoneId}/events`).send(body).expect(201);
      await request(app).post(`/zones/${ctx.zoneId}/events`).send(body).expect(409);
    });

    it("409s on ENTRY when the zone is full", async () => {
      const full = await seedZone({ capacity: 1, slug: "full" });
      const fullApp = createApp();
      await request(fullApp)
        .post(`/zones/${full.zoneId}/events`)
        .send({ cameraIdentifier: full.entryCamId, sourceEventId: "f1", eventType: "ENTRY", detectedPlate: "ABC-1234" })
        .expect(201);
      await request(fullApp)
        .post(`/zones/${full.zoneId}/events`)
        .send({ cameraIdentifier: full.entryCamId, sourceEventId: "f2", eventType: "ENTRY", detectedPlate: "XYZ-9999" })
        .expect(409);
    });

    it("409s on EXIT when the zone is empty", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.exitCamId, sourceEventId: "e1", eventType: "EXIT", detectedPlate: "ABC-1234" })
        .expect(409);
    });

    it("400s on an invalid eventType", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "e1", eventType: "SOMETIMES" })
        .expect(400);
    });

    it("400s when required fields are missing", async () => {
      await request(app).post(`/zones/${ctx.zoneId}/events`).send({}).expect(400);
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ sourceEventId: "x", eventType: "ENTRY" })
        .expect(400);
    });

    it("400s on an out-of-range ocrConfidence", async () => {
      await request(app)
        .post(`/zones/${ctx.zoneId}/events`)
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "e1", eventType: "ENTRY", ocrConfidence: 5 })
        .expect(400);
    });

    it("404s when the zone does not exist", async () => {
      await request(app)
        .post("/zones/missing/events")
        .send({ cameraIdentifier: ctx.entryCamId, sourceEventId: "e1", eventType: "ENTRY" })
        .expect(404);
    });
  });
});
