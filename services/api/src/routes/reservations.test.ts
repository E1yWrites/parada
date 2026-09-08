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

describe("reservation create/cancel publish realtime events after commit", () => {
  it("publishes RESERVATION_CREATED then RESERVATION_CANCELLED to the owning user", async () => {
    const hub = new RealtimeHub();
    const owner = spyClient("resOwner1", "USER");
    hub.subscribe(owner.client);
    const app = createApp({ auth, realtimeHub: hub });

    const user = await prisma.user.create({ data: { id: "resOwner1", name: "R", email: "r1@x.com", passwordHash: "x", role: "USER" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT3 Zone", code: "RT3", capacity: 5 } });
    const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-2", normalizedPlate: "RT2", vehicleType: "CAR" } });
    const { token } = auth["tokens"].sign({ id: user.id, role: "USER" });

    const created = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${token}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id });
    expect(created.status).toBe(201);
    expect(owner.frames.some((f) => f.includes("RESERVATION_CREATED"))).toBe(true);

    const reservationId = created.body.data.id;
    const cancelled = await request(app)
      .patch(`/reservations/${reservationId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelled.status).toBe(200);
    expect(owner.frames.some((f) => f.includes("RESERVATION_CANCELLED"))).toBe(true);
  });
});

describe("admin reservation cancel publishes realtime event to the reservation owner (not the admin)", () => {
  it("publishes RESERVATION_CANCELLED scoped to the owner's userId when an admin cancels", async () => {
    const hub = new RealtimeHub();
    const owner = spyClient("resOwner2", "USER");
    const admin = spyClient("adminActor1", "ADMIN");
    hub.subscribe(owner.client);
    hub.subscribe(admin.client);
    const app = createApp({ auth, realtimeHub: hub });

    const user = await prisma.user.create({ data: { id: "resOwner2", name: "R2", email: "r2@x.com", passwordHash: "x", role: "USER" } });
    const adminUser = await prisma.user.create({ data: { id: "adminActor1", name: "A", email: "a1@x.com", passwordHash: "x", role: "ADMIN" } });
    const zone = await prisma.parkingZone.create({ data: { name: "RT4 Zone", code: "RT4", capacity: 5 } });
    const vehicle = await prisma.vehicle.create({ data: { userId: user.id, plateNumber: "RT-3", normalizedPlate: "RT3", vehicleType: "CAR" } });
    const { token: userToken } = auth["tokens"].sign({ id: user.id, role: "USER" });
    const { token: adminToken } = auth["tokens"].sign({ id: adminUser.id, role: "ADMIN" });

    const created = await request(app)
      .post("/reservations")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ zoneId: zone.id, vehicleId: vehicle.id });
    expect(created.status).toBe(201);

    const reservationId = created.body.data.id;
    const cancelled = await request(app)
      .patch(`/admin/reservations/${reservationId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cancelled.status).toBe(200);

    // The event must be scoped to the reservation OWNER's userId, not the acting admin's.
    expect(owner.frames.some((f) => f.includes("RESERVATION_CANCELLED"))).toBe(true);
  });
});
