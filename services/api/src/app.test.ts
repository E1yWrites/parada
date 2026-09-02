import request from "supertest";
import * as argon2 from "argon2";
import { prisma } from "@parada/database";
import { createApp, type AppOptions } from "./app";
import { AuthService } from "./domain/auth";
import { TokenService } from "./domain/token";

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

describe("Authentication & Authorization", () => {
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;
  let tokenService: TokenService;

  beforeAll(async () => {
    await cleanDatabase();
    authService = new AuthService({
      secret: "test-secret-key-for-testing-only-32chars",
      issuer: "parada-api-test",
      expiresIn: "1d",
    });
    tokenService = new TokenService({
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

      expect(res.body.data.user).toEqual(
        expect.objectContaining({
          name: "Test User",
          email: "test@test.local",
          role: "USER",
          status: "ACTIVE",
        })
      );
      expect(res.body.data.user.id).toBeDefined();
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it("duplicate email rejection", async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Test User", email: "dup@test.local", password: "Password123!" })
        .expect(201);

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
    let userId: string;
    let otherUserId: string;

    beforeEach(async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "User One", email: "user1@test.local", password: "Password123!" })
        .expect(201);
      await request(app)
        .post("/auth/register")
        .send({ name: "User Two", email: "user2@test.local", password: "Password123!" })
        .expect(201);

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
      userId = login1.body.data.user.id;
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
    let otherUserToken: string;

    beforeEach(async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Session User", email: "session1@test.local", password: "Password123!" })
        .expect(201);
      await request(app)
        .post("/auth/register")
        .send({ name: "Other User", email: "session2@test.local", password: "Password123!" })
        .expect(201);

      const login1 = await request(app)
        .post("/auth/login")
        .send({ email: "session1@test.local", password: "Password123!" })
        .expect(200);
      const login2 = await request(app)
        .post("/auth/login")
        .send({ email: "session2@test.local", password: "Password123!" })
        .expect(200);

      userToken = login1.body.data.token;
      otherUserToken = login2.body.data.token;
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
      const vehicle = await prisma.vehicle.create({
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
  });

  describe("Admin authorization", () => {
    let userToken: string;
    let adminToken: string;

    beforeEach(async () => {
      await request(app)
        .post("/auth/register")
        .send({ name: "Regular User", email: "reguser@test.local", password: "Password123!" })
        .expect(201);

      const admin = await prisma.user.create({
        data: {
          name: "Admin User",
          email: "admin@test.local",
          passwordHash: await argon2.hash("AdminPass123!", { type: argon2.argon2id }),
          role: "ADMIN",
          status: "ACTIVE",
        },
      });

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
  });
});
