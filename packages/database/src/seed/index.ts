import "dotenv/config";
import * as argon2 from "argon2";
import { prisma } from "../client";
import { normalizePlate } from "../plate";
import {
  DEFAULT_PARKING_FEE,
  DEFAULT_GUEST_POLICY,
  DEFAULT_RESERVATION_WINDOW_MINUTES,
  DEFAULT_VIOLATION_POLICIES,
} from "@parada/config";
import { CAMERAS, ESTABLISHMENT_LOCATION, ZONES } from "./lpuBatangas";

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function seed() {
  console.log("Seeding PARADA development data (LPU-Batangas Main Campus)...");

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
        navigationLat: z.navigationLat,
        navigationLng: z.navigationLng,
      },
      create: {
        name: z.name,
        code: z.code,
        description: z.description,
        capacity: z.capacity,
        occupiedCount: 0,
        status: "ACTIVE",
        navigationLat: z.navigationLat,
        navigationLng: z.navigationLng,
      },
    });
    zones[z.code] = created;
    console.log(`  zone ${z.code} (${created.name}) capacity=${z.capacity}`);
  }

  // --- Slots (layout/inventory only) ---
  // Active inventory never exceeds capacity (zoneConfig invariant), so slots
  // from an earlier seed that are not in the current code set are retired to
  // INACTIVE rather than deleted (same semantics as Admin setSlots).
  for (const z of ZONES) {
    const zone = zones[z.code]!;
    const slotCodes: string[] = [];
    for (let n = 1; n <= z.capacity; n++) {
      const slotCode = `${z.code}${String(n).padStart(Math.max(2, String(z.capacity).length), "0")}`;
      slotCodes.push(slotCode);
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
    const retired = await prisma.parkingSlot.updateMany({
      where: { zoneId: zone.id, status: "ACTIVE", slotCode: { notIn: slotCodes } },
      data: { status: "INACTIVE" },
    });
    console.log(`  slots for ${z.code}: ${z.capacity} active${retired.count ? `, ${retired.count} retired` : ""}`);
  }

  // --- Cameras (one gate camera per access point; a camera belongs to one zone) ---
  for (const cam of CAMERAS) {
    const zone = zones[cam.zoneCode];
    if (!zone) throw new Error(`seed camera '${cam.identifier}' references unknown zone code '${cam.zoneCode}'`);
    await prisma.camera.upsert({
      where: { identifier: cam.identifier },
      update: { name: cam.name, zoneId: zone.id, location: cam.location, gateType: cam.gateType, status: "ONLINE" },
      create: {
        zoneId: zone.id,
        name: cam.name,
        identifier: cam.identifier,
        location: cam.location,
        gateType: cam.gateType,
        status: "ONLINE",
      },
    });
    console.log(`  camera ${cam.identifier} -> zone ${cam.zoneCode} (${cam.gateType})`);
  }

  // --- Users (1 admin + 1 user) — seeded accounts skip email verification ---
  const seededVerifiedAt = new Date();
  const admin = await prisma.user.upsert({
    where: { email: "admin@parada.local" },
    update: { role: "ADMIN", status: "ACTIVE", name: "Admin User", passwordHash: adminPasswordHash, emailVerifiedAt: seededVerifiedAt },
    create: {
      name: "Admin User",
      email: "admin@parada.local",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: seededVerifiedAt,
    },
  });
  const user = await prisma.user.upsert({
    where: { email: "driver@parada.local" },
    update: { role: "USER", status: "ACTIVE", name: "Driver User", passwordHash: userPasswordHash, emailVerifiedAt: seededVerifiedAt },
    create: {
      name: "Driver User",
      email: "driver@parada.local",
      passwordHash: userPasswordHash,
      role: "USER",
      status: "ACTIVE",
      emailVerifiedAt: seededVerifiedAt,
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

  // --- EstablishmentConfig (singleton row for runtime-configurable settings) ---
  // `location` is the single navigation destination (GPS is navigation only).
  await prisma.establishmentConfig.upsert({
    where: { id: "singleton" },
    update: {
      parkingFee: DEFAULT_PARKING_FEE,
      violations: DEFAULT_VIOLATION_POLICIES,
      guestPolicy: DEFAULT_GUEST_POLICY,
      zoneDefaults: {
        maxReservationDurationMinutes: DEFAULT_RESERVATION_WINDOW_MINUTES,
        occupancyLowThreshold: 0.2,
      },
      location: ESTABLISHMENT_LOCATION,
    },
    create: {
      id: "singleton",
      parkingFee: DEFAULT_PARKING_FEE,
      violations: DEFAULT_VIOLATION_POLICIES,
      guestPolicy: DEFAULT_GUEST_POLICY,
      zoneDefaults: {
        maxReservationDurationMinutes: DEFAULT_RESERVATION_WINDOW_MINUTES,
        occupancyLowThreshold: 0.2,
      },
      location: ESTABLISHMENT_LOCATION,
    },
  });
  console.log(`  establishment_config: singleton seeded, location=${ESTABLISHMENT_LOCATION.latitude},${ESTABLISHMENT_LOCATION.longitude}`);

  console.log("Seeding complete.");
}

if (require.main === module) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}