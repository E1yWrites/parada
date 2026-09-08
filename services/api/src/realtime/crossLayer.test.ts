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
