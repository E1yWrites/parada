import { prisma } from "@parada/database";
import { NotFoundError } from "../http/errors";
import { availabilityOf } from "./availability";
import type { ZoneRecommendation } from "@parada/types";

/**
 * Zone read/availability domain operations.
 *
 * PARADA is zone-based: occupancy is tracked per parking zone and
 * `availableCount` is always DERIVED as `capacity - occupiedCount`
 * (never stored). Slot-level information is not exposed here.
 */
export class ZoneService {
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
    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      code: z.code,
      description: z.description,
      capacity: z.capacity,
      occupiedCount: z.occupiedCount,
      availableCount: z.capacity - z.occupiedCount,
      status: z.status,
      availability: availabilityOf(z.occupiedCount, z.capacity, z.status),
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
    return {
      id: z.id,
      name: z.name,
      code: z.code,
      description: z.description,
      capacity: z.capacity,
      occupiedCount: z.occupiedCount,
      availableCount: z.capacity - z.occupiedCount,
      status: z.status,
      availability: availabilityOf(z.occupiedCount, z.capacity, z.status),
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

    const suitable = zones
      .filter((z) => z.capacity > 0 && z.occupiedCount < z.capacity)
      .sort((a, b) => {
        const ratioA = a.occupiedCount / a.capacity;
        const ratioB = b.occupiedCount / b.capacity;
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
        availableCount: best.capacity - best.occupiedCount,
        status: best.status,
        navigationLat: best.navigationLat,
        navigationLng: best.navigationLng,
      },
    };
  }
}
