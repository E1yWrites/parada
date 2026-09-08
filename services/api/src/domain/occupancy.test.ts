import { OccupancyService } from "./occupancy";
import { AssignmentService } from "./assignment";
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

describe("OccupancyService.processEvent surfaces the escalated violation", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });
  it("returns { event, violation: null } when no escalation occurs", async () => {
    // Brief's original test omitted detectedPlate, which makes matchVehicle()
    // return vehicleId: null and routes into the GUEST path instead of
    // processRegisteredVehicle — the guest path never had an "event" wrapper
    // (see events.ts's `"event" in result ? result.event : result` unwrap).
    // A registered vehicle + matching detectedPlate is required to actually
    // exercise the registered-vehicle return-shape change under test.
    const config = new ConfigService();
    const occupancy = new OccupancyService({ config });
    const zone = await prisma.parkingZone.create({ data: { name: "RT5 Zone", code: "RT5", capacity: 5 } });
    const camera = await prisma.camera.create({
      data: { zoneId: zone.id, name: "Gate", identifier: "RT-CAM-5", gateType: "BIDIRECTIONAL", status: "ONLINE" },
    });
    const user = await prisma.user.create({ data: { name: "R", email: "r1@x.com", passwordHash: "x", role: "USER" } });
    await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-5", normalizedPlate: "RT5", vehicleType: "CAR" } });

    const result = await occupancy.processEvent({
      zoneId: zone.id,
      cameraIdentifier: camera.identifier,
      sourceEventId: "occ-test-1",
      eventType: "ENTRY",
      detectedPlate: "RT-5",
    });

    expect(result).toHaveProperty("event");
    if (!("violation" in result)) throw new Error("expected registered-vehicle result shape");
    expect(result.violation).toBeNull();
  });

  it("returns the created Violation once wrong-zone warnings are exhausted", async () => {
    const config = new ConfigService();
    const assignments = new AssignmentService(config);
    const violations = new ViolationService(config);
    const occupancy = new OccupancyService({ config, assignments, violations });

    const zoneA = await prisma.parkingZone.create({ data: { name: "RT6A", code: "RT6A", capacity: 5 } });
    const zoneB = await prisma.parkingZone.create({ data: { name: "RT6B", code: "RT6B", capacity: 5 } });
    const cameraB = await prisma.camera.create({
      data: { zoneId: zoneB.id, name: "GateB", identifier: "RT-CAM-6B", gateType: "ENTRY", status: "ONLINE" },
    });
    const user = await prisma.user.create({ data: { name: "V", email: "v1@x.com", passwordHash: "x", role: "USER" } });
    const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-9", normalizedPlate: "RT9", vehicleType: "CAR" } });
    await assignments.create(user.id, { zoneId: zoneA.id, vehicleId: vehicle.id });

    // First wrong-zone entry: warning only (WRONG_ZONE_WARNINGS_BEFORE_VIOLATION = 1 prior warning tolerated).
    await occupancy.processEvent({ zoneId: zoneB.id, cameraIdentifier: cameraB.identifier, sourceEventId: "occ-wz-1", eventType: "ENTRY", detectedPlate: "RT-9" });
    await prisma.parkingSession.updateMany({ where: { vehicleId: vehicle.id }, data: { status: "COMPLETED", exitedAt: new Date() } });

    // Second wrong-zone entry: escalates to a Violation.
    const result = await occupancy.processEvent({ zoneId: zoneB.id, cameraIdentifier: cameraB.identifier, sourceEventId: "occ-wz-2", eventType: "ENTRY", detectedPlate: "RT-9" });

    if (!("violation" in result)) throw new Error("expected registered-vehicle result shape");
    expect(result.violation).not.toBeNull();
    expect(result.violation?.violationType).toBe("WRONG_ZONE");
  });
});
