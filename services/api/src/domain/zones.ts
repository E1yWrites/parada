import { prisma } from "@parada/database";
import { NotFoundError } from "../http/errors";
import { availabilityOf } from "./availability";
import type { ZoneRecommendation } from "@parada/types";
import { ConfigService } from "./config";
import { ReservationService } from "./reservation";

/**
 * Zone read/availability domain operations.
 *
 * PARADA is zone-based: occupancy is tracked per parking zone and
 * `availableCount` is always DERIVED (never stored) as
 * `max(0, capacity - occupiedCount - reservation holds)`: a reservation keeps a
 * space even though nobody has arrived yet, so it is not offered to others.
 * `occupiedCount` stays the raw physical count. Slot-level information is not
 * exposed here.
 */
export class ZoneService {
  private readonly reservations: ReservationService;

  constructor(reservations: ReservationService = new ReservationService(new ConfigService())) {
    this.reservations = reservations;
  }

  /** capacity - occupied - held, floored at 0, and the availability class that matches it. */
  private effective(z: { capacity: number; occupiedCount: number; status: "ACTIVE" | "INACTIVE" }, held: number) {
    const taken = Math.min(z.capacity, z.occupiedCount + held);
    return {
      availableCount: Math.max(0, z.capacity - taken),
      availability: availabilityOf(taken, z.capacity, z.status),
    };
  }

  async list() {
    const zones = await prisma.parkingZone.findMany({
      where: { status: "ACTIVE" },
      orderBy: { code: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        capacity: true,
        occupiedCount: true,
        status: true,
        navigationLat: true,
        navigationLng: true,
      },
    });
    const held = await this.reservations.protectingCountsByZone();
    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      code: z.code,
      description: z.description,
      capacity: z.capacity,
      occupiedCount: z.occupiedCount,
      status: z.status,
      ...this.effective(z, held.get(z.id) ?? 0),
      navigationLat: z.navigationLat,
      navigationLng: z.navigationLng,
    }));
  }

  async getById(zoneId: string) {
    const z = await prisma.parkingZone.findUnique({
      where: { id: zoneId },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        capacity: true,
        occupiedCount: true,
        status: true,
        navigationLat: true,
        navigationLng: true,
      },
    });
    if (!z) {
      throw new NotFoundError(`Zone '${zoneId}' not found.`);
    }
    const held = (await this.reservations.protectingCountsByZone()).get(z.id) ?? 0;
    return {
      id: z.id,
      name: z.name,
      code: z.code,
      description: z.description,
      capacity: z.capacity,
      occupiedCount: z.occupiedCount,
      status: z.status,
      ...this.effective(z, held),
      navigationLat: z.navigationLat,
      navigationLng: z.navigationLng,
    };
  }

  /**
   * Recommends the least-occupied SUITABLE zone. A zone is suitable if it is:
   *   - ACTIVE
   *   - has capacity > 0 (zero-capacity zones are invalid/never recommendable)
   *   - is not FULL (occupiedCount < capacity)
   *
   * Ties are broken deterministically by zone `code` (ascending).
   *
   * IMPORTANT: a recommendation is NOT an assignment. Calling this method never
   * persists anything; the user must explicitly accept the zone before an
   * assignment is created.
   */
  async recommend(): Promise<ZoneRecommendation> {
    const zones = await prisma.parkingZone.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        capacity: true,
        occupiedCount: true,
        status: true,
        navigationLat: true,
        navigationLng: true,
      },
    });

    // Held spaces count as taken: a zone whose every free space is reserved is not "least busy".
    const held = await this.reservations.protectingCountsByZone();
    const taken = (z: { id: string; capacity: number; occupiedCount: number }) =>
      Math.min(z.capacity, z.occupiedCount + (held.get(z.id) ?? 0));
    const suitable = zones
      .filter((z) => z.capacity > 0 && taken(z) < z.capacity)
      .sort((a, b) => {
        const ratioA = taken(a) / a.capacity;
        const ratioB = taken(b) / b.capacity;
        if (ratioA !== ratioB) {
          return ratioA - ratioB;
        }
        // Deterministic tie-break by zone code.
        if (a.code < b.code) return -1;
        if (a.code > b.code) return 1;
        return 0;
      });

    const best = suitable[0];
    if (!best) {
      // The DTO models "nothing available" as a null zone, so return it rather
      // than raising an error the clients then have to translate back.
      return { recommendedZone: null };
    }

    return {
      recommendedZone: {
        id: best.id,
        name: best.name,
        code: best.code,
        capacity: best.capacity,
        occupiedCount: best.occupiedCount,
        availableCount: Math.max(0, best.capacity - taken(best)),
        status: best.status,
        navigationLat: best.navigationLat,
        navigationLng: best.navigationLng,
      },
    };
  }
}
