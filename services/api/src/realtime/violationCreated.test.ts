import { prisma } from "@parada/database";
import { RealtimeHub } from "./hub";
import { publishOccupancyOutcome } from "./occupancyEvents";

/**
 * VIOLATION_CREATED used to carry the bare violation row (no zone, no vehicle),
 * so clients rendering it — the admin pop-up reads zone.name — threw. It must
 * carry the same shape GET /violations returns.
 */
it("VIOLATION_CREATED carries the violation's zone and vehicle, to the owner and admins", async () => {
  const run = Date.now().toString(36);
  const driver = await prisma.user.create({
    data: { name: "VC Driver", email: `vc-${run}@test.local`, passwordHash: "x", role: "USER" },
  });
  const zone = await prisma.parkingZone.create({ data: { name: `VC Zone ${run}`, code: `VC${run}`, capacity: 5 } });
  const vehicle = await prisma.vehicle.create({
    data: { userId: driver.id, plateNumber: `VC-${run}`, normalizedPlate: `VC${run}`.toUpperCase(), vehicleType: "CAR" },
  });
  const violation = await prisma.violation.create({
    data: { userId: driver.id, zoneId: zone.id, vehicleId: vehicle.id, violationType: "WRONG_ZONE", fineAmount: 200 },
  });

  const hub = new RealtimeHub();
  const frames: string[] = [];
  hub.subscribe({ id: `vc-admin-${run}`, userId: "vc-admin", role: "ADMIN", write: (c) => frames.push(c) });

  await publishOccupancyOutcome(hub, zone.id, {
    event: { id: `missing-${run}`, eventType: "ENTRY" },
    violation,
    notifications: [],
  } as never);

  const frame = frames.find((f) => f.includes("event: VIOLATION_CREATED"));
  expect(frame).toBeDefined();
  const data = JSON.parse(/data: (.*)/.exec(frame!)![1]!);
  expect(data.payload.zone).toEqual({ id: zone.id, name: zone.name, code: zone.code });
  expect(data.payload.vehicle.plateNumber).toBe(vehicle.plateNumber);
});
