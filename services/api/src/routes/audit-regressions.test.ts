import request from "supertest";
import { createApp } from "../app";
import { AuthService } from "../domain/auth";
import { ViolationService } from "../domain/violations";
import { ConfigService } from "../domain/config";
import { prisma } from "@parada/database";

/**
 * Regression coverage for the defects found in the full-system audit. Each
 * block fails against the pre-fix behaviour.
 */

const auth = new AuthService({
  secret: "test-secret-key-for-testing-only-32chars",
  issuer: "parada-api-test",
  expiresIn: "1d",
});

/**
 * Fixtures are suffixed per run so this suite never collides with rows left by
 * a previous run (zone name/code, camera identifier and user email are all
 * unique columns) and never has to wipe tables other suites are relying on.
 */
const RUN = Math.random().toString(36).slice(2, 8);

describe("camera event ingestion authenticates before it meters", () => {
  let zoneId: string;
  let cameraIdentifier: string;

  beforeAll(async () => {
    const zone = await prisma.parkingZone.create({
      data: { name: `Audit Rate Zone ${RUN}`, code: `ARL${RUN}`, capacity: 10 },
    });
    zoneId = zone.id;
    const camera = await prisma.camera.create({
      data: {
        zoneId,
        name: "Audit Gate",
        identifier: `AUDIT-CAM-RATE-${RUN}`,
        gateType: "BIDIRECTIONAL",
        status: "ONLINE",
      },
    });
    cameraIdentifier = camera.identifier;
  });

  it("does not let unauthenticated callers burn a named camera's rate budget", async () => {
    // The limiter previously ran BEFORE the API-key check, so anyone who knew
    // (or guessed) a camera identifier could exhaust that camera's per-minute
    // allowance without ever presenting a key — locking the real camera out of
    // reporting occupancy.
    const app = createApp({
      auth,
      cameraApiKey: "audit-camera-key",
      cameraEventRateLimit: { limit: 2, windowMs: 60_000 },
    });

    for (let i = 0; i < 5; i += 1) {
      const rejected = await request(app)
        .post(`/zones/${zoneId}/events`)
        .send({ cameraIdentifier, sourceEventId: `audit-unauth-${RUN}-${i}`, eventType: "ENTRY" });
      // Always 401 — never 429, which would mean the budget was consumed.
      expect(rejected.status).toBe(401);
    }

    // The real camera still has its full budget.
    const accepted = await request(app)
      .post(`/zones/${zoneId}/events`)
      .set("X-API-Key", "audit-camera-key")
      .send({ cameraIdentifier, sourceEventId: `audit-authed-${RUN}`, eventType: "ENTRY" });
    expect(accepted.status).toBe(201);
  });
});

describe("an appeal is decided exactly once", () => {
  it("rejects a second review instead of silently flipping the settled violation", async () => {
    const violations = new ViolationService(new ConfigService());
    const user = await prisma.user.create({
      data: { name: "Audit Driver", email: `audit-appeal-${RUN}@test.local`, passwordHash: "x", role: "USER" },
    });
    const reviewer = await prisma.user.create({
      data: { name: "Audit Admin", email: `audit-reviewer-${RUN}@test.local`, passwordHash: "x", role: "ADMIN" },
    });
    const secondReviewer = await prisma.user.create({
      data: { name: "Audit Admin 2", email: `audit-reviewer-2-${RUN}@test.local`, passwordHash: "x", role: "ADMIN" },
    });
    const zone = await prisma.parkingZone.create({
      data: { name: `Audit Appeal Zone ${RUN}`, code: `AAP${RUN}`, capacity: 5 },
    });
    const violation = await prisma.violation.create({
      data: {
        userId: user.id,
        zoneId: zone.id,
        violationType: "OVERSTAY",
        fineAmount: 150,
        status: "APPEALED",
      },
    });
    const appeal = await prisma.violationAppeal.create({
      data: { violationId: violation.id, userId: user.id, reason: "Traffic.", status: "PENDING" },
    });

    const first = await violations.review(appeal.id, "APPROVED", reviewer.id);
    expect(first.appeal.status).toBe("APPROVED");

    // Second review of the same appeal must be refused.
    await expect(violations.review(appeal.id, "REJECTED", secondReviewer.id)).rejects.toMatchObject({
      status: 409,
    });

    // The original decision, reviewer and violation outcome all stand.
    const settledAppeal = await prisma.violationAppeal.findUniqueOrThrow({ where: { id: appeal.id } });
    expect(settledAppeal.status).toBe("APPROVED");
    expect(settledAppeal.reviewedBy).toBe(reviewer.id);

    const settledViolation = await prisma.violation.findUniqueOrThrow({ where: { id: violation.id } });
    expect(settledViolation.status).toBe("DISMISSED");

    // The driver was told the outcome once, not twice with contradicting text.
    const outcomeNotifications = await prisma.notification.count({
      where: { userId: user.id, type: "VIOLATION_APPEAL_RESULT" },
    });
    expect(outcomeNotifications).toBe(1);
  });
});

