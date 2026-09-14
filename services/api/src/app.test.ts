import request from "supertest";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "@parada/database";
import { createApp, type AppOptions } from "./app";
import { AuthService } from "./domain/auth";
import { TokenService } from "./domain/token";

const TABLES = [
  "verification_tokens",
  "user_avatars",
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

/**
 * Registration now leaves an account unverified (login answers 403
 * EMAIL_NOT_VERIFIED until the emailed code is confirmed — covered in
 * routes/account.test.ts). These suites are about other concerns, so they
 * verify through the database instead of the mail transport.
 */
async function verifyAllUsers() {
  await prisma.user.updateMany({ where: { emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
}

interface SeedCtx {
  zoneId: string;
  capacity: number;
  entryCamId: string;
  exitCamId: string;
  userId: string;
  vehicleId: string;
  plateNumber: string;
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
      plateNumber: slug === "full" ? "FULL-1234" : "ABC-1234",
      normalizedPlate: slug === "full" ? "FULL1234" : "ABC1234",
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
    plateNumber: vehicle.plateNumber,
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

    it("preserves existing response fields and adds normalized status/availability", async () => {
      const res = await request(app).get("/zones").expect(200);
      const zone = res.body.data.find((z: { code: string }) => z.code === ctx.zoneCode);
      expect(zone).toMatchObject({
        id: ctx.zoneId,
        name: ctx.zoneName,
        code: ctx.zoneCode,
        capacity: ctx.capacity,
        occupiedCount: 0,
        availableCount: ctx.capacity,
        status: "ACTIVE",
        availability: "AVAILABLE",
      });
    });

    it("reports LOW_AVAILABILITY when most spaces are occupied", async () => {
      await prisma.parkingZone.update({
        where: { id: ctx.zoneId },
        data: { occupiedCount: ctx.capacity - 1 },
      });
      const res = await request(app).get("/zones").expect(200);
      const zone = res.body.data.find((z: { code: string }) => z.code === ctx.zoneCode);
      expect(zone.availability).toBe("LOW_AVAILABILITY");
    });

    it("reports FULL when at capacity", async () => {
      await prisma.parkingZone.update({
        where: { id: ctx.zoneId },
        data: { occupiedCount: ctx.capacity },
      });
      const res = await request(app).get("/zones").expect(200);
      const zone = res.body.data.find((z: { code: string }) => z.code === ctx.zoneCode);
      expect(zone.availability).toBe("FULL");
    });

    it("reports OFFLINE for inactive zones (filtered out of the public list)", async () => {
      await prisma.parkingZone.update({
        where: { id: ctx.zoneId },
        data: { status: "INACTIVE" },
      });
      const res = await request(app).get("/zones").expect(200);
      expect(res.body.data.some((z: { code: string }) => z.code === ctx.zoneCode)).toBe(false);
    });
  });

  describe("GET /zones/establishment — Phase 9.5 navigation destination", () => {
    let adminToken: string;

    beforeEach(async () => {
      await prisma.user.create({
        data: {
          name: "Admin User",
          email: "est-admin@test.local",
          passwordHash: await argon2.hash("AdminPass123!", { type: argon2.argon2id }),
          emailVerifiedAt: new Date(),
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      const adminLogin = await request(app)
        .post("/auth/login")
        .send({ email: "est-admin@test.local", password: "AdminPass123!" })
        .expect(200);
      adminToken = adminLogin.body.data.token;
    });

    it("returns a null location when none is configured (no fabricated coordinates)", async () => {
      const res = await request(app)
        .get("/zones/establishment")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.location).toBeNull();
    });

    it("requires authentication — the facility address is not public", async () => {
      await request(app).get("/zones/establishment").expect(401);
    });

    it("returns the admin-configured establishment location to signed-in drivers", async () => {
      await request(app)
        .put("/admin/config")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          parkingFee: { baseFee: 20, baseDurationHours: 2, additionalFeePerHour: 10 },
          guestPolicy: { policy: "PRIMARY_ZONE", primaryZoneId: null, maxDurationHours: 8, allowWhenFull: false },
          zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
          violations: [],
          location: { address: "123 Test Ave, Demo", latitude: 14.5, longitude: 121.25 },
        })
        .expect(200);

      const res = await request(app)
        .get("/zones/establishment")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.location).toEqual({
        address: "123 Test Ave, Demo",
        latitude: 14.5,
        longitude: 121.25,
      });
    });

    it("rejects establishment locations with out-of-range coordinates", async () => {
      await request(app)
        .put("/admin/config")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          parkingFee: { baseFee: 20, baseDurationHours: 2, additionalFeePerHour: 10 },
          guestPolicy: { policy: "PRIMARY_ZONE", primaryZoneId: null, maxDurationHours: 8, allowWhenFull: false },
          zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
          violations: [],
          location: { address: "Nowhere", latitude: 121.25, longitude: 14.5 },
        })
        .expect(400);
    });
  });

  describe("GET /zones/:id/occupancy", () => {
    it("returns occupancy for a known zone", async () => {
      const res = await request(app).get(`/zones/${ctx.zoneId}/occupancy`).expect(200);
      expect(res.body.data.occupiedCount).toBe(0);
      expect(res.body.data.availableCount).toBe(ctx.capacity);
    });

    it("adds normalized availability and keeps the zone status field", async () => {
      const res = await request(app).get(`/zones/${ctx.zoneId}/occupancy`).expect(200);
      expect(res.body.data).toMatchObject({
        zoneId: ctx.zoneId,
        name: ctx.zoneName,
        code: ctx.zoneCode,
        capacity: ctx.capacity,
        occupiedCount: 0,
        availableCount: ctx.capacity,
        status: "ACTIVE",
        availability: "AVAILABLE",
      });
    });

    it("reports FULL for a fully occupied zone", async () => {
      await prisma.parkingZone.update({
        where: { id: ctx.zoneId },
        data: { occupiedCount: ctx.capacity },
      });
      const res = await request(app).get(`/zones/${ctx.zoneId}/occupancy`).expect(200);
      expect(res.body.data.availability).toBe("FULL");
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

    it("denies an unknown guest plate under the guest policy without a session", async () => {
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
      expect(res.body.data.admitted).toBe(false);
      expect(res.body.data.deniedReason).toBe("GUEST_POLICY_MISCONFIGURED");
      expect(res.body.data.newOccupied).toBe(0);

      const sessionCount = await prisma.parkingSession.count();
      expect(sessionCount).toBe(0);

      const occ = await request(app).get(`/zones/${ctx.zoneId}/occupancy`).expect(200);
      expect(occ.body.data.occupiedCount).toBe(0);
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

    it("denies a guest when the zone is full and rejects a registered ENTRY at capacity", async () => {
      const full = await seedZone({ capacity: 1, slug: "full" });
      const fullApp = createApp();
      await request(fullApp)
        .post(`/zones/${full.zoneId}/events`)
        .send({ cameraIdentifier: full.entryCamId, sourceEventId: "f1", eventType: "ENTRY", detectedPlate: full.plateNumber })
        .expect(201);

      // Unknown plate -> a guest candidate; at a full zone with a null primary
      // guest zone it is DENIED (a decision, not a 409 conflict).
      const res = await request(fullApp)
        .post(`/zones/${full.zoneId}/events`)
        .send({ cameraIdentifier: full.entryCamId, sourceEventId: "f2", eventType: "ENTRY", detectedPlate: "XYZ-9999" })
        .expect(201);
      expect(res.body.data.admitted).toBe(false);
      expect(res.body.data.deniedReason).toBe("GUEST_POLICY_MISCONFIGURED");
      expect(res.body.data.newOccupied).toBe(1);

      const occ = await request(fullApp).get(`/zones/${full.zoneId}/occupancy`).expect(200);
      expect(occ.body.data.occupiedCount).toBe(1);
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

describe("Authentication & Authorization", () => {
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;

  beforeAll(async () => {
    await cleanDatabase();
    authService = new AuthService({
      secret: "test-secret-key-for-testing-only-32chars",
      issuer: "parada-api-test",
      expiresIn: "1d",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
    app = createApp({ auth: authService });
  });

  describe("POST /auth/register", () => {
    it("successful registration", async () => {
      const res = await request(app)
        .post("/auth/register")
        .send({ name: "Test User", email: "test@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      expect(res.body.data.user).toEqual(
        expect.objectContaining({
          name: "Test User",
          email: "test@test.local",
          role: "USER",
          status: "ACTIVE",
        })
      );
      expect(res.body.data.user.id).toBeDefined();
      // No bearer token until the emailed 6-digit code is confirmed.
      expect(res.body.data.token).toBeUndefined();
      expect(res.body.data.user.emailVerifiedAt).toBeNull();
      expect(typeof res.body.data.verification.expiresAt).toBe("string");
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it("duplicate email rejection", async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Test User", email: "dup@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      await request(app)
        .post("/auth/register")
        .send({ name: "Test User 2", email: "dup@test.local", password: "Password123!" })
        .expect(409);
    });

    it("rejects weak password", async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Test User", email: "weak@test.local", password: "short" })
        .expect(422);
    });

    it("rejects missing fields", async () => {
      await request(app).post("/auth/register").send({}).expect(400);
      await request(app)
        .post("/auth/register")
        .send({ email: "x@y.com" })
        .expect(400);
    });
  });

  describe("POST /auth/login", () => {
    it("successful login", async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Login User", email: "login@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      const res = await request(app)
        .post("/auth/login")
        .send({ email: "login@test.local", password: "Password123!" })
        .expect(200);

      expect(res.body.data.user.email).toBe("login@test.local");
      expect(res.body.data.token).toBeDefined();
    });

    it("incorrect password", async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Login User", email: "login2@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      await request(app)
        .post("/auth/login")
        .send({ email: "login2@test.local", password: "WrongPass123!" })
        .expect(401);
    });

    it("nonexistent user", async () => {
      await request(app)
        .post("/auth/login")
        .send({ email: "nonexistent@test.local", password: "Password123!" })
        .expect(401);
    });
  });

  describe("GET /auth/me", () => {
    it("authenticated /auth/me", async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Me User", email: "me@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      const login = await request(app)
        .post("/auth/login")
        .send({ email: "me@test.local", password: "Password123!" })
        .expect(200);

      const token = login.body.data.token;
      const res = await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.email).toBe("me@test.local");
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it("unauthenticated protected endpoint", async () => {
      await request(app).get("/auth/me").expect(401);
      await request(app)
        .get("/auth/me")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);
    });

    it("password hash never appears in API response", async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Hash User", email: "hash@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      const login = await request(app)
        .post("/auth/login")
        .send({ email: "hash@test.local", password: "Password123!" })
        .expect(200);

      expect(login.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(login.body.data.user)).not.toContain("passwordHash");
    });
  });

  describe("POST /auth/logout", () => {
    it("invalidates token server-side", async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Logout User", email: "logout@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      const login = await request(app)
        .post("/auth/login")
        .send({ email: "logout@test.local", password: "Password123!" })
        .expect(200);

      const token = login.body.data.token;

      await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    });
  });

  describe("Vehicle ownership", () => {
    let userToken: string;
    let otherUserToken: string;
    let _userId: string;
    let otherUserId: string;

    beforeEach(async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "User One", email: "user1@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();
      await request(app)
        .post("/auth/register")
        .send({ name: "User Two", email: "user2@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      const login1 = await request(app)
        .post("/auth/login")
        .send({ email: "user1@test.local", password: "Password123!" })
        .expect(200);
      const login2 = await request(app)
        .post("/auth/login")
        .send({ email: "user2@test.local", password: "Password123!" })
        .expect(200);

      userToken = login1.body.data.token;
      otherUserToken = login2.body.data.token;
      _userId = login1.body.data.user.id;
      otherUserId = login2.body.data.user.id;
    });

    it("user can access own vehicle", async () => {
      const create = await request(app)
        .post("/vehicles")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ plateNumber: "OWN-1234", vehicleType: "CAR" })
        .expect(201);

      const vehicleId = create.body.data.id;

      const res = await request(app)
        .get("/vehicles")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(vehicleId);
      expect(res.body.data[0].plateNumber).toBe("OWN-1234");
    });

    it("user cannot access another user's vehicle", async () => {
      const create = await request(app)
        .post("/vehicles")
        .set("Authorization", `Bearer ${otherUserToken}`)
        .send({ plateNumber: "OTHER-5678", vehicleType: "CAR" })
        .expect(201);

      const vehicleId = create.body.data.id;

      await request(app)
        .get(`/vehicles/${vehicleId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .expect(404);

      const res = await request(app)
        .get("/vehicles")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it("client cannot assign vehicle to another user", async () => {
      await request(app)
        .post("/vehicles")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ plateNumber: "HACK-0001", vehicleType: "CAR", userId: otherUserId })
        .expect(201);

      const res = await request(app)
        .get("/vehicles")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].plateNumber).toBe("HACK-0001");
    });
  });

  describe("Parking session ownership", () => {
    let userToken: string;
    let _otherUserToken: string;

    beforeEach(async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Session User", email: "session1@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();
      await request(app)
        .post("/auth/register")
        .send({ name: "Other User", email: "session2@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      const login1 = await request(app)
        .post("/auth/login")
        .send({ email: "session1@test.local", password: "Password123!" })
        .expect(200);
      const login2 = await request(app)
        .post("/auth/login")
        .send({ email: "session2@test.local", password: "Password123!" })
        .expect(200);

      userToken = login1.body.data.token;
      _otherUserToken = login2.body.data.token;
    });

    it("user can access own parking session", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Session Zone", code: "SZ", capacity: 5 },
      });
      const cam = await prisma.camera.create({
        data: { zoneId: zone.id, name: "SZ Entry", identifier: "cam-sz-entry", gateType: "ENTRY", status: "ONLINE" },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          userId: (await request(app).get("/auth/me").set("Authorization", `Bearer ${userToken}`)).body.data.id,
          plateNumber: "SESS-001",
          normalizedPlate: "SESS001",
          vehicleType: "CAR",
          status: "ACTIVE",
        },
      });

      await request(app)
        .post(`/zones/${zone.id}/events`)
        .send({
          cameraIdentifier: cam.identifier,
          sourceEventId: "sess-entry-1",
          eventType: "ENTRY",
          detectedPlate: "SESS-001",
        })
        .expect(201);

      const res = await request(app)
        .get("/sessions")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].vehicle.id).toBe(vehicle.id);
      expect(res.body.data[0].status).toBe("ACTIVE");
    });

    it("user cannot access another user's session", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Session Zone 2", code: "SZ2", capacity: 5 },
      });
      const cam = await prisma.camera.create({
        data: { zoneId: zone.id, name: "SZ2 Entry", identifier: "cam-sz2-entry", gateType: "ENTRY", status: "ONLINE" },
      });
      const otherUserLogin = await request(app)
        .post("/auth/login")
        .send({ email: "session2@test.local", password: "Password123!" })
        .expect(200);
      const otherUserId = otherUserLogin.body.data.user.id;
      await prisma.vehicle.create({
        data: {
          userId: otherUserId,
          plateNumber: "SESS-002",
          normalizedPlate: "SESS002",
          vehicleType: "CAR",
          status: "ACTIVE",
        },
      });

      await request(app)
        .post(`/zones/${zone.id}/events`)
        .send({
          cameraIdentifier: cam.identifier,
          sourceEventId: "sess-entry-2",
          eventType: "ENTRY",
          detectedPlate: "SESS-002",
        })
        .expect(201);

      const res = await request(app)
        .get("/sessions")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it("returns the active session with its zone and vehicle relations", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Active Session Zone", code: "ASZ", capacity: 5 },
      });
      const cam = await prisma.camera.create({
        data: { zoneId: zone.id, name: "ASZ Entry", identifier: "cam-asz-entry", gateType: "ENTRY", status: "ONLINE" },
      });
      const userId = (await request(app).get("/auth/me").set("Authorization", `Bearer ${userToken}`)).body.data.id;
      const vehicle = await prisma.vehicle.create({
        data: { userId, plateNumber: "ACTIVE-001", normalizedPlate: "ACTIVE001", vehicleType: "CAR", status: "ACTIVE" },
      });

      await request(app)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: cam.identifier, sourceEventId: "active-session-entry", eventType: "ENTRY", detectedPlate: vehicle.plateNumber })
        .expect(201);

      const res = await request(app)
        .get("/sessions/active")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        status: "ACTIVE",
        zone: { id: zone.id, name: zone.name, code: zone.code },
        vehicle: { id: vehicle.id, plateNumber: vehicle.plateNumber, vehicleType: vehicle.vehicleType },
      });
      expect(res.body.data.enteredAt).toEqual(expect.any(String));
    });

    it("returns null when the authenticated user has no active session", async () => {
      const res = await request(app)
        .get("/sessions/active")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.data).toBeNull();
    });
  });

  describe("Admin authorization", () => {
    let userToken: string;
    let adminToken: string;
    let adminId: string;

    beforeEach(async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Regular User", email: "reguser@test.local", password: "Password123!" })
        .expect(201);
      await verifyAllUsers();

      const admin = await prisma.user.create({
        data: {
          name: "Admin User",
          email: "admin@test.local",
          passwordHash: await argon2.hash("AdminPass123!", { type: argon2.argon2id }),
          emailVerifiedAt: new Date(),
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      adminId = admin.id;

      const userLogin = await request(app)
        .post("/auth/login")
        .send({ email: "reguser@test.local", password: "Password123!" })
        .expect(200);
      const adminLogin = await request(app)
        .post("/auth/login")
        .send({ email: "admin@test.local", password: "AdminPass123!" })
        .expect(200);

      userToken = userLogin.body.data.token;
      adminToken = adminLogin.body.data.token;
    });

    it("normal user cannot access admin endpoint", async () => {
      await request(app)
        .get("/admin/sessions")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("admin can access authorized admin endpoint", async () => {
      const res = await request(app)
        .get("/admin/sessions")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("reads and updates establishment configuration for ADMIN only", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Config Zone", code: "CFG", capacity: 5 },
      });
      const initial = await request(app)
        .get("/admin/config")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(initial.body.data.parkingFee).toMatchObject({ baseFee: 20, baseDurationHours: 2, additionalFeePerHour: 10 });
      expect(initial.body.data.guestPolicy.primaryZoneId).toBeNull();

      const updated = await request(app)
        .put("/admin/config")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          parkingFee: { baseFee: 25, baseDurationHours: 2, additionalFeePerHour: 12 },
          guestPolicy: { policy: "PRIMARY_ZONE", primaryZoneId: zone.id, maxDurationHours: 8, allowWhenFull: false },
          zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
          violations: [{ type: "OVERSTAY", fineAmount: 100, description: "Overstay" }],
        })
        .expect(200);
      expect(updated.body.data.parkingFee.baseFee).toBe(25);
      expect(updated.body.data.guestPolicy.primaryZoneId).toBe(zone.id);

      await request(app)
        .get("/admin/config")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("rejects invalid establishment configuration", async () => {
      await request(app)
        .put("/admin/config")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          parkingFee: { baseFee: -1, baseDurationHours: 0, additionalFeePerHour: 10 },
          guestPolicy: { policy: "PRIMARY_ZONE", primaryZoneId: null, maxDurationHours: 8, allowWhenFull: false },
          zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
          violations: [],
        })
        .expect(400);
    });

    it("protects admin reservations, reviews, and analytics", async () => {
      const zone = await prisma.parkingZone.create({ data: { name: "Ops Zone", code: "OPS", capacity: 4 } });
      const vehicle = await prisma.vehicle.create({
        data: { userId: adminId, plateNumber: "OPS-001", normalizedPlate: "OPS001", vehicleType: "CAR", status: "ACTIVE" },
      });
      const reservation = await prisma.reservation.create({
        data: {
          userId: adminId,
          vehicleId: vehicle.id,
          zoneId: zone.id,
          startAt: new Date(Date.now() - 60_000),
          endAt: new Date(Date.now() + 15 * 60_000),
          status: "CONFIRMED",
        },
      });
      const violation = await prisma.violation.create({
        data: { userId: adminId, vehicleId: vehicle.id, zoneId: zone.id, violationType: "OVERSTAY", fineAmount: 100, description: "Overstay" },
      });
      const appeal = await prisma.violationAppeal.create({ data: { violationId: violation.id, userId: adminId, reason: "Review requested" } });

      await request(app).get("/admin/reservations").set("Authorization", `Bearer ${userToken}`).expect(403);
      const reservations = await request(app).get("/admin/reservations").set("Authorization", `Bearer ${adminToken}`).expect(200);
      expect(reservations.body.data.some((item: { id: string }) => item.id === reservation.id)).toBe(true);
      await request(app).patch(`/admin/reservations/${reservation.id}/cancel`).set("Authorization", `Bearer ${adminToken}`).expect(200);

      const violations = await request(app).get("/admin/violations").set("Authorization", `Bearer ${adminToken}`).expect(200);
      expect(violations.body.data[0].id).toBe(violation.id);
      const violationUpdate = await request(app).patch(`/admin/violations/${violation.id}/status`).set("Authorization", `Bearer ${adminToken}`).send({ status: "DISMISSED" }).expect(200);
      // The admin client's declared AdminViolation type requires these relations
      // (matching what GET /admin/violations already returns) — the mutation
      // response must actually carry them, not just the bare row.
      expect(violationUpdate.body.data.user).toMatchObject({ id: adminId });
      expect(violationUpdate.body.data.vehicle).toMatchObject({ id: vehicle.id });
      expect(violationUpdate.body.data.zone).toMatchObject({ id: zone.id });

      const appealUpdate = await request(app).patch(`/admin/appeals/${appeal.id}/status`).set("Authorization", `Bearer ${adminToken}`).send({ status: "APPROVED" }).expect(200);
      // Same contract requirement for AdminAppeal's user/violation relations.
      expect(appealUpdate.body.data.user).toMatchObject({ id: adminId });
      expect(appealUpdate.body.data.violation).toMatchObject({ id: violation.id });

      const analytics = await request(app).get("/admin/analytics").set("Authorization", `Bearer ${adminToken}`).expect(200);
      expect(analytics.body.data.current.capacity).toBe(4);
      expect(analytics.body.data.reservations).toBeGreaterThanOrEqual(1);
      expect(analytics.body.data.violations).toBeGreaterThanOrEqual(1);
    });

    it("allows only an admin to override guest admission through the occupancy pipeline", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Override Zone", code: "OVR", capacity: 1, occupiedCount: 0 },
      });
      const camera = await prisma.camera.create({
        data: {
          zoneId: zone.id,
          name: "Override Entry",
          identifier: "cam-override-entry",
          gateType: "ENTRY",
          status: "ONLINE",
        },
      });

      await request(app)
        .post("/admin/guest-admit")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ zoneId: zone.id, cameraIdentifier: camera.identifier, sourceEventId: "override-user", detectedPlate: "GUEST-OVR" })
        .expect(403);

      const res = await request(app)
        .post("/admin/guest-admit")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          zoneId: zone.id,
          cameraIdentifier: camera.identifier,
          sourceEventId: "override-admin",
          detectedPlate: "GUEST-OVR",
          userId: "spoofed-user-id",
        })
        .expect(201);

      expect(res.body.data.admitted).toBe(true);
      const anomaly = await prisma.occupancyAnomaly.findFirstOrThrow({
        where: { anomalyType: "GUEST_ADMIN_OVERRIDE" },
      });
      expect(anomaly.description).toContain(adminId);
      expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } })).occupiedCount).toBe(1);
    });
  });
});

describe("Phase 3 — Zone recommendation", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
    app = createApp();
  });

  it("recommends the least-occupied suitable zone", async () => {
    const full = await prisma.parkingZone.create({
      data: { name: "Full Zone", code: "FULL", capacity: 2, occupiedCount: 2 },
    });
    const busy = await prisma.parkingZone.create({
      data: { name: "Busy Zone", code: "BUSY", capacity: 10, occupiedCount: 5 },
    });
    const empty = await prisma.parkingZone.create({
      data: { name: "Empty Zone", code: "EMPTY", capacity: 10, occupiedCount: 0 },
    });
    expect(full.id).toBeDefined();
    expect(busy.id).toBeDefined();

    const res = await request(app).get("/zones/recommendation").expect(200);
    expect(res.body.data.recommendedZone.id).toBe(empty.id);
  });

  it("breaks occupancy ties deterministically by zone code", async () => {
    const zA = await prisma.parkingZone.create({
      data: { name: "Zone A", code: "TYA", capacity: 10, occupiedCount: 2 },
    });
    const zB = await prisma.parkingZone.create({
      data: { name: "Zone B", code: "TYB", capacity: 10, occupiedCount: 2 },
    });
    const res = await request(app).get("/zones/recommendation").expect(200);
    expect(zA.code < zB.code).toBe(true);
    expect(res.body.data.recommendedZone.id).toBe(zA.id);
  });

  it("ignores full, inactive, and zero-capacity zones", async () => {
    await prisma.parkingZone.create({
      data: { name: "Full", code: "ZF", capacity: 1, occupiedCount: 1 },
    });
    await prisma.parkingZone.create({
      data: { name: "Inactive", code: "ZI", capacity: 5, occupiedCount: 0, status: "INACTIVE" },
    });
    await prisma.parkingZone.create({
      data: { name: "Zero Cap", code: "ZZ", capacity: 0, occupiedCount: 0 },
    });
    const ok = await prisma.parkingZone.create({
      data: { name: "OK", code: "ZOK", capacity: 4, occupiedCount: 1 },
    });
    const res = await request(app).get("/zones/recommendation").expect(200);
    expect(res.body.data.recommendedZone.id).toBe(ok.id);
  });

  it("returns a null zone when none is suitable, matching the DTO", async () => {
    await prisma.parkingZone.create({
      data: { name: "Full", code: "NF", capacity: 3, occupiedCount: 3 },
    });
    const res = await request(app).get("/zones/recommendation").expect(200);
    expect(res.body.data.recommendedZone).toBeNull();
  });
});

describe("Phase 3 — Reservations", () => {
  let app: ReturnType<typeof createApp>;
  let tokenA: string;
  let tokenB: string;
  let userAId: string;

  async function registerUser(email: string, name: string): Promise<{ token: string; id: string }> {
    await request(app)
      .post("/auth/register")
      .send({ name, email, password: "Password123!" })
      .expect(201);
    await verifyAllUsers();
    const login = await request(app).post("/auth/login").send({ email, password: "Password123!" }).expect(200);
    return { token: login.body.data.token, id: login.body.data.user.id };
  }

  beforeEach(async () => {
    await cleanDatabase();
    app = createApp();
    const a = await registerUser("resa@test.local", "Res A");
    const b = await registerUser("resb@test.local", "Res B");
    tokenA = a.token;
    tokenB = b.token;
    userAId = a.id;
  });

  async function seedVehicle(userId: string, plate: string, token: string) {
    await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${token}`)
      .send({ plateNumber: plate, vehicleType: "CAR" })
      .expect(201);
    const v = await prisma.vehicle.findFirstOrThrow({ where: { plateNumber: plate, userId } });
    return v;
  }

  it("creates a reservation for an owned vehicle", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Res Zone", code: "RZ1", capacity: 5 } });
    const vehicle = await seedVehicle(userAId, "RES-001", tokenA);

    const res = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(201);

    expect(res.body.data).toMatchObject({
      userId: userAId,
      zoneId: zone.id,
      vehicleId: vehicle.id,
      status: "CONFIRMED",
    });
  });

  it("rejects a reservation for another user's vehicle", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Res Zone", code: "RZ2", capacity: 5 } });
    const vehicleA = await seedVehicle(userAId, "RES-002", tokenA);

    const res = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ zoneId: zone.id, vehicleId: vehicleA.id })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("prevents reserving a zone at full capacity", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Full Res", code: "RZ3", capacity: 2, occupiedCount: 2 } });
    const vehicle = await seedVehicle(userAId, "RES-003", tokenA);

    const res = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("protects capacity by counting active reservations", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Cap", code: "RZ4", capacity: 2 } });
    const vehicleA = await seedVehicle(userAId, "CAP-001", tokenA);

    const first = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicleA.id })
      .expect(201);
    expect(first.body.data.status).toBe("CONFIRMED");

    const b = await registerUser("rescap@test.local", "Res Cap");
    const vehicleB = await seedVehicle(b.id, "CAP-002", b.token);

    // One active reservation + 0 occupied = 1 < capacity 2 -> second allowed.
    await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${b.token}`)
      .send({ zoneId: zone.id, vehicleId: vehicleB.id })
      .expect(201);

    // Two active reservations + 0 occupied = 2 (not < 2) -> third blocked.
    const third = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: (await seedVehicle(userAId, "CAP-003", tokenA)).id })
      .expect(409);
    expect(third.body.error.code).toBe("CONFLICT");
  });

  it("re-reads zone occupancy inside the transaction so a concurrent entry cannot be missed", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Race Zone", code: "RZ9", capacity: 1, occupiedCount: 0 } });
    const vehicle = await seedVehicle(userAId, "RES-011", tokenA);

    // Simulate a concurrent occupancy change (e.g. a camera/manual entry)
    // landing between ReservationService's pre-transaction zone read and the
    // transaction that decides whether capacity is still available.
    const originalTransaction = prisma.$transaction.bind(prisma);
    const spy = jest
      .spyOn(prisma, "$transaction")
      .mockImplementationOnce(async (...args: unknown[]) => {
        await prisma.parkingZone.update({ where: { id: zone.id }, data: { occupiedCount: { increment: 1 } } });
        return (originalTransaction as (...a: unknown[]) => unknown)(...args);
      });

    try {
      const res = await request(app)
        .post("/reservations")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ zoneId: zone.id, vehicleId: vehicle.id })
        .expect(409);
      expect(res.body.error.code).toBe("CONFLICT");
    } finally {
      spy.mockRestore();
    }
  });

  it("serializes concurrent reservations so only the remaining capacity is granted", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Conc", code: "RZC", capacity: 10, occupiedCount: 8 } });
    const a = await registerUser("resca@test.local", "RC A");
    const b = await registerUser("rescb@test.local", "RC B");
    const c = await registerUser("rescc@test.local", "RC C");
    const va = await seedVehicle(a.id, "CONC-A", a.token);
    const vb = await seedVehicle(b.id, "CONC-B", b.token);
    const vc = await seedVehicle(c.id, "CONC-C", c.token);

    // Genuinely overlapping requests: the DB-level advisory lock must let
    // exactly capacity - occupiedCount = 2 of 3 succeed.
    const attempts = await Promise.all([
      request(app).post("/reservations").set("Authorization", `Bearer ${a.token}`).send({ zoneId: zone.id, vehicleId: va.id }),
      request(app).post("/reservations").set("Authorization", `Bearer ${b.token}`).send({ zoneId: zone.id, vehicleId: vb.id }),
      request(app).post("/reservations").set("Authorization", `Bearer ${c.token}`).send({ zoneId: zone.id, vehicleId: vc.id }),
    ]);

    expect(attempts.filter((r) => r.status === 201)).toHaveLength(2);
    expect(attempts.filter((r) => r.status === 409)).toHaveLength(1);

    // No partial records, no corruption, occupancy untouched.
    const rows = await prisma.reservation.findMany({ where: { zoneId: zone.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "CONFIRMED")).toBe(true);
    const zoneNow = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } });
    expect(zoneNow.occupiedCount).toBe(8);
    expect(zoneNow.capacity).toBe(10);
  });

  it("allows only one of two concurrent reservations into a single remaining slot", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Single", code: "RZS", capacity: 1 } });
    const a = await registerUser("ressa@test.local", "RS A");
    const b = await registerUser("ressb@test.local", "RS B");
    const va = await seedVehicle(a.id, "SINGLE-A", a.token);
    const vb = await seedVehicle(b.id, "SINGLE-B", b.token);

    const attempts = await Promise.all([
      request(app).post("/reservations").set("Authorization", `Bearer ${a.token}`).send({ zoneId: zone.id, vehicleId: va.id }),
      request(app).post("/reservations").set("Authorization", `Bearer ${b.token}`).send({ zoneId: zone.id, vehicleId: vb.id }),
    ]);

    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await prisma.reservation.count({ where: { zoneId: zone.id } })).toBe(1);
  });

  it("rejects an overlapping duplicate reservation for the same vehicle and zone", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Dup", code: "RZD", capacity: 5 } });
    const vehicle = await seedVehicle(userAId, "DUP-001", tokenA);

    await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(201);

    const second = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(409);
    expect(second.body.error.code).toBe("CONFLICT");
    expect(await prisma.reservation.count({ where: { zoneId: zone.id } })).toBe(1);
  });

  it("allows non-overlapping reservations for the same vehicle in the same zone", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "NonOverlap", code: "RZN", capacity: 3 } });
    const vehicle = await seedVehicle(userAId, "NON-001", tokenA);
    const start = new Date(Date.now() + 10 * 60_000);

    await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        zoneId: zone.id,
        vehicleId: vehicle.id,
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 15 * 60_000).toISOString(),
      })
      .expect(201);

    const laterStart = new Date(start.getTime() + 20 * 60_000);
    await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        zoneId: zone.id,
        vehicleId: vehicle.id,
        startAt: laterStart.toISOString(),
        endAt: new Date(laterStart.getTime() + 15 * 60_000).toISOString(),
      })
      .expect(201);
  });

  it("releases capacity and the overlap guard once a reservation expires", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "ExpReuse", code: "RZE", capacity: 1 } });
    const vehicle = await seedVehicle(userAId, "ERZ-001", tokenA);

    const created = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(201);

    // Simulate the arrival window elapsing: expiration is lazy, so the next
    // write-path flips this to EXPIRED and frees its slot and overlap.
    await prisma.reservation.update({
      where: { id: created.body.data.id },
      data: { startAt: new Date(Date.now() - 60 * 60_000) },
    });

    const again = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(201);
    expect(again.body.data.status).toBe("CONFIRMED");

    const first = await prisma.reservation.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(first.status).toBe("EXPIRED");
  });

  it("fails cleanly with no partial state when the capacity transaction rolls back", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Roll", code: "RZR", capacity: 2, occupiedCount: 2 } });
    const vehicle = await seedVehicle(userAId, "ROLL-001", tokenA);

    const res = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(await prisma.reservation.count({ where: { zoneId: zone.id } })).toBe(0);
    const zoneNow = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } });
    expect(zoneNow.occupiedCount).toBe(2);
    // The failed transaction wrote no notifications or events.
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.occupancyEvent.count()).toBe(0);
  });

  it("rejects reservations for inactive zones", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Inactive", code: "RZI", capacity: 5, status: "INACTIVE" } });
    const vehicle = await seedVehicle(userAId, "RZIN-001", tokenA);

    const res = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("expires reservations outside the 15-minute arrival window", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Exp", code: "RZ5", capacity: 5 } });
    const vehicle = await seedVehicle(userAId, "RES-007", tokenA);

    // Create a reservation whose arrival window has already passed.
    const past = await prisma.reservation.create({
      data: {
        userId: userAId,
        vehicleId: vehicle.id,
        zoneId: zone.id,
        startAt: new Date(Date.now() - 60 * 60 * 1000),
        endAt: new Date(Date.now() + 60 * 60 * 1000),
        status: "CONFIRMED",
      },
    });

    const res = await request(app)
      .get("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    const expired = res.body.data.find((r: { id: string }) => r.id === past.id);
    expect(expired.status).toBe("EXPIRED");
  });

  it("cancels an owned reservation", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Can", code: "RZ6", capacity: 5 } });
    const vehicle = await seedVehicle(userAId, "RES-008", tokenA);

    const created = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(201);

    const res = await request(app)
      .patch(`/reservations/${created.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.data.status).toBe("CANCELLED");
  });

  it("does not allow one user to cancel another's reservation", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "CanB", code: "RZ7", capacity: 5 } });
    const vehicle = await seedVehicle(userAId, "RES-009", tokenA);

    const created = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(201);

    const res = await request(app)
      .patch(`/reservations/${created.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("does not leak another user's reservation in list/get", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Leak", code: "RZ8", capacity: 5 } });
    const vehicle = await seedVehicle(userAId, "RES-010", tokenA);

    await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id })
      .expect(201);

    const listB = await request(app).get("/reservations").set("Authorization", `Bearer ${tokenB}`).expect(200);
    expect(listB.body.data).toHaveLength(0);
  });
});

describe("Phase 3 — Assignments", () => {
  let app: ReturnType<typeof createApp>;
  let tokenA: string;
  let tokenB: string;
  let userAId: string;

  beforeEach(async () => {
    await cleanDatabase();
    app = createApp();

    const regA = () =>
      request(app).post("/auth/register").send({ name: "Assign A", email: "assa@test.local", password: "Password123!" });
    const regB = () =>
      request(app).post("/auth/register").send({ name: "Assign B", email: "assb@test.local", password: "Password123!" });

    // register returns 201 for both (idempotent within a fresh DB).
    await Promise.all([regA(), regB()]);
    await verifyAllUsers();

    const loginA = await request(app).post("/auth/login").send({ email: "assa@test.local", password: "Password123!" }).expect(200);
    const loginB = await request(app).post("/auth/login").send({ email: "assb@test.local", password: "Password123!" }).expect(200);
    tokenA = loginA.body.data.token;
    tokenB = loginB.body.data.token;
    userAId = loginA.body.data.user.id;
  });

  it("creates an assignment after explicit zone selection", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Assign Zone", code: "AS1", capacity: 5 } });
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ASS-001", vehicleType: "CAR" })
      .expect(201);

    const res = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.body.data.id })
      .expect(201);
    expect(res.body.data).toMatchObject({
      userId: userAId,
      zoneId: zone.id,
      vehicleId: vehicle.body.data.id,
      status: "ACTIVE",
    });
  });

  it("rejects assigning another user's vehicle", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Assign Zone B", code: "AS2", capacity: 5 } });
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ASS-002", vehicleType: "CAR" })
      .expect(201);

    const res = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.body.data.id })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("a recommendation never auto-creates an assignment", async () => {
    await prisma.parkingZone.create({ data: { name: "Rec Zone", code: "AR1", capacity: 5 } });

    await request(app).get("/zones/recommendation").expect(200);

    const count = await prisma.zoneAssignment.count();
    expect(count).toBe(0);
  });

  it("a user cannot read another user's assignment", async () => {
    const zone = await prisma.parkingZone.create({ data: { name: "Assign Zone C", code: "AS3", capacity: 5 } });
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ASS-003", vehicleType: "CAR" })
      .expect(201);

    const created = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.body.data.id })
      .expect(201);

    const res = await request(app)
      .get(`/assignments/${created.body.data.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("lets the vehicle be assigned again once the assignment expires", async () => {
    const zoneA = await prisma.parkingZone.create({ data: { name: "Z1x", code: "AX1", capacity: 5 } });
    const zoneB = await prisma.parkingZone.create({ data: { name: "Z2x", code: "AX2", capacity: 5 } });
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ASS-005", vehicleType: "CAR" })
      .expect(201);

    const first = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zoneA.id, vehicleId: vehicle.body.data.id })
      .expect(201);

    // Age the assignment past its arrival window. Without lazy expiry the row
    // stays ACTIVE forever and the vehicle can never be assigned again.
    await prisma.zoneAssignment.update({
      where: { id: first.body.data.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zoneB.id, vehicleId: vehicle.body.data.id })
      .expect(201);

    const expired = await prisma.zoneAssignment.findUniqueOrThrow({ where: { id: first.body.data.id } });
    expect(expired.status).toBe("EXPIRED");
  });

  it("rejects a second ACTIVE assignment for the same vehicle", async () => {
    const zoneA = await prisma.parkingZone.create({ data: { name: "Z1", code: "AZ1", capacity: 5 } });
    const zoneB = await prisma.parkingZone.create({ data: { name: "Z2", code: "AZ2", capacity: 5 } });
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ASS-004", vehicleType: "CAR" })
      .expect(201);

    await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zoneA.id, vehicleId: vehicle.body.data.id })
      .expect(201);

    const res = await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: zoneB.id, vehicleId: vehicle.body.data.id })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("Phase 3 — Session entry & exit (user-initiated)", () => {
  let app: ReturnType<typeof createApp>;
  let tokenA: string;
  let tokenB: string;
  let userAId: string;
  let ctx: SeedCtx;

  beforeEach(async () => {
    await cleanDatabase();
    ctx = await seedZone();
    app = createApp();

    const registerA = () =>
      request(app).post("/auth/register").send({ name: "Sess A", email: "sessa@test.local", password: "Password123!" });
    const registerB = () =>
      request(app).post("/auth/register").send({ name: "Sess B", email: "sessb@test.local", password: "Password123!" });
    await registerA();
    await registerB();
    await verifyAllUsers();

    const loginA = await request(app).post("/auth/login").send({ email: "sessa@test.local", password: "Password123!" }).expect(200);
    const loginB = await request(app).post("/auth/login").send({ email: "sessb@test.local", password: "Password123!" }).expect(200);
    tokenA = loginA.body.data.token;
    tokenB = loginB.body.data.token;
    userAId = loginA.body.data.user.id;
  });

  it("registers an entry, increments occupancy, and creates an ACTIVE session", async () => {
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-001", vehicleType: "CAR" })
      .expect(201);

    const before = await prisma.parkingZone.findUniqueOrThrow({ where: { id: ctx.zoneId } });

    const res = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: ctx.zoneId, vehicleId: vehicle.body.data.id })
      .expect(201);

    expect(res.body.data.session).toMatchObject({
      userId: userAId,
      zoneId: ctx.zoneId,
      vehicleId: vehicle.body.data.id,
      status: "ACTIVE",
    });

    const after = await prisma.parkingZone.findUniqueOrThrow({ where: { id: ctx.zoneId } });
    expect(after.occupiedCount).toBe(before.occupiedCount + 1);

    const sessionCount = await prisma.parkingSession.count({ where: { status: "ACTIVE" } });
    expect(sessionCount).toBe(1);
  });

  it("rejects entry with another user's vehicle", async () => {
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-002", vehicleType: "CAR" })
      .expect(201);

    const res = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ zoneId: ctx.zoneId, vehicleId: vehicle.body.data.id })
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect((await prisma.parkingSession.count())).toBe(0);
  });

  it("rejects entry into a full zone without changing occupancy", async () => {
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-003", vehicleType: "CAR" })
      .expect(201);

    const full = await prisma.parkingZone.create({
      data: { name: "Full Entry", code: "FE", capacity: 1, occupiedCount: 1 },
    });

    const res = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: full.id, vehicleId: vehicle.body.data.id })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: full.id } })).occupiedCount).toBe(1);
  });

  it("rejects a duplicate active session for the same vehicle", async () => {
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-004", vehicleType: "CAR" })
      .expect(201);

    await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: ctx.zoneId, vehicleId: vehicle.body.data.id })
      .expect(201);

    const before = await prisma.parkingZone.findUniqueOrThrow({ where: { id: ctx.zoneId } });

    await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: ctx.zoneId, vehicleId: vehicle.body.data.id })
      .expect(409);

    const after = await prisma.parkingZone.findUniqueOrThrow({ where: { id: ctx.zoneId } });
    expect(after.occupiedCount).toBe(before.occupiedCount);
    expect(await prisma.parkingSession.count({ where: { vehicleId: vehicle.body.data.id } })).toBe(1);
  });

  it("rolls back all changes when a later step fails", async () => {
    // Entry into a MISSING zone must not create a session or change occupancy.
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-005", vehicleType: "CAR" })
      .expect(201);

    await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: "missing-zone", vehicleId: vehicle.body.data.id })
      .expect(404);

    expect(await prisma.parkingSession.count()).toBe(0);
    expect(await prisma.occupancyEvent.count()).toBe(0);
  });

  it("rejects entry into a non-assigned zone when an assignment exists", async () => {
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-006", vehicleType: "CAR" })
      .expect(201);
    const assigned = await prisma.parkingZone.create({ data: { name: "Assigned", code: "WA1", capacity: 5 } });

    await request(app)
      .post("/assignments")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: assigned.id, vehicleId: vehicle.body.data.id })
      .expect(201);

    const res = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: ctx.zoneId, vehicleId: vehicle.body.data.id })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(await prisma.parkingSession.count()).toBe(0);
  });

  it("completes an exit, decrements occupancy, and persists the fee", async () => {
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-007", vehicleType: "CAR" })
      .expect(201);

    const enteredAt = new Date("2026-09-04T10:00:00.000Z");
    const exitedAt = new Date("2026-09-04T13:00:00.000Z"); // exactly 3h

    const entry = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: ctx.zoneId, vehicleId: vehicle.body.data.id, enteredAt: enteredAt.toISOString() })
      .expect(201);
    const sessionId = entry.body.data.session.id;

    const before = await prisma.parkingZone.findUniqueOrThrow({ where: { id: ctx.zoneId } });

    const res = await request(app)
      .post(`/sessions/${sessionId}/exit`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ exitedAt: exitedAt.toISOString() })
      .expect(200);

    const saved = await prisma.parkingSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(saved.status).toBe("COMPLETED");
    // 3h exactly -> base (2h) + 1 additional started hour = 20 + 10 = 30.
    expect(saved.feeAmount).toBe(30);
    expect(saved.durationSeconds).toBe(3 * 60 * 60);

    const feeRow = await prisma.parkingFee.findFirstOrThrow({ where: { sessionId } });
    expect(feeRow.amount).toBe(saved.feeAmount);
    expect(feeRow.status).toBe("PENDING");

    const after = await prisma.parkingZone.findUniqueOrThrow({ where: { id: ctx.zoneId } });
    expect(after.occupiedCount).toBe(before.occupiedCount - 1);

    expect(res.body.data.fee).toMatchObject({ amount: saved.feeAmount, status: "PENDING" });
  });

  it("rejects a duplicate exit for an already-completed session", async () => {
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-008", vehicleType: "CAR" })
      .expect(201);

    const entry = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: ctx.zoneId, vehicleId: vehicle.body.data.id })
      .expect(201);
    const sessionId = entry.body.data.session.id;

    await request(app)
      .post(`/sessions/${sessionId}/exit`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    const before = await prisma.parkingZone.findUniqueOrThrow({ where: { id: ctx.zoneId } });

    const res = await request(app)
      .post(`/sessions/${sessionId}/exit`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");

    const after = await prisma.parkingZone.findUniqueOrThrow({ where: { id: ctx.zoneId } });
    expect(after.occupiedCount).toBe(before.occupiedCount);
    expect(await prisma.parkingFee.count({ where: { sessionId } })).toBe(1);
  });

  it("rejects exiting a session that belongs to another user", async () => {
    const vehicle = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ plateNumber: "ENT-009", vehicleType: "CAR" })
      .expect(201);

    const entry = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ zoneId: ctx.zoneId, vehicleId: vehicle.body.data.id })
      .expect(201);
    const sessionId = entry.body.data.session.id;

    const res = await request(app)
      .post(`/sessions/${sessionId}/exit`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects exiting a session that does not exist", async () => {
    const res = await request(app)
      .post("/sessions/nonexistent/exit")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("Violations, appeals & driver notifications", () => {
  const tokens = new TokenService({
    secret: "test-secret-key-for-testing-only-32chars",
    issuer: "parada-api-test",
    expiresIn: "1d",
  });
  let app: ReturnType<typeof createApp>;
  let tokenA: string;
  let tokenAdmin: string;
  let userAId: string;
  let zone: { id: string };
  let vehicleId: string;

  beforeEach(async () => {
    await cleanDatabase();
    app = createApp();
    const a = await prisma.user.create({
      data: { name: "Driver V", email: "vio-driver@test.local", passwordHash: "x", role: "USER" },
    });
    const admin = await prisma.user.create({
      data: { name: "Admin V", email: "vio-admin@test.local", passwordHash: "x", role: "ADMIN" },
    });
    userAId = a.id;
    tokenA = tokens.sign({ id: a.id, role: "USER" }).token;
    tokenAdmin = tokens.sign({ id: admin.id, role: "ADMIN" }).token;
    zone = await prisma.parkingZone.create({ data: { name: "Vio Zone", code: "VIO", capacity: 5 } });
    const vehicle = await prisma.vehicle.create({
      data: { userId: a.id, plateNumber: "VIO-0001", normalizedPlate: "VIO0001", vehicleType: "CAR", status: "ACTIVE" },
    });
    vehicleId = vehicle.id;
  });

  async function issueViolation() {
    return prisma.violation.create({
      data: {
        userId: userAId,
        vehicleId,
        zoneId: zone.id,
        violationType: "WRONG_ZONE",
        description: "test",
        fineAmount: 100,
        status: "PENDING",
      },
    });
  }

  it("lists only the authenticated driver's own violations", async () => {
    const mine = await issueViolation();
    const other = await prisma.user.create({
      data: { name: "Other", email: "vio-other@test.local", passwordHash: "x", role: "USER" },
    });
    await prisma.violation.create({
      data: { userId: other.id, zoneId: zone.id, violationType: "OVERSTAY", fineAmount: 150, status: "PENDING" },
    });

    const res = await request(app)
      .get("/violations")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(mine.id);
  });

  it("runs an appeal end to end and notifies both sides", async () => {
    const violation = await issueViolation();

    await request(app)
      .post(`/violations/${violation.id}/appeal`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ reason: "I was directed here by staff." })
      .expect(201);

    expect((await prisma.violation.findUniqueOrThrow({ where: { id: violation.id } })).status).toBe("APPEALED");
    expect(
      await prisma.notification.count({ where: { type: "VIOLATION_APPEAL_SUBMITTED", targetRole: "ADMIN" } })
    ).toBe(1);

    const appeals = await request(app)
      .get("/admin/appeals")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .expect(200);

    await request(app)
      .patch(`/admin/appeals/${appeals.body.data[0].id}/status`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ status: "APPROVED" })
      .expect(200);

    expect((await prisma.violation.findUniqueOrThrow({ where: { id: violation.id } })).status).toBe("DISMISSED");
    const result = await prisma.notification.findFirstOrThrow({
      where: { type: "VIOLATION_APPEAL_RESULT", userId: userAId },
    });
    expect(result.targetRole).toBe("USER");
  });

  it("rejects appealing another user's violation and double appeals", async () => {
    const other = await prisma.user.create({
      data: { name: "Other2", email: "vio-other2@test.local", passwordHash: "x", role: "USER" },
    });
    const theirs = await prisma.violation.create({
      data: { userId: other.id, zoneId: zone.id, violationType: "OVERSTAY", fineAmount: 150, status: "PENDING" },
    });
    await request(app)
      .post(`/violations/${theirs.id}/appeal`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ reason: "not mine" })
      .expect(404);

    const mine = await issueViolation();
    await request(app)
      .post(`/violations/${mine.id}/appeal`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ reason: "first" })
      .expect(201);
    await request(app)
      .post(`/violations/${mine.id}/appeal`)
      .set("Authorization", `Bearer ${tokenA}`)
      // Already appealed is a conflict, not a permissions problem.
      .send({ reason: "second" })
      .expect(409);
  });

  it("serves a driver their own notifications and nobody else's", async () => {
    const other = await prisma.user.create({
      data: { name: "Other3", email: "vio-other3@test.local", passwordHash: "x", role: "USER" },
    });
    const mine = await prisma.notification.create({
      data: { zoneId: zone.id, userId: userAId, type: "WRONG_ZONE_WARNING", message: "yours", targetRole: "USER" },
    });
    await prisma.notification.create({
      data: { zoneId: zone.id, userId: other.id, type: "WRONG_ZONE_WARNING", message: "theirs", targetRole: "USER" },
    });
    await prisma.notification.create({
      data: { zoneId: zone.id, type: "ZONE_FULL", message: "ops", targetRole: "ADMIN" },
    });

    const res = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.notifications[0].message).toBe("yours");
    expect(res.body.data.unreadCount).toBe(1);

    await request(app)
      .patch(`/notifications/${mine.id}/read`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).read).toBe(true);
  });

  it("cannot mark another user's notification read", async () => {
    const other = await prisma.user.create({
      data: { name: "Other4", email: "vio-other4@test.local", passwordHash: "x", role: "USER" },
    });
    const theirs = await prisma.notification.create({
      data: { zoneId: zone.id, userId: other.id, type: "WRONG_ZONE_WARNING", message: "theirs", targetRole: "USER" },
    });
    await request(app)
      .patch(`/notifications/${theirs.id}/read`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).read).toBe(false);
  });

  it("lets an admin dismiss a PENDING violation through the state machine", async () => {
    const violation = await issueViolation();
    const res = await request(app)
      .patch(`/admin/violations/${violation.id}/status`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ status: "DISMISSED" })
      .expect(200);
    expect(res.body.data.status).toBe("DISMISSED");
    expect((await prisma.violation.findUniqueOrThrow({ where: { id: violation.id } })).status).toBe("DISMISSED");
  });

  it("rejects status transitions the violation state machine does not allow", async () => {
    const violation = await issueViolation();

    // A PENDING violation can only be dismissed directly or appealed; jumping
    // to a terminal or mid-flow state is a domain conflict.
    for (const target of ["FINE_PAID", "UPHELD", "APPEALED"]) {
      const res = await request(app)
        .patch(`/admin/violations/${violation.id}/status`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: target })
        .expect(409);
      expect(res.body.error.code).toBe("CONFLICT");
    }

    // No side effects from the rejected transitions: still PENDING, and no
    // notification was persisted.
    expect((await prisma.violation.findUniqueOrThrow({ where: { id: violation.id } })).status).toBe("PENDING");
    expect(await prisma.notification.count()).toBe(0);
  });

  it("never lets a terminal violation be reopened", async () => {
    const violation = await issueViolation();
    await request(app)
      .patch(`/admin/violations/${violation.id}/status`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ status: "DISMISSED" })
      .expect(200);

    const res = await request(app)
      .patch(`/admin/violations/${violation.id}/status`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ status: "PENDING" })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("derives the acting identity from the token, never from the body", async () => {
    const violation = await issueViolation();
    const imposter = await prisma.user.create({
      data: { name: "Imposter", email: "vio-imposter@test.local", passwordHash: "x", role: "ADMIN" },
    });

    // A forged reviewer identity in the body is ignored; the authenticated
    // admin performs the transition.
    await request(app)
      .patch(`/admin/violations/${violation.id}/status`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ status: "DISMISSED", adminId: imposter.id, reviewerId: imposter.id })
      .expect(200);
    expect((await prisma.violation.findUniqueOrThrow({ where: { id: violation.id } })).status).toBe("DISMISSED");

    // A non-admin can never mutate the violation through this endpoint.
    await request(app)
      .patch(`/admin/violations/${violation.id}/status`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ status: "PENDING" })
      .expect(403);
  });

  it("rejects invalid status values as malformed input", async () => {
    const violation = await issueViolation();
    const res = await request(app)
      .patch(`/admin/violations/${violation.id}/status`)
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ status: "RESOLVED" })
      .expect(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});

