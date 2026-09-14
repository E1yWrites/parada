/**
 * Phase 13 — full system integration regression.
 *
 * Drives the complete PARADA lifecycle over the real HTTP API against the
 * real database, the way the clients do it:
 *
 *   register → login → vehicle → zone → recommendation → assignment /
 *   reservation → GPS destination → camera (vision contract) → API → domain
 *   → DB → realtime → mobile + admin reads → exit → fee → history
 *
 * plus the cross-layer failure cases (camera, OCR, auth, throttling, 5xx,
 * reservation/assignment conflicts, disabled camera). Every assertion reads
 * committed state back through the same endpoints the mobile and admin apps
 * consume, so a divergence between the two surfaces fails here.
 */
import request from "supertest";
import * as argon2 from "argon2";
import { prisma } from "@parada/database";
import { createApp } from "./app";
import { AuthService } from "./domain/auth";
import { OccupancyService } from "./domain/occupancy";
import { RealtimeHub, type RealtimeClient } from "./realtime/hub";

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
  "revoked_tokens",
];

async function cleanDatabase() {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }
}

const CAMERA_API_KEY = "phase13-camera-key";
const auth = new AuthService({
  secret: "test-secret-key-for-testing-only-32chars",
  issuer: "parada-api-test",
  expiresIn: "1d",
});

/** A fake SSE subscriber that records every frame the hub writes to it. */
function spy(userId: string, role: "ADMIN" | "USER"): { client: RealtimeClient; frames: string[] } {
  const frames: string[] = [];
  return { client: { id: `${userId}-${Math.random()}`, userId, role, write: (c) => frames.push(c) }, frames };
}

function framesOf(frames: string[], type: string) {
  // Hub frames are `id: <seq>\nevent: <type>\ndata: <json>\n\n` — the id line
  // is the reconnect cursor — so match on the event line, not the frame start.
  return frames
    .filter((f) => f.includes(`\nevent: ${type}\n`))
    .map((f) => JSON.parse(f.split("data: ")[1]!) as { type: string; payload: Record<string, unknown> });
}

async function seedAdmin(email: string) {
  const admin = await prisma.user.create({
    data: {
      name: "Ops Admin",
      email,
      passwordHash: await argon2.hash("AdminPass123!", { type: argon2.argon2id }),
      role: "ADMIN",
    },
  });
  return admin;
}