describe("exiting an already-exited session is a conflict, not a server error", () => {
  it("returns 409 and leaves zone occupancy untouched by the second exit", async () => {
    const app = createApp({ auth });

    const user = await prisma.user.create({
      data: { name: "Audit Exit", email: `audit-exit-${RUN}@test.local`, passwordHash: "x", role: "USER" },
    });
    const zone = await prisma.parkingZone.create({
      data: { name: `Audit Exit Zone ${RUN}`, code: `AEX${RUN}`, capacity: 5 },
    });
    const vehicle = await prisma.vehicle.create({
      data: { userId: user.id, plateNumber: `AEX-${RUN}`, normalizedPlate: `AEX${RUN.toUpperCase()}`, vehicleType: "CAR" },
    });
    const { token } = auth.tokens.sign({ id: user.id, role: "USER" });

    const entry = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${token}`)
      .send({ vehicleId: vehicle.id, zoneId: zone.id });
    expect(entry.status).toBe(201);
    const sessionId = entry.body.data.session.id as string;

    const firstExit = await request(app)
      .post(`/sessions/${sessionId}/exit`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(firstExit.status).toBe(200);

    const occupancyAfterFirstExit = await prisma.parkingZone.findUniqueOrThrow({
      where: { id: zone.id },
      select: { occupiedCount: true },
    });

    const secondExit = await request(app)
      .post(`/sessions/${sessionId}/exit`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(secondExit.status).toBe(409);

    const occupancyAfterSecondExit = await prisma.parkingZone.findUniqueOrThrow({
      where: { id: zone.id },
      select: { occupiedCount: true },
    });
    expect(occupancyAfterSecondExit.occupiedCount).toBe(occupancyAfterFirstExit.occupiedCount);

    // Exactly one fee was charged for the session.
    const fees = await prisma.parkingFee.count({ where: { sessionId } });
    expect(fees).toBe(1);
  });
});

/**
 * Phase 15 remediation. Camera identifier immutability was enforced only by an
 * allow-list in the domain layer and a disabled input in the admin UI, with no
 * test pinning it. Widening the update DTO or switching to a spread would have
 * regressed it silently — and deployed vision hosts POST that exact string, so
 * a rename stops ingestion until every host is reconfigured.
 */
describe("a camera identifier cannot be changed after registration", () => {
  it("rejects a PATCH carrying an identifier and keeps the registered one", async () => {
    const app = createApp({ auth });
    const admin = await prisma.user.create({
      data: { name: "Cam Admin", email: `cam-admin-${RUN}@test.local`, passwordHash: "x", role: "ADMIN" },
    });
    const zone = await prisma.parkingZone.create({
      data: { name: `Cam Zone ${RUN}`, code: `CMZ${RUN}`, capacity: 5 },
    });
    const original = `CAM-IMMUTABLE-${RUN}`;
    const camera = await prisma.camera.create({
      data: { zoneId: zone.id, name: "Gate", identifier: original, gateType: "ENTRY", status: "ONLINE" },
    });
    const { token } = auth["tokens"].sign({ id: admin.id, role: "ADMIN" });

    const res = await request(app)
      .patch(`/admin/cameras/${camera.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renamed Gate", identifier: `CAM-HIJACK-${RUN}` })
      .expect(400);

    // Refused explicitly — a silently dropped field would leave an operator
    // believing the rename took. Nothing in the request applied, not even the
    // otherwise-editable name.
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.message).toContain("identifier");
    const persisted = await prisma.camera.findUniqueOrThrow({ where: { id: camera.id } });
    expect(persisted.identifier).toBe(original);
    expect(persisted.name).toBe("Gate");

    // Editing without touching the identifier still works.
    const ok = await request(app)
      .patch(`/admin/cameras/${camera.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Renamed Gate" })
      .expect(200);
    expect(ok.body.data.name).toBe("Renamed Gate");
    expect(ok.body.data.identifier).toBe(original);
  });
});
