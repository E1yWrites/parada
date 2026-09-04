import { prisma } from "./client";

const TABLES = [
  "guest_sessions",
  "violation_appeals",
  "violations",
  "parking_fees",
  "reservations",
  "zone_assignments",
  "occupancy_history",
  "notifications",
  "parking_sessions",
  "occupancy_anomalies",
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

describe("PARADA database integrity", () => {
  let zone: { id: string; capacity: number };
  let camera: { id: string };
  let user: { id: string };
  let vehCar: { id: string; normalizedPlate: string };
  let vehBike: { id: string; normalizedPlate: string };

  beforeAll(cleanDatabase);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const created = await prisma.parkingZone.create({
      data: { name: "Test Zone", code: "TZ", capacity: 5, occupiedCount: 0 },
    });
    zone = { id: created.id, capacity: created.capacity };
    camera = await prisma.camera.create({
      data: {
        zoneId: zone.id,
        name: "Test Camera",
        identifier: "cam-test",
        gateType: "ENTRY",
        status: "ONLINE",
      },
    });
    const u = await prisma.user.create({
      data: { name: "Driver", email: "driver@test.local", passwordHash: "x", role: "USER" },
    });
    user = { id: u.id };
    const vc = await prisma.vehicle.create({
      data: {
        userId: user.id,
        plateNumber: "ABC-1234",
        normalizedPlate: "ABC1234",
        vehicleType: "CAR",
        status: "ACTIVE",
      },
    });
    const vb = await prisma.vehicle.create({
      data: {
        userId: user.id,
        plateNumber: "XYZ-5678",
        normalizedPlate: "XYZ5678",
        vehicleType: "MOTORCYCLE",
        status: "ACTIVE",
      },
    });
    vehCar = { id: vc.id, normalizedPlate: vc.normalizedPlate };
    vehBike = { id: vb.id, normalizedPlate: vb.normalizedPlate };
  });

  describe("occupancy bounds (DB CHECK constraint)", () => {
    it("accepts a valid occupied count within capacity", async () => {
      const updated = await prisma.parkingZone.update({
        where: { id: zone.id },
        data: { occupiedCount: 3 },
      });
      expect(updated.occupiedCount).toBe(3);
    });

    it("rejects occupied count above capacity", async () => {
      await expect(
        prisma.parkingZone.update({
          where: { id: zone.id },
          data: { occupiedCount: 6 },
        })
      ).rejects.toThrow();
    });

    it("rejects negative occupied count", async () => {
      await expect(
        prisma.parkingZone.update({
          where: { id: zone.id },
          data: { occupiedCount: -1 },
        })
      ).rejects.toThrow();
    });
  });

  describe("idempotency (unique camera+sourceEventId)", () => {
    it("rejects a duplicate camera event with the same sourceEventId", async () => {
      const data = {
        zoneId: zone.id,
        cameraId: camera.id,
        eventType: "ENTRY" as const,
        previousOccupied: 0,
        newOccupied: 1,
        availableCount: 4,
        source: "CAMERA" as const,
        sourceEventId: "evt-123",
        detectedAt: new Date(),
      };
      const first = await prisma.occupancyEvent.create({ data });
      expect(first.id).toBeDefined();
      await expect(prisma.occupancyEvent.create({ data })).rejects.toThrow();
    });

    it("allows different camera events with distinct sourceEventIds", async () => {
      const base = {
        zoneId: zone.id,
        cameraId: camera.id,
        eventType: "ENTRY" as const,
        previousOccupied: 0,
        newOccupied: 1,
        availableCount: 4,
        source: "CAMERA" as const,
        detectedAt: new Date(),
      };
      const a = await prisma.occupancyEvent.create({
        data: { ...base, sourceEventId: "evt-a" },
      });
      const b = await prisma.occupancyEvent.create({
        data: { ...base, sourceEventId: "evt-b" },
      });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("unique constraints", () => {
    it("rejects duplicate user emails", async () => {
      await prisma.user.create({
        data: { name: "U1", email: "dup@parada.local", passwordHash: "x", role: "USER" },
      });
      await expect(
        prisma.user.create({
          data: { name: "U2", email: "dup@parada.local", passwordHash: "x", role: "USER" },
        })
      ).rejects.toThrow();
    });

    it("rejects duplicate zone codes", async () => {
      await expect(
        prisma.parkingZone.create({
          data: { name: "Other", code: "TZ", capacity: 5 },
        })
      ).rejects.toThrow();
    });
  });

  describe("deletion strategy (RESTRICT preserves history)", () => {
    it("cannot delete a zone that has occupancy history", async () => {
      await prisma.occupancyHistory.create({
        data: { zoneId: zone.id, occupiedCount: 1, availableCount: 4 },
      });
      await expect(
        prisma.parkingZone.delete({ where: { id: zone.id } })
      ).rejects.toThrow();
      const stillThere = await prisma.parkingZone.findUnique({ where: { id: zone.id } });
      expect(stillThere).not.toBeNull();
    });
  });

  describe("vehicle uniqueness (normalized plate is unique per user)", () => {
    it("allows the same plate for different users", async () => {
      const u1 = await prisma.user.create({
        data: { name: "U1", email: "v1@parada.local", passwordHash: "x", role: "USER" },
      });
      const u2 = await prisma.user.create({
        data: { name: "U2", email: "v2@parada.local", passwordHash: "x", role: "USER" },
      });
      await prisma.vehicle.create({
        data: {
          userId: u1.id,
          plateNumber: "ABC 123",
          normalizedPlate: "ABC123",
          vehicleType: "CAR",
        },
      });
      const dup = await prisma.vehicle.create({
        data: {
          userId: u2.id,
          plateNumber: "ABC 123",
          normalizedPlate: "ABC123",
          vehicleType: "CAR",
        },
      });
      expect(dup.id).toBeDefined();
    });

    it("rejects a second vehicle with the same normalized plate for the same user", async () => {
      const u1 = await prisma.user.create({
        data: { name: "U1", email: "v3@parada.local", passwordHash: "x", role: "USER" },
      });
      await prisma.vehicle.create({
        data: {
          userId: u1.id,
          plateNumber: "ABC 123",
          normalizedPlate: "ABC123",
          vehicleType: "CAR",
        },
      });
      await expect(
        prisma.vehicle.create({
          data: {
            userId: u1.id,
            plateNumber: "ABC-123",
            normalizedPlate: "ABC123",
            vehicleType: "CAR",
          },
        })
      ).rejects.toThrow();
    });

    it("allows a user to register multiple distinct vehicles", async () => {
      const u1 = await prisma.user.create({
        data: { name: "U1", email: "v4@parada.local", passwordHash: "x", role: "USER" },
      });
      await prisma.vehicle.create({
        data: { userId: u1.id, plateNumber: "AAA111", normalizedPlate: "AAA111", vehicleType: "CAR" },
      });
      await prisma.vehicle.create({
        data: { userId: u1.id, plateNumber: "BBB222", normalizedPlate: "BBB222", vehicleType: "MOTORCYCLE" },
      });
      const count = await prisma.vehicle.count({ where: { userId: u1.id } });
      expect(count).toBe(2);
    });
  });

  describe("parking session lifecycle (vehicle-identified)", () => {
    let user: { id: string };
    let vehicle: { id: string };

    beforeEach(async () => {
      user = await prisma.user.create({
        data: { name: "Driver", email: "driver@parada.local", passwordHash: "x", role: "USER" },
      });
      vehicle = await prisma.vehicle.create({
        data: {
          userId: user.id,
          plateNumber: "ABC-1234",
          normalizedPlate: "ABC1234",
          vehicleType: "CAR",
        },
      });
    });

    it("creates an ACTIVE session on vehicle entry", async () => {
      const entry = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          vehicleId: vehicle.id,
          detectedPlate: "ABC-1234",
          normalizedPlate: "ABC1234",
          ocrConfidence: 0.95,
          plateMatched: true,
          detectedAt: new Date(),
        },
      });
      const session = await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehicle.id,
          entryEventId: entry.id,
          enteredAt: new Date(),
          status: "ACTIVE",
        },
      });
      expect(session.status).toBe("ACTIVE");
      expect(session.exitEventId).toBeNull();
      expect(session.vehicleId).toBe(vehicle.id);
    });

    it("completes the correct session on vehicle exit", async () => {
      const entry = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          vehicleId: vehicle.id,
          detectedAt: new Date(),
        },
      });
      const session = await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehicle.id,
          entryEventId: entry.id,
          enteredAt: new Date(Date.now() - 60000),
          status: "ACTIVE",
        },
      });
      const exit = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "EXIT",
          previousOccupied: 1,
          newOccupied: 0,
          availableCount: 5,
          vehicleId: vehicle.id,
          detectedAt: new Date(),
        },
      });
      const finished = await prisma.parkingSession.update({
        where: { id: session.id },
        data: {
          exitEventId: exit.id,
          exitedAt: new Date(),
          durationSeconds: 60,
          status: "COMPLETED",
        },
      });
      expect(finished.status).toBe("COMPLETED");
      expect(finished.exitEventId).toBe(exit.id);
      expect(finished.durationSeconds).toBe(60);
    });
  });

  describe("one ACTIVE session per vehicle (DB partial unique index)", () => {
    it("prevents two ACTIVE sessions for the same vehicle", async () => {
      const user = await prisma.user.create({
        data: { name: "Driver", email: "one@parada.local", passwordHash: "x", role: "USER" },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          userId: user.id,
          plateNumber: "ONLY1",
          normalizedPlate: "ONLY1",
          vehicleType: "CAR",
        },
      });
      const e1 = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          vehicleId: vehicle.id,
          detectedAt: new Date(),
        },
      });
      await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehicle.id,
          entryEventId: e1.id,
          enteredAt: new Date(),
          status: "ACTIVE",
        },
      });
      const e2 = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 1,
          newOccupied: 2,
          availableCount: 3,
          vehicleId: vehicle.id,
          detectedAt: new Date(),
        },
      });
      await expect(
        prisma.parkingSession.create({
          data: {
            zoneId: zone.id,
            userId: user.id,
            vehicleId: vehicle.id,
            entryEventId: e2.id,
            enteredAt: new Date(),
            status: "ACTIVE",
          },
        })
      ).rejects.toThrow();
    });

    it("allows a new ACTIVE session after the previous one completes", async () => {
      const user = await prisma.user.create({
        data: { name: "Driver", email: "two@parada.local", passwordHash: "x", role: "USER" },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          userId: user.id,
          plateNumber: "ONLY2",
          normalizedPlate: "ONLY2",
          vehicleType: "CAR",
        },
      });
      const e1 = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          vehicleId: vehicle.id,
          detectedAt: new Date(),
        },
      });
      const s1 = await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehicle.id,
          entryEventId: e1.id,
          enteredAt: new Date(),
          status: "ACTIVE",
        },
      });
      const ex = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "EXIT",
          previousOccupied: 1,
          newOccupied: 0,
          availableCount: 5,
          vehicleId: vehicle.id,
          detectedAt: new Date(),
        },
      });
      await prisma.parkingSession.update({
        where: { id: s1.id },
        data: { exitEventId: ex.id, exitedAt: new Date(), durationSeconds: 10, status: "COMPLETED" },
      });
      const e2 = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          vehicleId: vehicle.id,
          detectedAt: new Date(),
        },
      });
      const s2 = await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehicle.id,
          entryEventId: e2.id,
          enteredAt: new Date(),
          status: "ACTIVE",
        },
      });
      expect(s2.status).toBe("ACTIVE");
    });
  });

  describe("unknown vehicle (occupancy recorded, no session)", () => {
    it("records occupancy without requiring a registered vehicle", async () => {
      const event = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          detectedPlate: "ZZZ-9999",
          normalizedPlate: "ZZZ9999",
          ocrConfidence: 0.8,
          plateMatched: false,
          detectedAt: new Date(),
        },
      });
      expect(event.vehicleId).toBeNull();
      expect(event.plateMatched).toBe(false);
      const sessions = await prisma.parkingSession.count();
      expect(sessions).toBe(0);
    });
  });

  describe("notification creation", () => {
    it("creates a minimal zone-full notification", async () => {
      const notif = await prisma.notification.create({
        data: {
          zoneId: zone.id,
          type: "ZONE_FULL",
          message: "Zone TZ is full.",
          targetRole: "ADMIN",
        },
      });
      expect(notif.read).toBe(false);
      expect(notif.targetRole).toBe("ADMIN");
    });
  });

  describe("notification user targeting", () => {
    it("creates a notification with a specific user", async () => {
      const notif = await prisma.notification.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          type: "VIOLATION_ISSUED",
          message: "Violation issued.",
          targetRole: "USER",
        },
      });
      expect(notif.userId).toBe(user.id);
    });

    it("creates a role-based notification without a user", async () => {
      const notif = await prisma.notification.create({
        data: {
          zoneId: zone.id,
          type: "ZONE_FULL",
          message: "Zone full.",
          targetRole: "ADMIN",
        },
      });
      expect(notif.userId).toBeNull();
    });

    it("nullifies userId when the referenced user is deleted", async () => {
      const target = await prisma.user.create({
        data: { name: "Target", email: "target@parada.local", passwordHash: "x", role: "USER" },
      });
      const notif = await prisma.notification.create({
        data: {
          zoneId: zone.id,
          userId: target.id,
          type: "VIOLATION_APPEAL_RESULT",
          message: "Appeal result.",
          targetRole: "USER",
        },
      });
      await prisma.user.delete({ where: { id: target.id } });
      const updated = await prisma.notification.findUnique({ where: { id: notif.id } });
      expect(updated?.userId).toBeNull();
    });
  });

  describe("establishment config (singleton row)", () => {
    it("stores the singleton establishment config", async () => {
      const cfg = await prisma.establishmentConfig.upsert({
        where: { id: "singleton" },
        update: {},
        create: {
          id: "singleton",
          parkingFee: { baseFee: 20, baseDurationHours: 2, additionalFeePerHour: 10 },
          violations: [],
          guestPolicy: {
            policy: "PRIMARY_ZONE",
            primaryZoneId: null,
            maxDurationHours: 8,
            allowWhenFull: false,
          },
          zoneDefaults: { maxReservationDurationMinutes: 15, occupancyLowThreshold: 0.2 },
        },
      });
      expect(cfg.id).toBe("singleton");
      expect(cfg.parkingFee).toMatchObject({ baseFee: 20 });
      expect(cfg.guestPolicy).toMatchObject({ policy: "PRIMARY_ZONE" });
    });

    it("can be re-seeded idempotently (same singleton id)", async () => {
      const first = await prisma.establishmentConfig.upsert({
        where: { id: "singleton" },
        update: {},
        create: { id: "singleton", parkingFee: {}, violations: [], guestPolicy: {}, zoneDefaults: {} },
      });
      const second = await prisma.establishmentConfig.upsert({
        where: { id: "singleton" },
        update: { parkingFee: { baseFee: 20 } },
        create: { id: "singleton", parkingFee: {}, violations: [], guestPolicy: {}, zoneDefaults: {} },
      });
      expect(first.id).toBe("singleton");
      expect(second.id).toBe("singleton");
      expect(second.parkingFee).toMatchObject({ baseFee: 20 });
      const count = await prisma.establishmentConfig.count();
      expect(count).toBe(1);
    });
  });

  describe("reservation", () => {
    it("creates a reservation linked to user, vehicle, and zone", async () => {
      const res = await prisma.reservation.create({
        data: {
          userId: user.id,
          vehicleId: vehCar.id,
          zoneId: zone.id,
          startAt: new Date(Date.now() + 60000),
          endAt: new Date(Date.now() + 3600000),
          status: "CONFIRMED",
        },
      });
      expect(res.status).toBe("CONFIRMED");
      expect(res.userId).toBe(user.id);
      expect(res.vehicleId).toBe(vehCar.id);
      expect(res.zoneId).toBe(zone.id);
    });

    it("rejects a reservation for a non-existent user", async () => {
      await expect(
        prisma.reservation.create({
          data: {
            userId: "missing-user",
            vehicleId: vehCar.id,
            zoneId: zone.id,
            startAt: new Date(),
            endAt: new Date(Date.now() + 60000),
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("zone assignment", () => {
    it("creates an active assignment with expiry", async () => {
      const assign = await prisma.zoneAssignment.create({
        data: {
          userId: user.id,
          vehicleId: vehCar.id,
          zoneId: zone.id,
          status: "ACTIVE",
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      expect(assign.status).toBe("ACTIVE");
      expect(assign.expiresAt).not.toBeNull();
    });

    it("records a revoked assignment", async () => {
      const assign = await prisma.zoneAssignment.create({
        data: {
          userId: user.id,
          vehicleId: vehCar.id,
          zoneId: zone.id,
          status: "REVOKED",
        },
      });
      expect(assign.status).toBe("REVOKED");
    });
  });

  describe("violation", () => {
    it("creates a violation linked to user, vehicle, and zone", async () => {
      const viol = await prisma.violation.create({
        data: {
          userId: user.id,
          vehicleId: vehCar.id,
          zoneId: zone.id,
          violationType: "WRONG_ZONE",
          fineAmount: 500,
          status: "PENDING",
        },
      });
      expect(viol.violationType).toBe("WRONG_ZONE");
      expect(viol.fineAmount).toBe(500);
      expect(viol.status).toBe("PENDING");
    });

    it("creates a violation without an optional vehicle", async () => {
      const viol = await prisma.violation.create({
        data: {
          userId: user.id,
          zoneId: zone.id,
          violationType: "OVERSTAY",
          fineAmount: 500,
        },
      });
      expect(viol.vehicleId).toBeNull();
    });

    it("rejects a violation with a missing zone", async () => {
      await expect(
        prisma.violation.create({
          data: {
            userId: user.id,
            zoneId: "missing-zone",
            violationType: "UNAUTHORIZED",
            fineAmount: 100,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("violation appeal (one per violation, cascade on delete)", () => {
    it("creates an appeal against a violation", async () => {
      const viol = await prisma.violation.create({
        data: {
          userId: user.id,
          vehicleId: vehCar.id,
          zoneId: zone.id,
          violationType: "WRONG_ZONE",
          fineAmount: 500,
        },
      });
      const appeal = await prisma.violationAppeal.create({
        data: {
          violationId: viol.id,
          userId: user.id,
          reason: "I was in the correct zone.",
        },
      });
      expect(appeal.status).toBe("PENDING");
      expect(appeal.violationId).toBe(viol.id);
    });

    it("prevents a second appeal for the same violation", async () => {
      const viol = await prisma.violation.create({
        data: {
          userId: user.id,
          vehicleId: vehCar.id,
          zoneId: zone.id,
          violationType: "OVERSTAY",
          fineAmount: 500,
        },
      });
      await prisma.violationAppeal.create({
        data: { violationId: viol.id, userId: user.id, reason: "First appeal." },
      });
      await expect(
        prisma.violationAppeal.create({
          data: { violationId: viol.id, userId: user.id, reason: "Second appeal." },
        })
      ).rejects.toThrow();
    });

    it("cascades delete of a violation to its appeal", async () => {
      const viol = await prisma.violation.create({
        data: {
          userId: user.id,
          zoneId: zone.id,
          violationType: "GATE_TAMPERING",
          fineAmount: 1000,
        },
      });
      const appeal = await prisma.violationAppeal.create({
        data: { violationId: viol.id, userId: user.id, reason: "Appeal." },
      });
      await prisma.violation.delete({ where: { id: viol.id } });
      const gone = await prisma.violationAppeal.findUnique({ where: { id: appeal.id } });
      expect(gone).toBeNull();
    });
  });

  describe("parking fee (one per session)", () => {
    it("links exactly one fee to a completed session", async () => {
      const entry = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          detectedAt: new Date(),
        },
      });
      const session = await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehCar.id,
          entryEventId: entry.id,
          enteredAt: new Date(Date.now() - 3600000),
          durationSeconds: 3600,
          feeAmount: 20,
          status: "COMPLETED",
        },
      });
      const fee = await prisma.parkingFee.create({
        data: {
          sessionId: session.id,
          zoneId: zone.id,
          userId: user.id,
          amount: 20,
          rateBreakdown: { baseFee: 20, hours: 1 },
          status: "PENDING",
        },
      });
      expect(fee.sessionId).toBe(session.id);
      expect(fee.amount).toBe(20);
      expect(fee.rateBreakdown).toMatchObject({ baseFee: 20 });
    });

    it("prevents two fees for the same session", async () => {
      const entry = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          detectedAt: new Date(),
        },
      });
      const session = await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehCar.id,
          entryEventId: entry.id,
          enteredAt: new Date(),
          status: "COMPLETED",
        },
      });
      await prisma.parkingFee.create({
        data: {
          sessionId: session.id,
          zoneId: zone.id,
          userId: user.id,
          amount: 20,
          rateBreakdown: {},
        },
      });
      await expect(
        prisma.parkingFee.create({
          data: {
            sessionId: session.id,
            zoneId: zone.id,
            userId: user.id,
            amount: 30,
            rateBreakdown: {},
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("guest session (wraps a parking session)", () => {
    it("links a guest session to a parking session", async () => {
      const entry = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          detectedPlate: "ZZZ-0001",
          detectedAt: new Date(),
        },
      });
      const session = await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehCar.id,
          entryEventId: entry.id,
          enteredAt: new Date(),
          status: "ACTIVE",
        },
      });
      const guest = await prisma.guestSession.create({
        data: { parkingSessionId: session.id, detectedPlate: "ZZZ-0001" },
      });
      expect(guest.parkingSessionId).toBe(session.id);
      expect(guest.detectedPlate).toBe("ZZZ-0001");
    });

    it("optionally links a guest session to a reservation", async () => {
      const res = await prisma.reservation.create({
        data: {
          userId: user.id,
          vehicleId: vehCar.id,
          zoneId: zone.id,
          startAt: new Date(),
          endAt: new Date(Date.now() + 3600000),
          status: "CONFIRMED",
        },
      });
      const entry = await prisma.occupancyEvent.create({
        data: {
          zoneId: zone.id,
          cameraId: camera.id,
          eventType: "ENTRY",
          previousOccupied: 0,
          newOccupied: 1,
          availableCount: 4,
          detectedAt: new Date(),
        },
      });
      const session = await prisma.parkingSession.create({
        data: {
          zoneId: zone.id,
          userId: user.id,
          vehicleId: vehCar.id,
          entryEventId: entry.id,
          enteredAt: new Date(),
        },
      });
      const guest = await prisma.guestSession.create({
        data: { parkingSessionId: session.id, linkedReservationId: res.id },
      });
      expect(guest.linkedReservationId).toBe(res.id);
    });
  });
});