describe("Phase 13 — full system integration", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  it("runs the complete registered-vehicle lifecycle end to end with consistent mobile, admin, and realtime views", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub, cameraApiKey: CAMERA_API_KEY });

    // ---- Register + login (mobile) -------------------------------------
    const registered = await request(app)
      .post("/auth/register")
      .send({ name: "Lifecycle Driver", email: "lifecycle@test.local", password: "DriverPass123!" })
      .expect(201);
    const driverId: string = registered.body.data.user.id;
    expect(registered.body.data.user.role).toBe("USER");

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "lifecycle@test.local", password: "DriverPass123!" })
      .expect(200);
    const driverToken: string = login.body.data.token;
    const asDriver = (req: request.Test) => req.set("Authorization", `Bearer ${driverToken}`);

    // ---- Admin configuration (admin web) --------------------------------
    await seedAdmin("ops@test.local");
    const adminLogin = await request(app)
      .post("/auth/login")
      .send({ email: "ops@test.local", password: "AdminPass123!" })
      .expect(200);
    const asAdmin = (req: request.Test) => req.set("Authorization", `Bearer ${adminLogin.body.data.token}`);

    const zone = await asAdmin(request(app).post("/admin/zones"))
      .send({ name: "Integration Zone", code: "P13", capacity: 3 })
      .expect(201);
    const zoneId: string = zone.body.data.id;

    await asAdmin(request(app).post("/admin/cameras"))
      .send({ identifier: "p13-entry", zoneId, gateType: "ENTRY", status: "ONLINE" })
      .expect(201);
    await asAdmin(request(app).post("/admin/cameras"))
      .send({ identifier: "p13-exit", zoneId, gateType: "EXIT", status: "ONLINE" })
      .expect(201);

    // Establishment settings: fees, guest policy, and the GPS destination.
    const settings = await asAdmin(request(app).put("/admin/config"))
      .send({
        parkingFee: { baseFee: 20, baseDurationHours: 2, additionalFeePerHour: 10 },
        guestPolicy: { policy: "PRIMARY_ZONE", primaryZoneId: zoneId },
        zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
        violations: [{ type: "WRONG_ZONE", fineAmount: 100, description: "Wrong zone." }],
        location: { address: "LPU Batangas", latitude: 13.7565, longitude: 121.0583 },
      })
      .expect(200);
    expect(settings.body.data.location.address).toBe("LPU Batangas");

    // ---- Vehicle (mobile) ---------------------------------------------
    const vehicle = await asDriver(request(app).post("/vehicles"))
      .send({ plateNumber: "P13-0001", vehicleType: "CAR" })
      .expect(201);
    const vehicleId: string = vehicle.body.data.id;

    // ---- Zones + recommendation (mobile, public) ------------------------
    const zones = await request(app).get("/zones").expect(200);
    expect(zones.body.data).toEqual([
      expect.objectContaining({ id: zoneId, code: "P13", occupiedCount: 0, availableCount: 3, availability: "AVAILABLE" }),
    ]);
    const recommendation = await request(app).get("/zones/recommendation").expect(200);
    expect(recommendation.body.data.recommendedZone.id).toBe(zoneId);
    // A recommendation is not an assignment.
    expect(await prisma.zoneAssignment.count()).toBe(0);

    // ---- Accept recommendation → assignment ----------------------------
    const assignment = await asDriver(request(app).post("/assignments"))
      .send({ zoneId, vehicleId })
      .expect(201);
    expect(assignment.body.data.status).toBe("ACTIVE");
    expect(assignment.body.data.zone.id).toBe(zoneId);
    // Assignment conflict: one active assignment per vehicle.
    const dupAssignment = await asDriver(request(app).post("/assignments")).send({ zoneId, vehicleId }).expect(409);
    expect(dupAssignment.body.error.code).toBe("CONFLICT");

    // ---- GPS destination (mobile navigate) ------------------------------
    const establishment = await asDriver(request(app).get("/zones/establishment")).expect(200);
    expect(establishment.body.data.location).toEqual({ address: "LPU Batangas", latitude: 13.7565, longitude: 121.0583 });
    await request(app).get("/zones/establishment").expect(401);

    // ---- Realtime subscribers: the driver (mobile), a stranger, an admin --
    const driver = spy(driverId, "USER");
    const stranger = spy("someone-else", "USER");
    const admin = spy("admin-dashboard", "ADMIN");
    hub.subscribe(driver.client);
    hub.subscribe(stranger.client);
    hub.subscribe(admin.client);

    // ---- Camera ENTRY (vision → API contract) --------------------------
    const enteredAtMs = Date.now() - 3 * 60 * 60_000;
    const enteredAt = new Date(enteredAtMs).toISOString();
    const entry = await request(app)
      .post(`/zones/${zoneId}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({
        cameraIdentifier: "p13-entry",
        sourceEventId: "vision-entry-0001",
        eventType: "ENTRY",
        detectedPlate: "P13 0001",
        ocrConfidence: 0.97,
        detectedAt: enteredAt,
      })
      .expect(201);
    expect(entry.body.data).toMatchObject({ eventType: "ENTRY", newOccupied: 1, availableCount: 2, plateMatched: true, source: "CAMERA" });
    expect(entry.body.data).not.toHaveProperty("notifications");

    // DB: occupancy, event, history, session are committed together.
    const zoneAfterEntry = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zoneId } });
    expect(zoneAfterEntry.occupiedCount).toBe(1);
    expect(await prisma.occupancyHistory.count({ where: { zoneId } })).toBe(1);
    const session = await prisma.parkingSession.findFirstOrThrow({ where: { vehicleId } });
    expect(session.status).toBe("ACTIVE");
    expect(session.userId).toBe(driverId);
    expect(session.entryEventId).toBe(entry.body.data.id);

    // Realtime: public occupancy to everyone; the session only to its owner
    // (and the admin console), never to a stranger.
    expect(framesOf(driver.frames, "ZONE_OCCUPANCY_UPDATED")[0]!.payload).toMatchObject({ zoneId, occupiedCount: 1, availableCount: 2 });
    expect(framesOf(stranger.frames, "ZONE_OCCUPANCY_UPDATED")).toHaveLength(1);
    const started = framesOf(driver.frames, "PARKING_SESSION_STARTED");
    expect(started).toHaveLength(1);
    expect(started[0]!.payload).toMatchObject({ id: session.id, status: "ACTIVE", zone: { id: zoneId }, vehicle: { plateNumber: "P13-0001" } });
    expect(framesOf(stranger.frames, "PARKING_SESSION_STARTED")).toHaveLength(0);
    expect(framesOf(admin.frames, "PARKING_SESSION_STARTED")).toHaveLength(1);

    // Mobile and admin read the same committed state.
    const active = await asDriver(request(app).get("/sessions/active")).expect(200);
    expect(active.body.data).toMatchObject({ id: session.id, status: "ACTIVE", feeAmount: null, zone: { code: "P13" } });
    const adminSessions = await asAdmin(request(app).get("/admin/sessions")).expect(200);
    expect(adminSessions.body.data).toEqual([expect.objectContaining({ id: session.id, status: "ACTIVE", user: expect.objectContaining({ id: driverId }) })]);
    const dashboard = await asAdmin(request(app).get("/admin/dashboard")).expect(200);
    expect(dashboard.body.data.summary).toMatchObject({ totalOccupied: 1, activeSessions: 1, onlineCameras: 2 });
    expect(dashboard.body.data.zones[0]).toMatchObject({ id: zoneId, occupiedCount: 1 });
    const publicZone = await request(app).get(`/zones/${zoneId}/occupancy`).expect(200);
    expect(publicZone.body.data).toMatchObject({ occupiedCount: 1, availableCount: 2 });

    // ---- Camera EXIT → fee → history -----------------------------------
    // Exactly 3h after entry, so the fee is deterministic.
    const exitedAt = new Date(enteredAtMs + 3 * 60 * 60_000).toISOString();
    const exit = await request(app)
      .post(`/zones/${zoneId}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({
        cameraIdentifier: "p13-exit",
        sourceEventId: "vision-exit-0001",
        eventType: "EXIT",
        detectedPlate: "P13-0001",
        ocrConfidence: 0.93,
        detectedAt: exitedAt,
      })
      .expect(201);
    expect(exit.body.data).toMatchObject({ eventType: "EXIT", newOccupied: 0, availableCount: 3 });

    const completed = await prisma.parkingSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.exitEventId).toBe(exit.body.data.id);
    // 3h parked: 2h base (₱20) + 1 started additional hour (₱10).
    expect(completed.feeAmount).toBe(30);
    expect(completed.durationSeconds).toBe(3 * 60 * 60);
    const fee = await prisma.parkingFee.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(fee).toMatchObject({ amount: 30, status: "PENDING", userId: driverId, zoneId });

    const finished = framesOf(driver.frames, "PARKING_SESSION_COMPLETED");
    expect(finished).toHaveLength(1);
    expect(finished[0]!.payload).toMatchObject({ id: session.id, status: "COMPLETED", feeAmount: 30 });
    expect(framesOf(stranger.frames, "PARKING_SESSION_COMPLETED")).toHaveLength(0);

    // Mobile: no active session, history carries the fee. Admin: consistent.
    const noActive = await asDriver(request(app).get("/sessions/active")).expect(200);
    expect(noActive.body.data).toBeNull();
    const history = await asDriver(request(app).get("/sessions")).expect(200);
    expect(history.body.data).toEqual([expect.objectContaining({ id: session.id, status: "COMPLETED", feeAmount: 30, durationSeconds: completed.durationSeconds })]);
    // Explicit window: the default `from` is local midnight, which excludes a
    // session entered 3h ago whenever the suite runs between 00:00 and 03:00.
    const analytics = await asAdmin(
      request(app)
        .get("/admin/analytics")
        .query({ from: new Date(enteredAtMs - 60_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString() }),
    ).expect(200);
    expect(analytics.body.data.revenue).toMatchObject({ total: 30, fees: 1 });
    expect(analytics.body.data.sessions).toMatchObject({ completed: 1, active: 0 });
    const zoneHistory = await asAdmin(request(app).get(`/admin/zones/${zoneId}/history`)).expect(200);
    expect(zoneHistory.body.data.entries.map((e: { occupiedCount: number }) => e.occupiedCount)).toEqual([1, 0]);
  });

  it("a consumed reservation stops protecting capacity, so the next driver can reserve and enter the freed space", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub, cameraApiKey: CAMERA_API_KEY });

    const zone = await prisma.parkingZone.create({ data: { name: "Reserve Zone", code: "P13R", capacity: 2 } });
    await prisma.camera.create({ data: { zoneId: zone.id, name: "R Entry", identifier: "p13r-entry", gateType: "ENTRY", status: "ONLINE" } });
    const holder = await prisma.user.create({ data: { name: "Holder", email: "holder@test.local", passwordHash: "x", role: "USER" } });
    const walkup = await prisma.user.create({ data: { name: "Walk-up", email: "walkup@test.local", passwordHash: "x", role: "USER" } });
    const holderCar = await prisma.vehicle.create({ data: { userId: holder.id, plateNumber: "HOLD-1", normalizedPlate: "HOLD1", vehicleType: "CAR" } });
    const walkupCar = await prisma.vehicle.create({ data: { userId: walkup.id, plateNumber: "WALK-1", normalizedPlate: "WALK1", vehicleType: "CAR" } });
    const asHolder = (req: request.Test) => req.set("Authorization", `Bearer ${auth.tokens.sign({ id: holder.id, role: "USER" }).token}`);
    const asWalkup = (req: request.Test) => req.set("Authorization", `Bearer ${auth.tokens.sign({ id: walkup.id, role: "USER" }).token}`);

    // Holder reserves: 1 of 2 spaces is now protected.
    const reservation = await asHolder(request(app).post("/reservations")).send({ zoneId: zone.id, vehicleId: holderCar.id }).expect(201);
    expect(reservation.body.data.status).toBe("CONFIRMED");
    // Reservation conflict: the same vehicle cannot hold an overlapping window twice.
    await asHolder(request(app).post("/reservations")).send({ zoneId: zone.id, vehicleId: holderCar.id }).expect(409);

    // Holder arrives through the gate: the reservation is consumed (ACTIVE).
    await request(app)
      .post(`/zones/${zone.id}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({ cameraIdentifier: "p13r-entry", sourceEventId: "hold-entry", eventType: "ENTRY", detectedPlate: "HOLD-1", ocrConfidence: 0.9 })
      .expect(201);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.body.data.id } })).status).toBe("ACTIVE");
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } })).occupiedCount).toBe(1);

    // The holder is inside and counted in occupiedCount. The remaining space
    // must be available to everyone else — the consumed reservation may not
    // keep holding a phantom second space.
    const second = await asWalkup(request(app).post("/reservations")).send({ zoneId: zone.id, vehicleId: walkupCar.id }).expect(201);
    expect(second.body.data.status).toBe("CONFIRMED");
    await asWalkup(request(app).patch(`/reservations/${second.body.data.id}/cancel`)).expect(200);

    await request(app)
      .post(`/zones/${zone.id}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({ cameraIdentifier: "p13r-entry", sourceEventId: "walk-entry", eventType: "ENTRY", detectedPlate: "WALK-1", ocrConfidence: 0.9 })
      .expect(201);
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } })).occupiedCount).toBe(2);

    // Now genuinely full: a third registered driver is turned away.
    const third = await prisma.user.create({ data: { name: "Third", email: "third@test.local", passwordHash: "x", role: "USER" } });
    const thirdCar = await prisma.vehicle.create({ data: { userId: third.id, plateNumber: "THRD-1", normalizedPlate: "THRD1", vehicleType: "CAR" } });
    await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${auth.tokens.sign({ id: third.id, role: "USER" }).token}`)
      .send({ zoneId: zone.id, vehicleId: thirdCar.id })
      .expect(409);
  });

  it("a user-initiated entry consumes the driver's own reservation exactly like the camera path", async () => {
    const app = createApp({ auth, cameraApiKey: CAMERA_API_KEY });
    const zone = await prisma.parkingZone.create({ data: { name: "Manual Zone", code: "P13M", capacity: 2 } });
    const user = await prisma.user.create({ data: { name: "Manual", email: "manual@test.local", passwordHash: "x", role: "USER" } });
    const car = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "MAN-1", normalizedPlate: "MAN1", vehicleType: "CAR" } });
    const asUser = (req: request.Test) => req.set("Authorization", `Bearer ${auth.tokens.sign({ id: user.id, role: "USER" }).token}`);

    const reservation = await asUser(request(app).post("/reservations")).send({ zoneId: zone.id, vehicleId: car.id }).expect(201);
    await asUser(request(app).post("/sessions/entry")).send({ zoneId: zone.id, vehicleId: car.id }).expect(201);

    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.body.data.id } })).status).toBe("ACTIVE");
    // With the holder inside, only occupancy (1) counts against capacity (2).
    const other = await prisma.user.create({ data: { name: "Other", email: "other@test.local", passwordHash: "x", role: "USER" } });
    const otherCar = await prisma.vehicle.create({ data: { userId: other.id, plateNumber: "OTH-1", normalizedPlate: "OTH1", vehicleType: "CAR" } });
    await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${auth.tokens.sign({ id: other.id, role: "USER" }).token}`)
      .send({ zoneId: zone.id, vehicleId: otherCar.id })
      .expect(201);
  });

  it("expires a reservation outside its arrival window and releases the capacity it held", async () => {
    const app = createApp({ auth });
    const zone = await prisma.parkingZone.create({ data: { name: "Expiry Zone", code: "P13X", capacity: 1 } });
    const late = await prisma.user.create({ data: { name: "Late", email: "late@test.local", passwordHash: "x", role: "USER" } });
    const lateCar = await prisma.vehicle.create({ data: { userId: late.id, plateNumber: "LATE-1", normalizedPlate: "LATE1", vehicleType: "CAR" } });
    const stale = await prisma.reservation.create({
      data: {
        userId: late.id,
        vehicleId: lateCar.id,
        zoneId: zone.id,
        startAt: new Date(Date.now() - 20 * 60_000),
        endAt: new Date(Date.now() - 5 * 60_000),
        status: "CONFIRMED",
      },
    });
    const next = await prisma.user.create({ data: { name: "Next", email: "next@test.local", passwordHash: "x", role: "USER" } });
    const nextCar = await prisma.vehicle.create({ data: { userId: next.id, plateNumber: "NEXT-1", normalizedPlate: "NEXT1", vehicleType: "CAR" } });

    await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${auth.tokens.sign({ id: next.id, role: "USER" }).token}`)
      .send({ zoneId: zone.id, vehicleId: nextCar.id })
      .expect(201);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("EXPIRED");

    // The mobile list reflects the lazily-expired state too.
    const list = await request(app)
      .get("/reservations")
      .set("Authorization", `Bearer ${auth.tokens.sign({ id: late.id, role: "USER" }).token}`)
      .expect(200);
    expect(list.body.data[0]).toMatchObject({ id: stale.id, status: "EXPIRED" });
  });

  it("wrong-zone entry warns the driver in realtime and both notification surfaces agree", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub, cameraApiKey: CAMERA_API_KEY });
    const zoneA = await prisma.parkingZone.create({ data: { name: "Assigned Zone", code: "P13A", capacity: 5 } });
    const zoneB = await prisma.parkingZone.create({ data: { name: "Other Zone", code: "P13B", capacity: 5 } });
    await prisma.camera.create({ data: { zoneId: zoneB.id, name: "B Entry", identifier: "p13b-entry", gateType: "ENTRY", status: "ONLINE" } });
    const user = await prisma.user.create({ data: { name: "Wrong", email: "wrong@test.local", passwordHash: "x", role: "USER" } });
    const car = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "WRNG-1", normalizedPlate: "WRNG1", vehicleType: "CAR" } });
    const asUser = (req: request.Test) => req.set("Authorization", `Bearer ${auth.tokens.sign({ id: user.id, role: "USER" }).token}`);

    await asUser(request(app).post("/assignments")).send({ zoneId: zoneA.id, vehicleId: car.id }).expect(201);

    const driver = spy(user.id, "USER");
    const stranger = spy("nobody", "USER");
    hub.subscribe(driver.client);
    hub.subscribe(stranger.client);

    await request(app)
      .post(`/zones/${zoneB.id}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({ cameraIdentifier: "p13b-entry", sourceEventId: "wrong-1", eventType: "ENTRY", detectedPlate: "WRNG-1" })
      .expect(201);

    // Admitted with a warning: the session exists, the assignment is untouched.
    expect(await prisma.parkingSession.count({ where: { vehicleId: car.id, status: "ACTIVE", zoneId: zoneB.id } })).toBe(1);
    expect(await prisma.occupancyAnomaly.count({ where: { vehicleId: car.id, anomalyType: "WRONG_ZONE_WARNING" } })).toBe(1);
    expect(await prisma.violation.count()).toBe(0);

    const notified = framesOf(driver.frames, "NOTIFICATION_CREATED");
    expect(notified).toHaveLength(1);
    expect(notified[0]!.payload).toMatchObject({ type: "WRONG_ZONE_WARNING", userId: user.id, targetRole: "USER" });
    expect(framesOf(stranger.frames, "NOTIFICATION_CREATED")).toHaveLength(0);

    const mine = await asUser(request(app).get("/notifications")).expect(200);
    expect(mine.body.data.unreadCount).toBe(1);
    expect(mine.body.data.notifications[0]).toMatchObject({ id: notified[0]!.payload["id"], type: "WRONG_ZONE_WARNING", read: false });
  });

  it("guest denial and admin-override admission stay consistent across DB, admin reads, and realtime", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub, cameraApiKey: CAMERA_API_KEY });
    const zone = await prisma.parkingZone.create({ data: { name: "Guest Zone", code: "P13G", capacity: 2 } });
    await prisma.camera.create({ data: { zoneId: zone.id, name: "G Entry", identifier: "p13g-entry", gateType: "ENTRY", status: "ONLINE" } });
    const admin = await seedAdmin("guest-admin@test.local");
    const asAdmin = (req: request.Test) => req.set("Authorization", `Bearer ${auth.tokens.sign({ id: admin.id, role: "ADMIN" }).token}`);

    const console_ = spy(admin.id, "ADMIN");
    const driver = spy("some-driver", "USER");
    hub.subscribe(console_.client);
    hub.subscribe(driver.client);

    // No primary zone configured → denied, occupancy unchanged, auditable.
    const denied = await request(app)
      .post(`/zones/${zone.id}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({ cameraIdentifier: "p13g-entry", sourceEventId: "guest-1", eventType: "ENTRY", detectedPlate: "GUEST-1", ocrConfidence: 0.8 })
      .expect(201);
    expect(denied.body.data).toMatchObject({ admitted: false, deniedReason: "GUEST_POLICY_MISCONFIGURED", newOccupied: 0 });
    expect(denied.body.data).not.toHaveProperty("notifications");
    expect(await prisma.parkingSession.count()).toBe(0);

    expect(framesOf(console_.frames, "GUEST_ADMISSION_ISSUE")[0]!.payload).toMatchObject({ zoneId: zone.id, admitted: false });
    expect(framesOf(console_.frames, "NOTIFICATION_CREATED")[0]!.payload).toMatchObject({ type: "GUEST_ADMISSION_ISSUE", targetRole: "ADMIN" });
    // Operational admin alerts never leak to a driver.
    expect(framesOf(driver.frames, "GUEST_ADMISSION_ISSUE")).toHaveLength(0);
    expect(framesOf(driver.frames, "NOTIFICATION_CREATED")).toHaveLength(0);

    const adminNotifications = await asAdmin(request(app).get("/admin/notifications")).expect(200);
    expect(adminNotifications.body.data.unreadCount).toBe(1);
    const anomalies = await asAdmin(request(app).get("/admin/anomalies")).expect(200);
    expect(anomalies.body.data[0]).toMatchObject({ anomalyType: "GUEST_DENIED", cameraIdentifier: "p13g-entry", zoneCode: "P13G" });

    // Admin explicitly admits the same guest: occupancy changes, so the public
    // zone snapshot must reach every subscriber just like a camera event.
    const override = await asAdmin(request(app).post("/admin/guest-admit"))
      .send({ zoneId: zone.id, cameraIdentifier: "p13g-entry", sourceEventId: "guest-1-override", detectedPlate: "GUEST-1" })
      .expect(201);
    expect(override.body.data).toMatchObject({ admitted: true, anomalyType: "GUEST_ADMIN_OVERRIDE", newOccupied: 1 });
    expect(override.body.data).not.toHaveProperty("notifications");
    expect(framesOf(driver.frames, "ZONE_OCCUPANCY_UPDATED").at(-1)!.payload).toMatchObject({ zoneId: zone.id, occupiedCount: 1 });

    const sessions = await asAdmin(request(app).get("/admin/sessions")).expect(200);
    expect(sessions.body.data).toEqual([expect.objectContaining({ status: "ACTIVE", user: null, vehicle: null, zone: expect.objectContaining({ id: zone.id }) })]);
    const dashboard = await asAdmin(request(app).get("/admin/dashboard")).expect(200);
    expect(dashboard.body.data.summary).toMatchObject({ totalOccupied: 1, activeSessions: 1 });
  });

  it("admin zone edits and simulator runs push the committed zone snapshot to every zone consumer", async () => {
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub, cameraApiKey: CAMERA_API_KEY });
    const admin = await seedAdmin("zone-admin@test.local");
    const asAdmin = (req: request.Test) => req.set("Authorization", `Bearer ${auth.tokens.sign({ id: admin.id, role: "ADMIN" }).token}`);
    const zone = await prisma.parkingZone.create({ data: { name: "Edit Zone", code: "P13E", capacity: 4 } });
    await prisma.camera.create({ data: { zoneId: zone.id, name: "E Entry", identifier: "p13e-entry", gateType: "ENTRY", status: "ONLINE" } });
    await prisma.camera.create({ data: { zoneId: zone.id, name: "E Exit", identifier: "p13e-exit", gateType: "EXIT", status: "ONLINE" } });
    const user = await prisma.user.create({ data: { name: "Sim", email: "sim@test.local", passwordHash: "x", role: "USER" } });
    const car = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "SIM-1", normalizedPlate: "SIM1", vehicleType: "CAR" } });

    const mobile = spy("mobile-user", "USER");
    hub.subscribe(mobile.client);

    // Capacity is the authoritative availability metric; changing it must be
    // visible without an occupancy event.
    await asAdmin(request(app).patch(`/admin/zones/${zone.id}`)).send({ capacity: 6 }).expect(200);
    expect(framesOf(mobile.frames, "ZONE_OCCUPANCY_UPDATED").at(-1)!.payload).toMatchObject({ zoneId: zone.id, capacity: 6, availableCount: 6 });

    const run = await asAdmin(request(app).post("/simulator/run")).send({ scenario: "SINGLE_ENTRY", zoneId: zone.id, vehicleIds: [car.id] }).expect(201);
    expect(run.body.data.occupancy).toEqual({ occupiedCount: 1, availableCount: 5 });
    expect(framesOf(mobile.frames, "ZONE_OCCUPANCY_UPDATED").at(-1)!.payload).toMatchObject({ zoneId: zone.id, occupiedCount: 1, availableCount: 5 });
    // The public zone list the mobile app refetches on that event agrees.
    const zones = await request(app).get("/zones").expect(200);
    expect(zones.body.data[0]).toMatchObject({ id: zone.id, capacity: 6, occupiedCount: 1, availableCount: 5 });
  });

  it("camera configuration failures: disabled, unknown, wrong-zone, wrong-direction cameras never change occupancy", async () => {
    const app = createApp({ auth, cameraApiKey: CAMERA_API_KEY });
    const admin = await seedAdmin("cam-admin@test.local");
    const asAdmin = (req: request.Test) => req.set("Authorization", `Bearer ${auth.tokens.sign({ id: admin.id, role: "ADMIN" }).token}`);
    const zone = await prisma.parkingZone.create({ data: { name: "Cam Zone", code: "P13C", capacity: 5 } });
    const otherZone = await prisma.parkingZone.create({ data: { name: "Cam Zone 2", code: "P13C2", capacity: 5 } });
    const user = await prisma.user.create({ data: { name: "Cam", email: "cam@test.local", passwordHash: "x", role: "USER" } });
    await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "CAM-1", normalizedPlate: "CAM1", vehicleType: "CAR" } });

    // Admin provisions a camera in its default OFFLINE (disabled) state.
    const camera = await asAdmin(request(app).post("/admin/cameras")).send({ identifier: "p13c-gate", zoneId: zone.id, gateType: "ENTRY" }).expect(201);
    expect(camera.body.data.status).toBe("OFFLINE");
    const send = (body: Record<string, unknown>, zoneIdForPath = zone.id) =>
      request(app).post(`/zones/${zoneIdForPath}/events`).set("X-API-Key", CAMERA_API_KEY).send({ cameraIdentifier: "p13c-gate", eventType: "ENTRY", detectedPlate: "CAM-1", ...body });

    const disabled = await send({ sourceEventId: "c-1" }).expect(409);
    expect(disabled.body.error.message).toMatch(/offline/i);
    const unknown = await send({ sourceEventId: "c-2", cameraIdentifier: "does-not-exist" }).expect(404);
    expect(unknown.body.error.code).toBe("NOT_FOUND");
    await send({ sourceEventId: "c-3" }, otherZone.id).expect(409);
    await send({ sourceEventId: "c-4", eventType: "EXIT" }).expect(409);
    await send({ sourceEventId: "c-5" }, "no-such-zone").expect(404);
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } })).occupiedCount).toBe(0);
    expect(await prisma.occupancyEvent.count()).toBe(0);

    // Enabling the camera from the admin console takes effect on the next event.
    await asAdmin(request(app).patch(`/admin/cameras/${camera.body.data.id}`)).send({ status: "ONLINE" }).expect(200);
    await send({ sourceEventId: "c-6" }).expect(201);
    // Idempotency: the same observation is absorbed, not double-counted.
    await send({ sourceEventId: "c-6" }).expect(409);
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } })).occupiedCount).toBe(1);

    // The admin camera view shows the accepted event against that camera.
    const cameras = await asAdmin(request(app).get("/admin/cameras")).expect(200);
    expect(cameras.body.data[0]).toMatchObject({ identifier: "p13c-gate", status: "ONLINE", recentEvents: [expect.objectContaining({ detectedPlate: "CAM-1" })] });
  });

  it("OCR failures (no plate, low confidence) never open a registered session and never invent occupancy", async () => {
    const app = createApp({ auth, cameraApiKey: CAMERA_API_KEY, ocrPlateConfidenceThreshold: 0.6 });
    const zone = await prisma.parkingZone.create({ data: { name: "OCR Zone", code: "P13O", capacity: 5 } });
    await prisma.camera.create({ data: { zoneId: zone.id, name: "O Entry", identifier: "p13o-entry", gateType: "ENTRY", status: "ONLINE" } });
    const user = await prisma.user.create({ data: { name: "OCR", email: "ocr@test.local", passwordHash: "x", role: "USER" } });
    const car = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "OCR-1", normalizedPlate: "OCR1", vehicleType: "CAR" } });

    // Vision found no readable plate: the frame is a guest candidate. Under the
    // default (unconfigured) guest policy it is denied and occupancy holds.
    const unreadable = await request(app)
      .post(`/zones/${zone.id}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({ cameraIdentifier: "p13o-entry", sourceEventId: "ocr-none", eventType: "ENTRY", detectedPlate: null, ocrConfidence: null })
      .expect(201);
    expect(unreadable.body.data).toMatchObject({ admitted: false, plateMatched: false, newOccupied: 0 });

    // A registered plate read below the trust threshold is not an identity.
    const lowConfidence = await request(app)
      .post(`/zones/${zone.id}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({ cameraIdentifier: "p13o-entry", sourceEventId: "ocr-low", eventType: "ENTRY", detectedPlate: "OCR-1", ocrConfidence: 0.3 })
      .expect(201);
    expect(lowConfidence.body.data).toMatchObject({ admitted: false, plateMatched: false, vehicleId: null });
    expect(await prisma.parkingSession.count({ where: { vehicleId: car.id } })).toBe(0);
    expect(await prisma.occupancyAnomaly.count({ where: { anomalyType: "GUEST_DENIED" } })).toBe(2);

    // Malformed vision payloads are rejected before any domain work.
    await request(app)
      .post(`/zones/${zone.id}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({ cameraIdentifier: "p13o-entry", sourceEventId: "ocr-bad", eventType: "ENTRY", ocrConfidence: 1.7 })
      .expect(400);
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } })).occupiedCount).toBe(0);
  });

  it("auth failure cases: 401 for missing/revoked/camera-key, 403 for role, 429 keeps a session valid", async () => {
    const app = createApp({ auth, cameraApiKey: CAMERA_API_KEY, authRateLimit: { limit: 2, windowMs: 60_000 } });
    const zone = await prisma.parkingZone.create({ data: { name: "Auth Zone", code: "P13U", capacity: 5 } });
    await prisma.camera.create({ data: { zoneId: zone.id, name: "U Entry", identifier: "p13u-entry", gateType: "ENTRY", status: "ONLINE" } });
    const user = await prisma.user.create({
      data: { name: "Auth", email: "auth@test.local", passwordHash: await argon2.hash("DriverPass123!", { type: argon2.argon2id }), role: "USER" },
    });

    // Unauthenticated and role-restricted access.
    expect((await request(app).get("/sessions/active").expect(401)).body.error.code).toBe("UNAUTHORIZED");
    const { token } = auth.tokens.sign({ id: user.id, role: "USER" });
    expect((await request(app).get("/admin/dashboard").set("Authorization", `Bearer ${token}`).expect(403)).body.error.code).toBe("FORBIDDEN");
    await request(app).get("/realtime/stream").expect(401);

    // The camera boundary rejects a missing key and a user JWT alike.
    const noKey = await request(app).post(`/zones/${zone.id}/events`).send({ cameraIdentifier: "p13u-entry", sourceEventId: "u-1", eventType: "ENTRY" }).expect(401);
    expect(noKey.body.error.code).toBe("UNAUTHORIZED");
    await request(app)
      .post(`/zones/${zone.id}/events`)
      .set("Authorization", `Bearer ${token}`)
      .send({ cameraIdentifier: "p13u-entry", sourceEventId: "u-2", eventType: "ENTRY" })
      .expect(401);
    expect(await prisma.occupancyEvent.count()).toBe(0);

    // Throttled credentials never invalidate an already-issued session.
    await request(app).post("/auth/login").send({ email: "auth@test.local", password: "DriverPass123!" }).expect(200);
    await request(app).post("/auth/login").send({ email: "auth@test.local", password: "wrong" }).expect(401);
    const throttled = await request(app).post("/auth/login").send({ email: "auth@test.local", password: "DriverPass123!" }).expect(429);
    expect(throttled.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(Number(throttled.headers["retry-after"])).toBeGreaterThan(0);
    await request(app).get("/sessions/active").set("Authorization", `Bearer ${token}`).expect(200);

    // Logout revokes server-side; only that explicit 401 tells a client to drop credentials.
    await request(app).post("/auth/logout").set("Authorization", `Bearer ${token}`).expect(204);
    const revoked = await request(app).get("/sessions/active").set("Authorization", `Bearer ${token}`).expect(401);
    expect(revoked.body.error.code).toBe("UNAUTHORIZED");
  });

  it("an unexpected backend failure surfaces as a 500 INTERNAL envelope, publishes nothing, and leaves no partial state", async () => {
    class Broken extends OccupancyService {
      override async processEvent(): Promise<never> {
        throw new Error("simulated database outage");
      }
    }
    const hub = new RealtimeHub();
    const app = createApp({ auth, realtimeHub: hub, cameraApiKey: CAMERA_API_KEY, occupancy: new Broken() });
    const zone = await prisma.parkingZone.create({ data: { name: "Fail Zone", code: "P13F", capacity: 5 } });
    await prisma.camera.create({ data: { zoneId: zone.id, name: "F Entry", identifier: "p13f-entry", gateType: "ENTRY", status: "ONLINE" } });
    const admin = spy("ops", "ADMIN");
    hub.subscribe(admin.client);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app)
      .post(`/zones/${zone.id}/events`)
      .set("X-API-Key", CAMERA_API_KEY)
      .send({ cameraIdentifier: "p13f-entry", sourceEventId: "f-1", eventType: "ENTRY", detectedPlate: "ANY-1" })
      .expect(500);
    errorSpy.mockRestore();

    expect(res.body).toEqual({ error: { code: "INTERNAL", message: expect.any(String) } });
    expect(JSON.stringify(res.body)).not.toContain("simulated database outage");
    expect(admin.frames).toHaveLength(0);
    expect(await prisma.occupancyEvent.count()).toBe(0);
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: zone.id } })).occupiedCount).toBe(0);
  });
});
