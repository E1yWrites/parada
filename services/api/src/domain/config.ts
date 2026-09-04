import { prisma } from "@parada/database";
import {
  DEFAULT_PARKING_FEE,
  DEFAULT_RESERVATION_WINDOW_MINUTES,
} from "@parada/config";
import type { ParkingFeeConfig } from "@parada/types";

/**
 * Reads runtime-configurable establishment settings from the singleton
 * `EstablishmentConfig` row, falling back to the shared defaults in
 * `@parada/config` when a value is absent.
 *
 * This is the single place that resolves fee / reservation-window configuration;
 * controllers and services must not hardcode ₱20 / ₱10 / 15-minute values.
 */
export class ConfigService {
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
}
