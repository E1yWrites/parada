import { prisma, Prisma } from "@parada/database";
import {
  DEFAULT_PARKING_FEE,
  DEFAULT_RESERVATION_WINDOW_MINUTES,
  DEFAULT_GUEST_POLICY,
  DEFAULT_VIOLATION_POLICIES,
  ZONE_OCCUPANCY_LOW_THRESHOLD,
} from "@parada/config";
import type {
  EstablishmentLocation,
  EstablishmentSettings,
  GuestPolicyConfig,
  ParkingFeeConfig,
  ViolationPolicyConfig,
  ZoneDefaultsConfig,
} from "@parada/types";
import { BadRequestError } from "../http/errors";

/**
 * Reads runtime-configurable establishment settings from the singleton
 * `EstablishmentConfig` row, falling back to the shared defaults in
 * `@parada/config` when a value is absent.
 *
 * This is the single place that resolves fee / reservation-window configuration;
 * controllers and services must not hardcode ₱20 / ₱10 / 15-minute values.
 */
export class ConfigService {
  async getEstablishmentSettings(): Promise<EstablishmentSettings> {
    const cfg = await prisma.establishmentConfig.findUnique({ where: { id: "singleton" } });
    const rawViolations = cfg?.violations;
    const violations = Array.isArray(rawViolations)
      ? rawViolations.filter(isViolationPolicy).map((rawItem) => {
          const item = rawItem as unknown as ViolationPolicyConfig;
          return {
          type: item.type,
          fineAmount: item.fineAmount,
          description: item.description,
          };
        })
      : [];
    const rawDefaults = cfg?.zoneDefaults;
    const defaults = rawDefaults && typeof rawDefaults === "object" ? rawDefaults as Record<string, unknown> : {};
    return {
      parkingFee: await this.getParkingFeeConfig(),
      violations,
      guestPolicy: await this.getGuestPolicy(),
      zoneDefaults: {
        maxReservationDurationMinutes:
          typeof defaults["maxReservationDurationMinutes"] === "number" && defaults["maxReservationDurationMinutes"] > 0
            ? defaults["maxReservationDurationMinutes"]
            : DEFAULT_RESERVATION_WINDOW_MINUTES,
        occupancyLowThreshold:
          typeof defaults["occupancyLowThreshold"] === "number" && defaults["occupancyLowThreshold"] >= 0 && defaults["occupancyLowThreshold"] <= 1
            ? defaults["occupancyLowThreshold"]
            : ZONE_OCCUPANCY_LOW_THRESHOLD,
      },
      location: toEstablishmentLocation(cfg?.location),
    };
  }

  async updateEstablishmentSettings(input: EstablishmentSettings): Promise<EstablishmentSettings> {
    validateSettings(input);
    if (input.guestPolicy.primaryZoneId) {
      const zone = await prisma.parkingZone.findUnique({ where: { id: input.guestPolicy.primaryZoneId }, select: { status: true } });
      if (!zone || zone.status !== "ACTIVE") throw new BadRequestError("'primaryZoneId' must reference an active zone.");
    }
    const locationValue: Prisma.InputJsonValue =
      input.location as unknown as Prisma.InputJsonValue;
    const update: Prisma.EstablishmentConfigUpdateInput = {
      parkingFee: input.parkingFee as unknown as Prisma.InputJsonValue,
      violations: input.violations as unknown as Prisma.InputJsonValue,
      guestPolicy: input.guestPolicy as unknown as Prisma.InputJsonValue,
      zoneDefaults: input.zoneDefaults as unknown as Prisma.InputJsonValue,
    };
    if (input.location !== undefined) {
      update.location = input.location === null ? Prisma.JsonNull : locationValue;
    }
    const create: Prisma.EstablishmentConfigCreateInput = {
      id: "singleton",
      parkingFee: input.parkingFee as unknown as Prisma.InputJsonValue,
      violations: input.violations as unknown as Prisma.InputJsonValue,
      guestPolicy: input.guestPolicy as unknown as Prisma.InputJsonValue,
      zoneDefaults: input.zoneDefaults as unknown as Prisma.InputJsonValue,
      location:
        input.location === undefined || input.location === null
          ? Prisma.DbNull
          : locationValue,
    };
    await prisma.establishmentConfig.upsert({
      where: { id: "singleton" },
      update,
      create,
    });
    return this.getEstablishmentSettings();
  }

