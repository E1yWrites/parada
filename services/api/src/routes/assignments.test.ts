import request from "supertest";
import { createApp } from "../app";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";
import { AuthService } from "../domain/auth";
import { prisma } from "@parada/database";

const auth = new AuthService({ secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" });

function spyClient(userId: string, role: "ADMIN" | "USER") {
  const frames: string[] = [];
  return { client: { id: `${userId}-${Math.random()}`, userId, role, write: (c: string) => frames.push(c) } as RealtimeClient, frames };
}

it("publishes ASSIGNMENT_CREATED to the owning user after commit", async () => {
  const hub = new RealtimeHub();
  const owner = spyClient("assignOwner1", "USER");
  hub.subscribe(owner.client);
  const app = createApp({ auth, realtimeHub: hub });

  const user = await prisma.user.create({ data: { id: "assignOwner1", name: "A", email: "assignOwner1@x.com", passwordHash: "x", role: "USER" } });
  const zone = await prisma.parkingZone.create({ data: { name: "RT5 Zone", code: "RT5", capacity: 5 } });
  const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-4", normalizedPlate: "RT4", vehicleType: "CAR" } });
  const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

  const res = await request(app)
    .post("/assignments")
    .set("Authorization", `Bearer ${token}`)
    .send({ zoneId: zone.id, vehicleId: vehicle.id });

  expect(res.status).toBe(201);
  expect(owner.frames.some((f) => f.includes("ASSIGNMENT_CREATED"))).toBe(true);
});
