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

describe("session entry/exit publish realtime events after commit", () => {
  it("publishes PARKING_SESSION_STARTED to the owning user (and admin) on entry", async () => {
    const hub = new RealtimeHub();
    const owner = spyClient("owner1", "USER");
    const other = spyClient("other1", "USER");
    const admin = spyClient("admin1", "ADMIN");
    hub.subscribe(owner.client);
    hub.subscribe(other.client);
    hub.subscribe(admin.client);
    const app = createApp({ auth, realtimeHub: hub });

    const user = await prisma.user.create({ data: { id: "owner1", name: "Owner", email: "owner1@x.com", passwordHash: "x", role: "USER" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT2 Zone", code: "RT2", capacity: 5 } });
    const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-1", normalizedPlate: "RT1", vehicleType: "CAR" } });
    const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

    const res = await request(app)
      .post("/sessions/entry")
      .set("Authorization", `Bearer ${token}`)
      .send({ vehicleId: vehicle.id, zoneId: zone.id });

    expect(res.status).toBe(201);
    expect(owner.frames.some((f) => f.includes("PARKING_SESSION_STARTED"))).toBe(true);
    expect(admin.frames.some((f) => f.includes("PARKING_SESSION_STARTED"))).toBe(true);
    expect(other.frames.some((f) => f.includes("PARKING_SESSION_STARTED"))).toBe(false);
  });
});