  /**
   * Returns the effective parking-fee configuration. Reads the
   * `EstablishmentConfig.parkingFee` JSON object; validates/coerces the known
   * shape, falling back to DEFAULT_PARKING_FEE on absence or malformed data.
   */
  async getParkingFeeConfig(): Promise<ParkingFeeConfig> {
    const cfg = await prisma.establishmentConfig.findUnique({ where: { id: "singleton" } });
    const raw = cfg?.parkingFee;
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (
        typeof obj["baseFee"] === "number" &&
        typeof obj["baseDurationHours"] === "number" &&
        typeof obj["additionalFeePerHour"] === "number"
      ) {
        return {
          baseFee: obj["baseFee"],
          baseDurationHours: obj["baseDurationHours"],
          additionalFeePerHour: obj["additionalFeePerHour"],
        };
      }
    }
    return { ...DEFAULT_PARKING_FEE };
  }

  /**
   * Returns the configured reservation arrival window in minutes (default 15).
   * Reads `EstablishmentConfig.zoneDefaults.maxReservationDurationMinutes`.
   */
  async getReservationWindowMinutes(): Promise<number> {
    const cfg = await prisma.establishmentConfig.findUnique({ where: { id: "singleton" } });
    const raw = cfg?.zoneDefaults;
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      const value = obj["maxReservationDurationMinutes"];
      if (typeof value === "number" && value > 0) {
        return value;
      }
    }
    return DEFAULT_RESERVATION_WINDOW_MINUTES;
  }

  /**
   * Returns the effective guest-admission policy. Reads the
   * `EstablishmentConfig.guestPolicy` JSON object and coerces the known shape,
   * falling back to DEFAULT_GUEST_POLICY (PRIMARY_ZONE, primaryZoneId null)
   * on absence or malformed data.
   */
  async getGuestPolicy(): Promise<GuestPolicyConfig> {
    const cfg = await prisma.establishmentConfig.findUnique({ where: { id: "singleton" } });
    const raw = cfg?.guestPolicy;
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (
        (obj["policy"] === "PRIMARY_ZONE" ||
          obj["policy"] === "ALLOW_OVERFLOW" ||
          obj["policy"] === "DENY_WHEN_FULL") &&
        (obj["primaryZoneId"] === null || typeof obj["primaryZoneId"] === "string")
      ) {
        return {
          policy: obj["policy"],
          primaryZoneId: obj["primaryZoneId"] ?? null,
        };
      }
    }
    return { ...DEFAULT_GUEST_POLICY };
  }
}

function isViolationPolicy(value: unknown): value is ViolationPolicyConfig {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item["type"] === "string" && typeof item["fineAmount"] === "number" && item["fineAmount"] >= 0 && typeof item["description"] === "string";
}

/** Coerces the optional establishment `location` JSON into its typed shape.
 *  Returns null when unset or malformed (navigation simply stays unavailable). */
function toEstablishmentLocation(value: unknown): EstablishmentLocation | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item["address"] === "string" &&
    typeof item["latitude"] === "number" &&
    isFinite(item["latitude"]) &&
    item["latitude"] >= -90 &&
    item["latitude"] <= 90 &&
    typeof item["longitude"] === "number" &&
    isFinite(item["longitude"]) &&
    item["longitude"] >= -180 &&
    item["longitude"] <= 180
  ) {
    return {
      address: item["address"],
      latitude: item["latitude"],
      longitude: item["longitude"],
    };
  }
  return null;
}

function validateSettings(input: EstablishmentSettings): void {
  const fee = input.parkingFee;
  if (!Number.isFinite(fee.baseFee) || fee.baseFee < 0 || !Number.isFinite(fee.baseDurationHours) || fee.baseDurationHours <= 0 || !Number.isFinite(fee.additionalFeePerHour) || fee.additionalFeePerHour < 0) {
    throw new BadRequestError("Parking fee values are invalid.");
  }
  const guest = input.guestPolicy;
  if (!["PRIMARY_ZONE", "ALLOW_OVERFLOW", "DENY_WHEN_FULL"].includes(guest.policy) || (guest.primaryZoneId !== null && typeof guest.primaryZoneId !== "string")) {
    throw new BadRequestError("Guest policy values are invalid.");
  }
  const defaults = input.zoneDefaults;
  if (!Number.isInteger(defaults.maxReservationDurationMinutes) || defaults.maxReservationDurationMinutes <= 0 || !Number.isFinite(defaults.occupancyLowThreshold) || defaults.occupancyLowThreshold < 0 || defaults.occupancyLowThreshold > 1) {
    throw new BadRequestError("Zone default values are invalid.");
  }
  if (!Array.isArray(input.violations) || input.violations.some((item) => !isViolationPolicy(item))) {
    throw new BadRequestError("Violation configuration is invalid.");
  }
  if (input.location !== null && input.location !== undefined) {
    const loc = input.location;
    if (
      typeof loc.address !== "string" ||
      !Number.isFinite(loc.latitude) ||
      loc.latitude < -90 ||
      loc.latitude > 90 ||
      !Number.isFinite(loc.longitude) ||
      loc.longitude < -180 ||
      loc.longitude > 180
    ) {
      throw new BadRequestError("Establishment location values are invalid.");
    }
  }
}

/**
 * Fine for an establishment-defined violation type, from the configured
 * policy list, falling back to the shared default set. Fines are never
 * hardcoded at the call site.
 */
export async function resolveViolationFine(
  config: ConfigService,
  type: ViolationPolicyConfig["type"]
): Promise<number> {
  const settings = await config.getEstablishmentSettings();
  const configured = settings.violations.find((policy) => policy.type === type);
  if (configured) {
    return configured.fineAmount;
  }
  const fallback = DEFAULT_VIOLATION_POLICIES.find((policy) => policy.type === type);
  return fallback?.fineAmount ?? 0;
}
