import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

it("a reservation created over HTTP is only visible on the DB row AFTER commit, and only THEN reaches an authorized SSE client — never an unauthorized one", async () => {
  const hub = new RealtimeHub();
  const ownerFrames: string[] = [];
  const strangerFrames: string[] = [];
  const owner: RealtimeClient = { id: "owner-conn", userId: "crossOwner1", role: "USER", write: (c) => ownerFrames.push(c) };
  const stranger: RealtimeClient = { id: "stranger-conn", userId: "crossStranger1", role: "USER", write: (c) => strangerFrames.push(c) };
  hub.subscribe(owner);
  hub.subscribe(stranger);
  const app = createApp({ auth, realtimeHub: hub });

  const user = await prisma.user.create({ data: { id: "crossOwner1", name: "X", email: "x1@x.com", passwordHash: "x", role: "USER" } });
  const zone = await prisma.parkingZone.create({ data: { name: "RTX", code: "RTX", capacity: 5 } });
  const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-X", normalizedPlate: "RTX1", vehicleType: "CAR" } });
  const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

  const res = await request(app)
    .post("/reservations")
    .set("Authorization", `Bearer ${token}`)
    .send({ zoneId: zone.id, vehicleId: vehicle.id });
  expect(res.status).toBe(201);

  // The DB row is the source of truth: it exists, committed, before we even
  // look at what was published.
  const row = await prisma.reservation.findUnique({ where: { id: res.body.data.id } });
  expect(row).not.toBeNull();
  expect(row?.status).toBe("CONFIRMED");

  // The event reached the owner...
  expect(ownerFrames.some((f) => f.includes("RESERVATION_CREATED") && f.includes(row!.id))).toBe(true);
  // ...and never a stranger.
  expect(strangerFrames.some((f) => f.includes(row!.id))).toBe(false);
});

it("a simulator run publishes the driver's session start and end, as a camera event would — to the owner only, never in the HTTP response", async () => {
  const hub = new RealtimeHub();
  const ownerFrames: string[] = [];
  const strangerFrames: string[] = [];
  hub.subscribe({ id: "sim-owner-conn", userId: "simOwner1", role: "USER", write: (c) => ownerFrames.push(c) });
  hub.subscribe({ id: "sim-stranger-conn", userId: "simStranger1", role: "USER", write: (c) => strangerFrames.push(c) });
  const app = createApp({ auth, realtimeHub: hub });

  const driver = await prisma.user.create({ data: { id: "simOwner1", name: "S", email: "s1@x.com", passwordHash: "x", role: "USER" } });
  await prisma.user.create({ data: { id: "simAdmin1", name: "A", email: "a1@x.com", passwordHash: "x", role: "ADMIN" } });
  const zone = await prisma.parkingZone.create({ data: { name: "SIMRT", code: "SIMRT", capacity: 5 } });
  await prisma.camera.create({ data: { zoneId: zone.id, name: "Gate", identifier: "cam-simrt", gateType: "BIDIRECTIONAL", status: "ONLINE" } });
  const vehicle = await prisma.vehicle.create({ data: { userId: driver.id, plateNumber: "SIM-RT1", normalizedPlate: "SIMRT1", vehicleType: "CAR" } });
  const { token } = auth["tokens"].sign({ id: "simAdmin1", role: "ADMIN" });

  const res = await request(app)
    .post("/simulator/run")
    .set("Authorization", `Bearer ${token}`)
    .send({ scenario: "COMPLETE_PARKING_LIFECYCLE", zoneId: zone.id, vehicleIds: [vehicle.id] });
  expect(res.status).toBe(201);
  // Pipeline results are realtime-only, as on the camera route.
  expect(res.body.data.outcomes).toBeUndefined();

  const session = await prisma.parkingSession.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
  expect(session.status).toBe("COMPLETED");
  expect(ownerFrames.some((f) => f.includes("PARKING_SESSION_STARTED") && f.includes(session.id))).toBe(true);
  expect(ownerFrames.some((f) => f.includes("PARKING_SESSION_COMPLETED") && f.includes(session.id))).toBe(true);
  expect(strangerFrames.some((f) => f.includes(session.id))).toBe(false);
});

it("a simulator FILL_ZONE publishes the zone's FULL notification to admins (unknown plates included)", async () => {
  const hub = new RealtimeHub();
  const adminFrames: string[] = [];
  hub.subscribe({ id: "fill-admin-conn", userId: "fillAdmin1", role: "ADMIN", write: (c) => adminFrames.push(c) });
  const app = createApp({ auth, realtimeHub: hub });

  await prisma.user.create({ data: { id: "fillAdmin1", name: "A", email: "fill-a1@x.com", passwordHash: "x", role: "ADMIN" } });
  const zone = await prisma.parkingZone.create({ data: { name: "FILLRT", code: "FILLRT", capacity: 3 } });
  await prisma.camera.create({ data: { zoneId: zone.id, name: "Gate", identifier: "cam-fillrt", gateType: "BIDIRECTIONAL", status: "ONLINE" } });
  const { token } = auth["tokens"].sign({ id: "fillAdmin1", role: "ADMIN" });

  await request(app)
    .post("/simulator/run")
    .set("Authorization", `Bearer ${token}`)
    .send({ scenario: "FILL_ZONE", zoneId: zone.id })
    .expect(201);

  const notices = adminFrames.filter((f) => f.includes("event: NOTIFICATION_CREATED"));
  expect(notices.some((f) => f.includes("ZONE_FULL") && f.includes(zone.id))).toBe(true);
  expect(notices.some((f) => f.includes("ZONE_LOW_AVAILABILITY"))).toBe(true);
});

it("a reservation create and cancel publish the zone's new availability to every driver", async () => {
  const hub = new RealtimeHub();
  const bystanderFrames: string[] = [];
  hub.subscribe({ id: "hold-bystander", userId: "holdBystander1", role: "USER", write: (c) => bystanderFrames.push(c) });
  const app = createApp({ auth, realtimeHub: hub });

  const user = await prisma.user.create({ data: { id: "holdOwner1", name: "H", email: "hold1@x.com", passwordHash: "x", role: "USER" } });
  const zone = await prisma.parkingZone.create({ data: { name: "HOLDRT", code: "HOLDRT", capacity: 5 } });
  const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "HOLD-1", normalizedPlate: "HOLD1", vehicleType: "CAR" } });
  const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

  const created = await request(app).post("/reservations").set("Authorization", `Bearer ${token}`).send({ zoneId: zone.id, vehicleId: vehicle.id }).expect(201);
  const afterCreate = bystanderFrames.filter((f) => f.includes("ZONE_OCCUPANCY_UPDATED") && f.includes(zone.id));
  expect(afterCreate.length).toBe(1);
  expect(afterCreate[0]).toContain("\"availableCount\":4");

  await request(app).patch(`/reservations/${created.body.data.id}/cancel`).set("Authorization", `Bearer ${token}`).expect(200);
  const afterCancel = bystanderFrames.filter((f) => f.includes("ZONE_OCCUPANCY_UPDATED") && f.includes(zone.id));
  expect(afterCancel.length).toBe(2);
  expect(afterCancel[1]).toContain("\"availableCount\":5");
  // The reservation itself still goes only to its owner.
  expect(bystanderFrames.some((f) => f.includes("RESERVATION_"))).toBe(false);
});