describe("Phase 4 — Authentication security coverage", () => {
  const SECRET = "test-secret-key-for-testing-only-32chars";
  const ISSUER = "parada-api-test";

  let app: ReturnType<typeof createApp>;
  const authService = new AuthService({ secret: SECRET, issuer: ISSUER, expiresIn: "1d" });
  const tokenService = new TokenService({ secret: SECRET, issuer: ISSUER, expiresIn: "1d" });

  beforeEach(async () => {
    await cleanDatabase();
    app = createApp({ auth: authService });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function registerUser(email: string, password = "Password123!", extra: Record<string, unknown> = {}) {
    return request(app)
      .post("/auth/register")
      .send({ name: "Security User", email, password, ...extra });
  }

  async function registerAndLogin(email: string, password = "Password123!") {
    const reg = await registerUser(email, password).expect(201);
    const userId = reg.body.data.user.id;
    await verifyAllUsers();
    const login = await request(app).post("/auth/login").send({ email, password }).expect(200);
    const token = login.body.data.token as string;
    return { email, userId, token, reg };
  }

  describe("Registration — password storage", () => {
    it("stores the password as a verifiable Argon2id hash, never plaintext", async () => {
      await registerUser("hashstore@test.local", "Password123!").expect(201);

      const user = await prisma.user.findUniqueOrThrow({ where: { email: "hashstore@test.local" } });
      expect(user.passwordHash).not.toBe("Password123!");
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(await argon2.verify(user.passwordHash, "Password123!")).toBe(true);
      expect(await argon2.verify(user.passwordHash, "wrong-password")).toBe(false);
    });

    it("does not leak the password hash through the registration response", async () => {
      const res = await registerUser("noressonhash@test.local").expect(201);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body.data)).not.toContain("passwordHash");
      expect(JSON.stringify(res.body.data)).not.toContain("Password123!");
    });
  });

  describe("Registration — account enumeration & normalization", () => {
    it("rejects a duplicate email that differs only by case (case-insensitive unique)", async () => {
      await registerUser("CaseDup@test.local").expect(201);
      const res = await registerUser("casedup@test.local").expect(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("normalizes email casing to lowercase when storing", async () => {
      await registerUser("MiXeD@test.local").expect(201);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: "mixed@test.local" } });
      expect(user.email).toBe("mixed@test.local");
    });
  });

  describe("Registration — role escalation protection", () => {
    it("ignores a client-supplied ADMIN role and always creates a USER", async () => {
      const res = await registerUser("wannabeadmin@test.local", "Password123!", {
        role: "ADMIN",
        status: "ACTIVE",
      }).expect(201);

      expect(res.body.data.user.role).toBe("USER");

      const user = await prisma.user.findUniqueOrThrow({ where: { email: "wannabeadmin@test.local" } });
      expect(user.role).toBe("USER");
    });

    it("cannot access admin-only routes even after attempting ADMIN injection", async () => {
      const { token } = await registerAndLogin("wannabeadmin2@test.local");
      await request(app)
        .get("/admin/sessions")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
      await request(app)
        .get("/admin/users")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });

  describe("Login — response safety & enumeration resistance", () => {
    it("does not return the password hash or any secret field on login", async () => {
      await registerUser("loginresp@test.local").expect(201);
      await verifyAllUsers();
      const res = await request(app)
        .post("/auth/login")
        .send({ email: "loginresp@test.local", password: "Password123!" })
        .expect(200);

      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body.data.user)).not.toContain("passwordHash");
    });

    it("returns the identical generic 401 for a nonexistent email and a wrong password", async () => {
      await registerUser("enum@test.local", "Password123!").expect(201);
      await verifyAllUsers();

      const nonexistent = await request(app)
        .post("/auth/login")
        .send({ email: "nobody@test.local", password: "Password123!" })
        .expect(401);
      const wrongPass = await request(app)
        .post("/auth/login")
        .send({ email: "enum@test.local", password: "WrongPass123!" })
        .expect(401);

      expect(nonexistent.body.error.message).toBe(wrongPass.body.error.message);
      expect(nonexistent.body.error).not.toContain("nobody@test.local");
    });
  });

  describe("JWT — claims & validation", () => {
    it("issues a token whose subject is the user id with role, jti, issuer, and expiry claims", async () => {
      const { userId, token } = await registerAndLogin("claims@test.local");
      const decoded = jwt.decode(token) as Record<string, unknown>;

      expect(decoded.sub).toBe(userId);
      expect(decoded.role).toBe("USER");
      expect(typeof decoded.jti).toBe("string");
      expect(decoded.jti).toBeTruthy();
      expect(decoded.iss).toBe("parada-api-test");
      expect(typeof decoded.exp).toBe("number");
      expect((decoded.exp as number) * 1000).toBeGreaterThan(Date.now());
      expect(decoded.passwordHash).toBeUndefined();
      expect(decoded.password).toBeUndefined();
    });

    it("rejects an expired token on a protected endpoint", async () => {
      await registerUser("expired@test.local").expect(201);
      const expiredToken = jwt.sign(
        { sub: "some-user", jti: randomUUID(), role: "USER" },
        SECRET,
        { algorithm: "HS256", issuer: ISSUER, expiresIn: "-1h" }
      );
      const res = await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects a token signed with a different (foreign) secret", async () => {
      const foreign = jwt.sign(
        { sub: "x", jti: randomUUID(), role: "USER" },
        "a-completely-different-foreign-secret-key",
        { algorithm: "HS256", issuer: ISSUER }
      );
      await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${foreign}`)
        .expect(401);
    });

    it("rejects a malformed / invalid-format token", async () => {
      await request(app).get("/auth/me").set("Authorization", "Bearer not-a-jwt").expect(401);
    });
  });

  describe("Token revocation — protected endpoint access", () => {
    it("rejects a revoked token on a protected Phase 3 endpoint", async () => {
      const { token } = await registerAndLogin("revoked-protected@test.local");
      await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      const res = await request(app)
        .get("/reservations")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("a non-revoked token still works on the same protected endpoint after another token is revoked", async () => {
      const { token: keep } = await registerAndLogin("keep-token@test.local");
      const { userId: otherUser } = await registerAndLogin("other-token@test.local");
      const otherToken = tokenService.sign({ id: otherUser, role: "USER" }).token;
      await request(app)
        .post("/auth/logout")
        .set("Authorization", `Bearer ${otherToken}`)
        .expect(204);

      await request(app).get("/reservations").set("Authorization", `Bearer ${keep}`).expect(200);
    });
  });

  describe("Authorization — protected routes", () => {
    it("rejects an unauthenticated request to a protected Phase 3 endpoint", async () => {
      await request(app).get("/reservations").expect(401);
      await request(app).get("/sessions/active").expect(401);
      await request(app).get("/vehicles").expect(401);
      await request(app).post("/sessions/entry").send({}).expect(401);
    });

    it("allows authenticated USER access to user-owned operations", async () => {
      const { token, userId } = await registerAndLogin("authed-user@test.local");
      const vehicle = await request(app)
        .post("/vehicles")
        .set("Authorization", `Bearer ${token}`)
        .send({ plateNumber: "SEC-1234", vehicleType: "CAR" })
        .expect(201);
      expect(vehicle.body.data.userId).toBe(userId);

      await request(app).get("/reservations").set("Authorization", `Bearer ${token}`).expect(200);
      await request(app).get("/sessions/active").set("Authorization", `Bearer ${token}`).expect(200);
    });

    it("denies USER access to every admin router endpoint", async () => {
      const { token } = await registerAndLogin("denied-admin@test.local");
      const adminPaths = [
        "/admin/dashboard",
        "/admin/zones",
        "/admin/cameras",
        "/admin/notifications",
        "/admin/anomalies",
        "/admin/sessions",
        "/admin/users",
        "/admin/vehicles",
      ];
      for (const path of adminPaths) {
        const res = await request(app).get(path).set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(403);
      }
    });

    it("keeps the GET /zones/recommendation public (no auth required)", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Public Rec", code: "PUB", capacity: 3 },
      });
      const res = await request(app).get("/zones/recommendation").expect(200);
      expect(res.body.data.recommendedZone.id).toBe(zone.id);
    });
  });
});

describe("Phase 11A — Admin establishment resource & camera configuration", () => {
  const tokens = new TokenService({
    secret: "test-secret-key-for-testing-only-32chars",
    issuer: "parada-api-test",
    expiresIn: "1d",
  });
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const admin = await prisma.user.create({
      data: { name: "Admin", email: "phase11a-admin@test.local", passwordHash: "x", role: "ADMIN" },
    });
    const user = await prisma.user.create({
      data: { name: "User", email: "phase11a-user@test.local", passwordHash: "x", role: "USER" },
    });
    adminToken = tokens.sign({ id: admin.id, role: "ADMIN" }).token;
    userToken = tokens.sign({ id: user.id, role: "USER" }).token;
    app = createApp();
  });

  describe("ADMIN zone CRUD", () => {
    it("creates a zone and exposes it to the public/mobile /zones contract", async () => {
      await request(app)
        .post("/admin/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Zone D", code: "D", capacity: 30, description: "South extension" })
        .expect(201);

      const res = await request(app).get("/zones").expect(200);
      const zone = res.body.data.find((z: { code: string }) => z.code === "D");
      expect(zone).toMatchObject({ name: "Zone D", code: "D", capacity: 30, occupiedCount: 0, availableCount: 30, status: "ACTIVE" });
    });

    it("rejects a duplicate zone code", async () => {
      await request(app)
        .post("/admin/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Zone A", code: "A", capacity: 10 })
        .expect(201);
      await request(app)
        .post("/admin/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Zone Dupe", code: "A", capacity: 10 })
        .expect(409);
    });

    it("rejects a non-positive capacity", async () => {
      const res = await request(app)
        .post("/admin/zones")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Bad", code: "BAD", capacity: 0 })
        .expect(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    });

    it("edits a zone name/code/status without changing occupancy", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Origin", code: "O", capacity: 10, occupiedCount: 3 },
      });
      const res = await request(app)
        .patch(`/admin/zones/${zone.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Renamed", code: "R", status: "INACTIVE" })
        .expect(200);
      expect(res.body.data).toMatchObject({ name: "Renamed", code: "R", occupiedCount: 3, capacity: 10, status: "INACTIVE" });
    });

    it("deactivating a zone removes it from the public /zones list (no new availability)", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Zone B", code: "B", capacity: 5, occupiedCount: 2 },
      });
      await request(app)
        .patch(`/admin/zones/${zone.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "INACTIVE" })
        .expect(200);
      const res = await request(app).get("/zones").expect(200);
      expect(res.body.data.some((z: { code: string }) => z.code === "B")).toBe(false);
    });

    it("REJECTS reducing capacity below current occupancy", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Zone C", code: "C", capacity: 10, occupiedCount: 6 },
      });
      await request(app)
        .patch(`/admin/zones/${zone.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ capacity: 5 })
        .expect(409);
      const after = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } });
      expect(after.capacity).toBe(10);
      expect(after.occupiedCount).toBe(6);
    });

    it("REJECTS reducing capacity below reservation-protected capacity", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Zone R", code: "PR", capacity: 10, occupiedCount: 2 },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: "phase11a-user@test.local" } });
      const vehicle = await prisma.vehicle.create({
        data: { userId: user.id, plateNumber: "RES-0001", normalizedPlate: "RES0001", vehicleType: "CAR", status: "ACTIVE" },
      });
      await prisma.reservation.create({
        data: {
          userId: user.id,
          vehicleId: vehicle.id,
          zoneId: zone.id,
          startAt: new Date(),
          endAt: new Date(Date.now() + 3600000),
          status: "CONFIRMED",
        },
      });
      await request(app)
        .patch(`/admin/zones/${zone.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ capacity: 3 })
        .expect(409);
      const after = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } });
      expect(after.capacity).toBe(10);
    });

    it("allows an equal-or-greater capacity change", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Zone G", code: "PRG", capacity: 10, occupiedCount: 3 },
      });
      await request(app)
        .patch(`/admin/zones/${zone.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ capacity: 6 })
        .expect(200);
      const after = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } });
      expect(after.capacity).toBe(6);
    });
  });

  describe("ADMIN physical-slot inventory (layout only)", () => {
    it("lists and reconciles the physical inventory and never touches occupancy", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Zone S", code: "S", capacity: 30, occupiedCount: 4 },
      });

      const set = await request(app)
        .post(`/admin/zones/${zone.id}/slots`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ slotCodes: ["S01", "S02", "S03"] })
        .expect(201);
      expect(set.body.data.map((s: { slotCode: string }) => s.slotCode).sort()).toEqual(["S01", "S02", "S03"]);

      const list = await request(app)
        .get(`/admin/zones/${zone.id}/slots`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data).toHaveLength(3);

      const after = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } });
      expect(after.occupiedCount).toBe(4);
    });

    it("rejects more physical spaces than the zone capacity", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Zone Cap", code: "CAPS", capacity: 2 },
      });
      await request(app)
        .post(`/admin/zones/${zone.id}/slots`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ slotCodes: ["A", "B", "C"] })
        .expect(409);
    });

    it("marks removed slots inactive instead of deleting them", async () => {
      const zone = await prisma.parkingZone.create({ data: { name: "Zone D2", code: "D2", capacity: 5 } });
      await request(app)
        .post(`/admin/zones/${zone.id}/slots`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ slotCodes: ["D201", "D202"] })
        .expect(201);
      await request(app)
        .post(`/admin/zones/${zone.id}/slots`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ slotCodes: ["D201"] })
        .expect(201);
      const rows = await prisma.parkingSlot.findMany({ where: { zoneId: zone.id } });
      expect(rows).toHaveLength(2);
      const d202 = rows.find((s) => s.slotCode === "D202");
      expect(d202?.status).toBe("INACTIVE");
    });
  });

  describe("ADMIN camera CRUD & configuration", () => {
    let zone: { id: string };
    beforeEach(async () => {
      zone = await prisma.parkingZone.create({ data: { name: "Zone Cam", code: "CAM", capacity: 5 } });
    });

    it("registers a camera bound to a zone", async () => {
      const res = await request(app)
        .post("/admin/cameras")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: zone.id, identifier: "CAM-A01", name: "Zone A Entry", gateType: "ENTRY", status: "ONLINE" })
        .expect(201);
      expect(res.body.data).toMatchObject({ identifier: "CAM-A01", gateType: "ENTRY", zone: { id: zone.id } });
    });

    it("rejects a duplicate camera identifier", async () => {
      await request(app)
        .post("/admin/cameras")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: zone.id, identifier: "CAM-DUP", gateType: "ENTRY" })
        .expect(201);
      await request(app)
        .post("/admin/cameras")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: zone.id, identifier: "CAM-DUP", gateType: "EXIT" })
        .expect(409);
    });

    it("rejects an invalid gate direction", async () => {
      const res = await request(app)
        .post("/admin/cameras")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: zone.id, identifier: "CAM-BAD", gateType: "SIDEWAYS" })
        .expect(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    });

    it("rejects a camera bound to a nonexistent zone", async () => {
      await request(app)
        .post("/admin/cameras")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: "does-not-exist", identifier: "CAM-NOZONE", gateType: "ENTRY" })
        .expect(404);
    });

    it("re-assigns a camera to another zone and edits direction/status", async () => {
      const other = await prisma.parkingZone.create({ data: { name: "Other Zone", code: "OTH", capacity: 5 } });
      const cam = await prisma.camera.create({
        data: { zoneId: zone.id, name: "Cam", identifier: "CAM-REASSIGN", gateType: "ENTRY", status: "ONLINE" },
      });
      const res = await request(app)
        .patch(`/admin/cameras/${cam.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ zoneId: other.id, gateType: "BIDIRECTIONAL", status: "OFFLINE" })
        .expect(200);
      expect(res.body.data).toMatchObject({ zone: { id: other.id }, gateType: "BIDIRECTIONAL", status: "OFFLINE" });
    });
  });

  describe("ADMIN camera ↔ OCR/occupancy integration (Phase 11 regression)", () => {
    it("resolves a registered configured camera against its zone via the existing pipeline", async () => {
      const zone = await prisma.parkingZone.create({
        data: { name: "Zone OCR", code: "OCR", capacity: 5 },
      });
      const camera = await prisma.camera.create({
        data: { zoneId: zone.id, name: "OCR Entry", identifier: "CAM-OCR-ENTRY", gateType: "ENTRY", status: "ONLINE" },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: "phase11a-user@test.local" } });
      await prisma.vehicle.create({
        data: { userId: user.id, plateNumber: "OCR-1234", normalizedPlate: "OCR1234", vehicleType: "CAR", status: "ACTIVE" },
      });

      const res = await request(app)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: camera.identifier, sourceEventId: "ocr-evt-1", eventType: "ENTRY", detectedPlate: "OCR-1234", ocrConfidence: 0.98 })
        .expect(201);
      expect(res.body.data.zoneId).toBe(zone.id);

      const occ = await request(app).get(`/zones/${zone.id}/occupancy`).expect(200);
      expect(occ.body.data.occupiedCount).toBe(1);

      // GET /zones reflects the configured zone
      const zones = await request(app).get("/zones").expect(200);
      expect(zones.body.data.some((z: { code: string }) => z.code === "OCR")).toBe(true);
    });

    it("rejects events from a disabled (OFFLINE) camera per existing semantics", async () => {
      const zone = await prisma.parkingZone.create({ data: { name: "Zone Off", code: "OFFCAM", capacity: 5 } });
      await prisma.camera.create({
        data: { zoneId: zone.id, name: "Off", identifier: "CAM-OFF", gateType: "BIDIRECTIONAL", status: "OFFLINE" },
      });
      const res = await request(app)
        .post(`/zones/${zone.id}/events`)
        .send({ cameraIdentifier: "CAM-OFF", sourceEventId: "off-evt", eventType: "ENTRY" })
        .expect(409);
      expect(res.body.error.message).toContain("offline");
    });

    it("still validates that a camera must belong to the target zone before occupancy", async () => {
      const zoneA = await prisma.parkingZone.create({ data: { name: "Zone A", code: "CAMPA", capacity: 5 } });
      const zoneB = await prisma.parkingZone.create({ data: { name: "Zone B", code: "CAMPB", capacity: 5 } });
      await prisma.camera.create({
        data: { zoneId: zoneA.id, name: "A Cam", identifier: "CAM-A", gateType: "BIDIRECTIONAL", status: "ONLINE" },
      });
      await request(app)
        .post(`/zones/${zoneB.id}/events`)
        .send({ cameraIdentifier: "CAM-A", sourceEventId: "cross-evt", eventType: "ENTRY" })
        .expect(409);
    });
  });

  describe("ADMIN authorization enforcement", () => {
    it("denies USER mutations on zones and cameras", async () => {
      await request(app).post("/admin/zones").set("Authorization", `Bearer ${userToken}`).send({ name: "X", code: "X", capacity: 5 }).expect(403);
      await request(app)
        .post("/admin/cameras")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ zoneId: "any", identifier: "C", gateType: "ENTRY" })
        .expect(403);
      await request(app).get("/admin/zones").set("Authorization", `Bearer ${userToken}`).expect(403);
    });

    it("requires an admin token for every mutation", async () => {
      await request(app).post("/admin/zones").send({ name: "X", code: "X", capacity: 5 }).expect(401);
      await request(app).post("/admin/cameras").send({ zoneId: "any", identifier: "C", gateType: "ENTRY" }).expect(401);
    });
  });
});

describe("Phase 11B — Rate limiting (AUDIT-003)", () => {
  const tokens = new TokenService({
    secret: "test-secret-key-for-testing-only-32chars",
    issuer: "parada-api-test",
    expiresIn: "1d",
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("throttles credential attempts with 429, TOO_MANY_REQUESTS and Retry-After", async () => {
    const app = createApp({ authRateLimit: { limit: 3, windowMs: 60_000 } });

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/auth/login")
        .send({ email: "nobody@test.local", password: "WrongPass1!" })
        .expect(401);
    }
    // The 4th request is throttled, not treated as a credential failure.
    const limited = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@test.local", password: "WrongPass1!" })
      .expect(429);
    expect(limited.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("resets the credential budget after the window elapses", async () => {
    const app = createApp({ authRateLimit: { limit: 2, windowMs: 150 } });

    await request(app).post("/auth/login").send({ email: "win@test.local", password: "WrongPass1!" }).expect(401);
    await request(app).post("/auth/login").send({ email: "win@test.local", password: "WrongPass1!" }).expect(401);
    await request(app).post("/auth/login").send({ email: "win@test.local", password: "WrongPass1!" }).expect(429);

    await new Promise((resolve) => setTimeout(resolve, 250));

    // Back under the limit: a fresh attempt is a credential error again (401),
    // not a throttle.
    await request(app).post("/auth/login").send({ email: "win@test.local", password: "WrongPass1!" }).expect(401);
  });

  it("throttles registration through the same credential budget", async () => {
    const app = createApp({ authRateLimit: { limit: 2, windowMs: 60_000 } });

    await request(app).post("/auth/register").send({ name: "R1", email: "rl1@test.local", password: "Password123!" }).expect(201);
    await verifyAllUsers();
    await request(app).post("/auth/register").send({ name: "R2", email: "rl2@test.local", password: "Password123!" }).expect(201);
    await verifyAllUsers();
    await request(app).post("/auth/register").send({ name: "R3", email: "rl3@test.local", password: "Password123!" }).expect(429);
  });

  it("throttles camera event ingestion per camera; other cameras stay usable", async () => {
    const app = createApp({
      cameraApiKey: "test-camera-key-123",
      cameraEventRateLimit: { limit: 3, windowMs: 60_000 },
    });
    const zone = await prisma.parkingZone.create({ data: { name: "RL Zone", code: "RLZ", capacity: 5 } });
    const camA = await prisma.camera.create({ data: { zoneId: zone.id, name: "RL A", identifier: "cam-rl-a", gateType: "ENTRY", status: "ONLINE" } });
    const camB = await prisma.camera.create({ data: { zoneId: zone.id, name: "RL B", identifier: "cam-rl-b", gateType: "ENTRY", status: "ONLINE" } });

    const send = (cameraIdentifier: string, n: number) =>
      request(app)
        .post(`/zones/${zone.id}/events`)
        .set("X-API-Key", "test-camera-key-123")
        .send({ cameraIdentifier, sourceEventId: `rl-evt-${n}`, eventType: "ENTRY" });

    await send(camA.identifier, 1).expect(201);
    await send(camA.identifier, 2).expect(201);
    await send(camA.identifier, 3).expect(201);
    const limited = await send(camA.identifier, 4).expect(429);
    expect(limited.body.error.code).toBe("TOO_MANY_REQUESTS");

    // A different camera keeps its own allowance.
    await send(camB.identifier, 5).expect(201);

    // Throttled requests persist nothing: exactly the 4 accepted events exist.
    expect(await prisma.occupancyEvent.count()).toBe(4);
  });

  it("throttles admin mutations per admin while reads and auth stay intact", async () => {
    const app = createApp({ adminRateLimit: { limit: 3, windowMs: 60_000 } });
    const zone = await prisma.parkingZone.create({ data: { name: "RL Admin", code: "RLA", capacity: 5 } });
    const admin = await prisma.user.create({
      data: { name: "RL Admin", email: "rl-admin@test.local", passwordHash: "x", role: "ADMIN" },
    });
    const token = tokens.sign({ id: admin.id, role: "ADMIN" }).token;
    const notif = await prisma.notification.create({
      data: { zoneId: zone.id, type: "ZONE_FULL", message: "ops", targetRole: "ADMIN" },
    });

    // Reads are not throttled.
    await request(app).get("/admin/dashboard").set("Authorization", `Bearer ${token}`).expect(200);

    for (let i = 0; i < 3; i++) {
      await request(app).patch(`/admin/notifications/${notif.id}/read`).set("Authorization", `Bearer ${token}`).expect(200);
    }
    const limited = await request(app).patch(`/admin/notifications/${notif.id}/read`).set("Authorization", `Bearer ${token}`).expect(429);
    expect(limited.body.error.code).toBe("TOO_MANY_REQUESTS");

    // A 429 is not an auth failure: the admin is still authenticated and reads work.
    await request(app).get("/admin/dashboard").set("Authorization", `Bearer ${token}`).expect(200);
  });

  it("keeps a user authenticated across credential throttling", async () => {
    const app = createApp({ authRateLimit: { limit: 5, windowMs: 60_000 } });

    await request(app).post("/auth/register").send({ name: "RL User", email: "rl-user@test.local", password: "Password123!" }).expect(201);
    await verifyAllUsers();
    const login = await request(app).post("/auth/login").send({ email: "rl-user@test.local", password: "Password123!" }).expect(200);
    const token = login.body.data.token;
    await request(app).get("/reservations").set("Authorization", `Bearer ${token}`).expect(200);

    // Exhaust the shared credential budget (register + login consumed 2 of 5)...
    let throttled = false;
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/auth/login").send({ email: "rl-user@test.local", password: "WrongPass1!" });
      if (res.status === 429) {
        throttled = true;
        break;
      }
      expect(res.status).toBe(401);
    }
    expect(throttled).toBe(true);

    // ...and the session survives: the token still authorizes, and logout
    // (which requires a valid, unrevoked token) succeeds.
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(me.body.data.id).toBe(login.body.data.user.id);
    await request(app).get("/reservations").set("Authorization", `Bearer ${token}`).expect(200);
    await request(app).post("/auth/logout").set("Authorization", `Bearer ${token}`).expect(204);
  });
});


