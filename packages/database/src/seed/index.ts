import "dotenv/config";
import * as argon2 from "argon2";
import { prisma } from "../client";
import { Role, GateType } from "@prisma/client";
import { normalizePlate } from "../plate";

const ZONES = [
  { name: "Zone A", code: "A", capacity: 20, description: "North parking area" },
  { name: "Zone B", code: "B", capacity: 20, description: "East parking area" },
  { name: "Zone C", code: "C", capacity: 10, description: "South parking area" },
];

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function seed() {
  console.log("Seeding PARADA development data...");

  // Dev passwords (for development only - never use real passwords)
  const ADMIN_PASSWORD = "AdminPass123!";
  const USER_PASSWORD = "DriverPass123!";

  const adminPasswordHash = await hashPassword(ADMIN_PASSWORD);
  const userPasswordHash = await hashPassword(USER_PASSWORD);

  console.log("  dev credentials: admin@parada.local / AdminPass123!");
  console.log("  dev credentials: driver@parada.local / DriverPass123!");

  // --- Zones ---
  const zones: Record<string, { id: string }> = {};
  for (const z of ZONES) {
    const created = await prisma.parkingZone.upsert({
      where: { code: z.code },
      update: {
        name: z.name,
        description: z.description,
        capacity: z.capacity,
        status: "ACTIVE",
      },
      create: {
        name: z.name,
        code: z.code,
        description: z.description,
        capacity: z.capacity,
        occupiedCount: 0,
        status: "ACTIVE",
      },
    });
    zones[z.code] = created;
    console.log(`  zone ${z.code} (${created.name}) capacity=${z.capacity}`);
  }

  // --- Slots (layout/inventory only) ---
  for (const z of ZONES) {
    const zone = zones[z.code]!;
    for (let n = 1; n <= z.capacity; n++) {
      const slotCode = `${z.code}${String(n).padStart(2, "0")}`;
      await prisma.parkingSlot.upsert({
        where: { zoneId_slotCode: { zoneId: zone.id, slotCode } },
        update: { label: slotCode, status: "ACTIVE" },
        create: {
          zoneId: zone.id,
          slotCode,
          label: slotCode,
          positionX: n,
          positionY: z.code.charCodeAt(0) - 65,
          status: "ACTIVE",
        },
      });
    }
    console.log(`  slots for ${z.code}: ${z.capacity} created`);
  }

  // --- Cameras (Entry + Exit per zone) ---
  for (const z of ZONES) {
    const zone = zones[z.code]!;
    const entries: { name: string; id: string; gate: GateType }[] = [
      { name: `${z.name} Entry`, id: `cam-${z.code.toLowerCase()}-entry`, gate: "ENTRY" },
      { name: `${z.name} Exit`, id: `cam-${z.code.toLowerCase()}-exit`, gate: "EXIT" },
    ];
    for (const cam of entries) {
      await prisma.camera.upsert({
        where: { identifier: cam.id },
        update: { name: cam.name, zoneId: zone.id, gateType: cam.gate, status: "ONLINE" },
        create: {
          zoneId: zone.id,
          name: cam.name,
          identifier: cam.id,
          location: `${z.name} gate`,
          gateType: cam.gate,
          status: "ONLINE",
        },
      });
    }
    console.log(`  cameras for ${z.code}: ${entries.length} created`);
  }

  // --- Users (1 admin + 1 user) ---
  const admin = await prisma.user.upsert({
    where: { email: "admin@parada.local" },
    update: { role: "ADMIN", status: "ACTIVE", name: "Admin User", passwordHash: adminPasswordHash },
    create: {
      name: "Admin User",
      email: "admin@parada.local",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  const user = await prisma.user.upsert({
    where: { email: "driver@parada.local" },
    update: { role: "USER", status: "ACTIVE", name: "Driver User", passwordHash: userPasswordHash },
    create: {
      name: "Driver User",
      email: "driver@parada.local",
      passwordHash: userPasswordHash,
      role: "USER",
      status: "ACTIVE",
    },
  });
  console.log(`  users: admin=${admin.email} user=${user.email}`);

  // --- Vehicles (a user may have more than one registered vehicle) ---
  const registeredVehicles: {
    userId: string;
    plateNumber: string;
    vehicleType: "CAR" | "MOTORCYCLE" | "VAN" | "TRUCK" | "OTHER";
  }[] = [
    { userId: user.id, plateNumber: "ABC-1234", vehicleType: "CAR" },
    { userId: user.id, plateNumber: "XYZ-5678", vehicleType: "MOTORCYCLE" },
    { userId: admin.id, plateNumber: "MNO-9999", vehicleType: "VAN" },
  ];
  for (const v of registeredVehicles) {
    const normalized = normalizePlate(v.plateNumber);
    await prisma.vehicle.upsert({
      where: {
        userId_normalizedPlate: { userId: v.userId, normalizedPlate: normalized },
      },
      update: { plateNumber: v.plateNumber, vehicleType: v.vehicleType, status: "ACTIVE" },
      create: {
        userId: v.userId,
        plateNumber: v.plateNumber,
        normalizedPlate: normalized,
        vehicleType: v.vehicleType,
        status: "ACTIVE",
      },
    });
  }
  console.log(`  vehicles: ${registeredVehicles.length} registered (incl. multiple per user)`);

  console.log("Seeding complete.");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });