import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

it("publishes nothing when the reservation transaction is rejected (e.g. zone at capacity)", async () => {
  const hub = new RealtimeHub();
  const frames: string[] = [];
  const client: RealtimeClient = { id: "c1", userId: "rollbackUser1", role: "USER", write: (c) => frames.push(c) };
  hub.subscribe(client);
  const app = createApp({ auth, realtimeHub: hub });

  const user = await prisma.user.create({ data: { id: "rollbackUser1", name: "R", email: "rb1@x.com", passwordHash: "x", role: "USER" } });
  const zone = await prisma.parkingZone.create({ data: { name: "RTFull", code: "RTFULL", capacity: 0 } });
  const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-FULL", normalizedPlate: "RTFULL1", vehicleType: "CAR" } });
  const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

  const res = await request(app)
    .post("/reservations")
    .set("Authorization", `Bearer ${token}`)
    .send({ zoneId: zone.id, vehicleId: vehicle.id });

  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(frames.some((f) => f.includes("RESERVATION_CREATED"))).toBe(false);
});
