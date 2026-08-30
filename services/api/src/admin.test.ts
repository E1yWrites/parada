import request from "supertest";
import * as argon2 from "argon2";
import { prisma } from "@parada/database";
import { createApp, type AppOptions } from "./app";

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

describe("Admin endpoints", () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let userToken: string;
  let zoneId: string;
  let entryIdentifier: string;
  let exitIdentifier: string;
  let vehicleId: string;
  let plateNumber: string;

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    const options: AppOptions = {};
    app = createApp(options);

    const zone = await prisma.parkingZone.create({
      data: { name: "Admin Test Zone", code: "AT", capacity: 4, occupiedCount: 0 },
    });
    zoneId = zone.id;
    const entry = await prisma.camera.create({
      data: {
        zoneId: zone.id,
        name: "AT Entry",
        identifier: "cam-at-entry",
        gateType: "ENTRY",
        status: "ONLINE",
      },
    });
    entryIdentifier = entry.identifier;
    await prisma.camera.create({
      data: {
        zoneId: zone.id,
        name: "AT Exit",
        identifier: "cam-at-exit",
        gateType: "EXIT",
        status: "ONLINE",
      },
    });
    exitIdentifier = "cam-at-exit";

    await prisma.user.create({
      data: {
        name: "Admin",
        email: "admin-a@test.local",
        passwordHash: await argon2.hash("AdminPass123!", { type: argon2.argon2id }),
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    const driver = await prisma.user.create({
      data: {
        name: "Driver",
        email: "driver-a@test.local",
        passwordHash: await argon2.hash("DriverPass123!", { type: argon2.argon2id }),
        role: "USER",
        status: "ACTIVE",
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        userId: driver.id,
        plateNumber: "ADM-100",
        normalizedPlate: "ADM100",
        vehicleType: "CAR",
        status: "ACTIVE",
      },
    });
    vehicleId = vehicle.id;
    plateNumber = vehicle.plateNumber;

    const adminLogin = await request(app)
      .post("/auth/login")
      .send({ email: "admin-a@test.local", password: "AdminPass123!" })
      .expect(200);
    const userLogin = await request(app)
      .post("/auth/login")
      .send({ email: "driver-a@test.local", password: "DriverPass123!" })
      .expect(200);
    adminToken = adminLogin.body.data.token;
    userToken = userLogin.body.data.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Authorization", () => {
    it("returns 401 when unauthenticated", async () => {
      await request(app).get("/admin/dashboard").expect(401);
      await request(app).get("/admin/cameras").expect(401);
      await request(app).get("/admin/notifications").expect(401);
      await request(app).get("/admin/anomalies").expect(401);
    });

    it("returns 403 for a USER on every admin endpoint", async () => {
      await request(app).get("/admin/dashboard").set("Authorization", `Bearer ${userToken}`).expect(403);
      await request(app).get("/admin/cameras").set("Authorization", `Bearer ${userToken}`).expect(403);
      await request(app).get("/admin/notifications").set("Authorization", `Bearer ${userToken}`).expect(403);
      await request(app).get("/admin/anomalies").set("Authorization", `Bearer ${userToken}`).expect(403);
      await request(app).get("/admin/zones").set("Authorization", `Bearer ${userToken}`).expect(403);
      await request(app)
        .patch(`/admin/notifications/some-id/read`)
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe("GET /admin/dashboard", () => {
    it("returns authoritative facility summary", async () => {
      const res = await request(app)
        .get("/admin/dashboard")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const d = res.body.data;
      expect(d.summary.totalZones).toBe(1);
      expect(d.summary.totalCapacity).toBe(4);
      expect(d.summary.totalOccupied).toBe(0);
      expect(d.summary.totalAvailable).toBe(4);
      expect(d.summary.onlineCameras).toBe(2);
      expect(d.summary.offlineCameras).toBe(0);
      expect(Array.isArray(d.zones)).toBe(true);
      expect(Array.isArray(d.lowZones)).toBe(true);
      expect(Array.isArray(d.fullZones)).toBe(true);
    });

    it("marks a full zone as FULL and reflects it in summary", async () => {
      for (let i = 1; i <= 4; i++) {
        await request(app)
          .post(`/zones/${zoneId}/events`)
          .send({
            cameraIdentifier: entryIdentifier,
            sourceEventId: `fill-${i}`,
            eventType: "ENTRY",
            detectedPlate: i === 1 ? plateNumber : `SIM-PAD-${i}`,
          })
          .expect(201);
      }
      const res = await request(app)
        .get("/admin/dashboard")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const d = res.body.data;
      expect(d.summary.totalOccupied).toBe(4);
      expect(d.summary.totalAvailable).toBe(0);
      expect(d.zones[0].availability).toBe("FULL");
      expect(d.fullZones).toHaveLength(1);
      expect(d.recentEvents.length).toBeGreaterThan(0);
    });
  });

  describe("GET /admin/cameras", () => {
    it("returns cameras with zone, gate type and status", async () => {
      const res = await request(app)
        .get("/admin/cameras")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const cameras = res.body.data;
      expect(cameras).toHaveLength(2);
      for (const c of cameras) {
        expect(c.zone.code).toBe("AT");
        expect(["ENTRY", "EXIT"]).toContain(c.gateType);
        expect(c.status).toBe("ONLINE");
        expect(c.identifier).toBeTruthy();
        expect(c).not.toHaveProperty("apiKey");
      }
    });
  });

  describe("Notifications", () => {
    it("lists ADMIN notifications and reports unread count", async () => {
      await prisma.notification.createMany({
        data: [
          { zoneId, type: "ZONE_FULL", message: "Zone is full.", targetRole: "ADMIN" },
          { zoneId, type: "ZONE_LOW_AVAILABILITY", message: "Availability low.", targetRole: "ADMIN", read: true },
        ],
      });
      const res = await request(app)
        .get("/admin/notifications")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.notifications).toHaveLength(2);
      expect(res.body.data.unreadCount).toBe(1);
      expect(res.body.data.notifications[0].type).toBe("ZONE_FULL");
    });

    it("marks a notification read via PATCH", async () => {
      const notif = await prisma.notification.create({
        data: { zoneId, type: "ZONE_FULL", message: "Zone is full.", targetRole: "ADMIN" },
      });
      const res = await request(app)
        .patch(`/admin/notifications/${notif.id}/read`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.read).toBe(true);
      const inDb = await prisma.notification.findUnique({ where: { id: notif.id } });
      expect(inDb?.read).toBe(true);
    });

    it("returns 404 for an unknown notification", async () => {
      await request(app)
        .patch("/admin/notifications/nope/read")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);
    });

    it("rejects an invalid limit", async () => {
      await request(app)
        .get("/admin/notifications?limit=0")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);
      await request(app)
        .get("/admin/notifications?limit=99999")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe("GET /admin/anomalies", () => {
    it("lists anomalies from real occupancy behavior", async () => {
      await request(app)
        .post(`/zones/${zoneId}/events`)
        .send({
          cameraIdentifier: entryIdentifier,
          sourceEventId: "anom-1",
          eventType: "ENTRY",
          detectedPlate: "UNK-9999",
        })
        .expect(201);
      const res = await request(app)
        .get("/admin/anomalies")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      const a = res.body.data[0];
      expect(a.anomalyType).toBe("UNREGISTERED_PLATE");
      expect(a.detectedPlate).toBe("UNK-9999");
      expect(a.resolved).toBe(false);
      expect(a.zoneCode).toBe("AT");
    });

    it("filters by resolved status", async () => {
      await request(app)
        .post(`/zones/${zoneId}/events`)
        .send({
          cameraIdentifier: entryIdentifier,
          sourceEventId: "anom-2",
          eventType: "ENTRY",
          detectedPlate: "UNK-8888",
        })
        .expect(201);
      await prisma.occupancyAnomaly.updateMany({ data: { resolved: true } });
      const res = await request(app)
        .get("/admin/anomalies?resolved=true")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].resolved).toBe(true);
    });

    it("rejects an invalid resolved filter", async () => {
      await request(app)
        .get("/admin/anomalies?resolved=banana")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe("GET /admin/zones", () => {
    it("returns zones with cameras and availability status", async () => {
      const res = await request(app)
        .get("/admin/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const z = res.body.data[0];
      expect(z.code).toBe("AT");
      expect(z.capacity).toBe(4);
      expect(z.availability).toBe("AVAILABLE");
      expect(z.entryCamera.identifier).toBe(entryIdentifier);
      expect(z.exitCamera.identifier).toBe(exitIdentifier);
      expect(Array.isArray(z.cameras)).toBe(true);
    });
  });
});
