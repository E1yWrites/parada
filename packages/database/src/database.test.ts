import { prisma } from "./client";

const TABLES = [
  "occupancy_history",
  "parking_sessions",
  "occupancy_events",
  "notifications",
  "parking_slots",
  "cameras",
  "users",
  "parking_zones",
];

async function cleanDatabase() {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }
}

describe("PARADA database integrity", () => {
  let zone: { id: string; capacity: number };
  let camera: { id: string };

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

  describe("anonymous parking session lifecycle (data integrity)", () => {
    it("creates an ACTIVE session on entry event", async () => {
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
          entryEventId: entry.id,
          enteredAt: new Date(),
          status: "ACTIVE",
        },
      });
      expect(session.status).toBe("ACTIVE");
      expect(session.exitEventId).toBeNull();
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
});
