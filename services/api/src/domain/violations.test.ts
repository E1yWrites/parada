import { ViolationService } from "./violations";
import { ConfigService } from "./config";
import { prisma } from "@parada/database";

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

describe("ViolationService.appeal / .review surface the created Notification", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("appeal() returns both the appeal and the ADMIN notification it creates", async () => {
    const violations = new ViolationService(new ConfigService());
    const user = await prisma.user.create({ data: { name: "P", email: "p1@x.com", passwordHash: "x", role: "USER" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT7", code: "RT7", capacity: 5 } });
    const violation = await prisma.violation.create({
      data: { userId: user.id, zoneId: zone.id, violationType: "OVERSTAY", fineAmount: 100, status: "PENDING" },
    });

    const result = await violations.appeal(user.id, violation.id, "I was not overstaying.");

    expect(result.appeal.violationId).toBe(violation.id);
    expect(result.notification.targetRole).toBe("ADMIN");
    expect(result.notification.type).toBe("VIOLATION_APPEAL_SUBMITTED");
  });

  it("review() returns both the reviewed appeal and the USER notification of the outcome", async () => {
    const violations = new ViolationService(new ConfigService());
    const user = await prisma.user.create({ data: { name: "P2", email: "p2@x.com", passwordHash: "x", role: "USER" } });
    const admin = await prisma.user.create({ data: { name: "A2", email: "a2@x.com", passwordHash: "x", role: "ADMIN" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT8", code: "RT8", capacity: 5 } });
    const violation = await prisma.violation.create({
      data: { userId: user.id, zoneId: zone.id, violationType: "OVERSTAY", fineAmount: 100, status: "APPEALED" },
    });
    const appeal = await prisma.violationAppeal.create({ data: { violationId: violation.id, userId: user.id, reason: "x", status: "PENDING" } });

    const result = await violations.review(appeal.id, "APPROVED", admin.id);

    expect(result.appeal.status).toBe("APPROVED");
    expect(result.notification.userId).toBe(user.id);
    expect(result.notification.type).toBe("VIOLATION_APPEAL_RESULT");
  });
});
