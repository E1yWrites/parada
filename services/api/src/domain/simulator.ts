import { prisma } from "@parada/database";
import { BadRequestError, NotFoundError } from "../http/errors";
import { OccupancyService, type OccupancyInput } from "./occupancy";

/**
 * Scenario identifiers supported by the simulator. [IMPLEMENTATION DECISION]
 */
export type SimulatorScenario =
  | "SINGLE_ENTRY"
  | "SINGLE_EXIT"
  | "MULTIPLE_ENTRIES"
  | "MULTIPLE_EXITS"
  | "FILL_ZONE"
  | "UNKNOWN_VEHICLE"
  | "DUPLICATE_EVENT"
  | "COMPLETE_PARKING_LIFECYCLE";

export const SIMULATOR_SCENARIOS: SimulatorScenario[] = [
  "SINGLE_ENTRY",
  "SINGLE_EXIT",
  "MULTIPLE_ENTRIES",
  "MULTIPLE_EXITS",
  "FILL_ZONE",
  "UNKNOWN_VEHICLE",
  "DUPLICATE_EVENT",
  "COMPLETE_PARKING_LIFECYCLE",
];

export interface ScenarioRequest {
  scenario: SimulatorScenario;
  zoneId?: string;
  /** Registered vehicle ids to use (plates are resolved server-side). */
  vehicleIds?: string[];
  /** Plate for UNKNOWN_VEHICLE (defaults to a deterministic non-registered plate). */
  unknownPlate?: string;
  /** Target occupancy count for FILL_ZONE; defaults to zone capacity. */
  fillTo?: number;
}

/**
 * The PARADA occupancy simulator — a development/demo/operations tool
 * (ADMIN-only). It drives the SAME normalized event pipeline and business
 * logic that real camera/vision events will use: simulated events become
 * `NormalizedVisionEvent` and are submitted through
 * `OccupancyService.processEvent(..., "SIMULATOR")`. It never touches
 * `occupiedCount`, sessions, events, or history directly.
 *
 * The simulator is NOT computer vision. Real OCR is integrated separately
 * (Phase 9); this tool exists to exercise the backend pipeline deterministically.
 */
export class SimulatorService {
  private readonly occupancy: OccupancyService;
  private runs = 0;
  private eventsProcessed = 0;
  private lastRunAt: string | null = null;
  /** Monotonic sequence guaranteeing unique sourceEventIds across every run. */
  private sequence = 0;

  constructor(occupancy: OccupancyService) {
    this.occupancy = occupancy;
  }

  getStatus() {
    return {
      runs: this.runs,
      eventsProcessed: this.eventsProcessed,
      lastRunAt: this.lastRunAt,
      scenarios: SIMULATOR_SCENARIOS,
    };
  }

  /** Resolve the zone's entry and exit cameras (first of each gate type). */
  private async resolveCameras(zoneId: string) {
    const entry = await prisma.camera.findFirst({
      where: { zoneId, gateType: "ENTRY" },
      orderBy: { id: "asc" },
    });
    const exit = await prisma.camera.findFirst({
      where: { zoneId, gateType: "EXIT" },
      orderBy: { id: "asc" },
    });
    return { entry, exit };
  }

  private async resolveZone(zoneId?: string) {
    if (!zoneId) {
      const zone = await prisma.parkingZone.findFirst({ orderBy: { code: "asc" } });
      if (!zone) {
        throw new NotFoundError("No parking zone available to simulate.");
      }
      return zone;
    }
    const zone = await prisma.parkingZone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new NotFoundError(`Zone '${zoneId}' not found.`);
    }
    return zone;
  }

  /** Resolve vehicle ids -> { id, plateNumber } (in the given order). */
  private async resolveVehicles(vehicleIds?: string[]) {
    const ids = vehicleIds ?? [];
    if (ids.length === 0) {
      return [];
    }
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: ids }, status: "ACTIVE" },
    });
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new NotFoundError(`Vehicles not found: ${missing.join(", ")}.`);
    }
    return ids.map((id) => byId.get(id)!);
  }

  private async submit(
    input: {
      cameraIdentifier: string;
      sourceEventId: string;
      eventType: "ENTRY" | "EXIT";
      detectedPlate?: string | null;
      ocrConfidence?: number | null;
    },
    zoneId: string
  ) {
    await this.occupancy.processEvent(
      { zoneId, ...input } as OccupancyInput,
      "SIMULATOR"
    );
    this.eventsProcessed += 1;
  }

  /** Deterministic source-event id for a given scenario run step. */
  private sourceEventId(zoneCode: string, name: string, n: number): string {
    // The leading sequence value keeps ids unique even when a scenario is
    // re-run against the same zone/camera (e.g. FILL_ZONE twice in a test).
    this.sequence += 1;
    return `sim-${zoneCode}-${name}-${this.sequence}-${n}`;
  }

  async runScenario(request: ScenarioRequest) {
    const zone = await this.resolveZone(request.zoneId);
    const { entry, exit } = await this.resolveCameras(zone.id);
    if (!entry || !exit) {
      throw new BadRequestError(
        `Zone '${zone.code}' must have both an ENTRY and an EXIT camera to simulate.`
      );
    }

    const vehicles = await this.resolveVehicles(request.vehicleIds);
    const events: Record<string, unknown>[] = [];
    const rejects: { sourceEventId: string; message: string }[] = [];
    const code = zone.code;

    const entryEvent = (
      plate: string,
      n: number,
      sourceId = this.sourceEventId(code, "entry", n)
    ) => ({
      cameraIdentifier: entry.identifier,
      sourceEventId: sourceId,
      eventType: "ENTRY" as const,
      detectedPlate: plate,
      ocrConfidence: 0.98,
    });

    const exitEvent = (
      plate: string,
      n: number,
      sourceId = this.sourceEventId(code, "exit", n)
    ) => ({
      cameraIdentifier: exit.identifier,
      sourceEventId: sourceId,
      eventType: "EXIT" as const,
      detectedPlate: plate,
      ocrConfidence: 0.98,
    });

    switch (request.scenario) {
      case "SINGLE_ENTRY": {
        if (vehicles.length < 1) {
          throw new BadRequestError("SINGLE_ENTRY requires at least one vehicleId.");
        }
        const v = vehicles[0]!;
        const body = entryEvent(v.plateNumber, 1);
        await this.submit(body, zone.id);
        const session = await this.findSessionFor(zone.id, v.id);
        events.push({ kind: "ENTRY", event: body, session });
        break;
      }

      case "SINGLE_EXIT": {
        if (vehicles.length < 1) {
          throw new BadRequestError("SINGLE_EXIT requires at least one vehicleId.");
        }
        const v = vehicles[0]!;
        await this.submit(exitEvent(v.plateNumber, 1), zone.id);
        const session = await this.findSessionFor(zone.id, v.id);
        events.push({ kind: "EXIT", event: exitEvent(v.plateNumber, 1), session });
        break;
      }

      case "MULTIPLE_ENTRIES": {
        for (let i = 0; i < Math.max(1, vehicles.length); i++) {
          const v = vehicles[i % Math.max(1, vehicles.length)]!;
          const body = entryEvent(v.plateNumber, i + 1);
          try {
            await this.submit(body, zone.id);
            events.push({ kind: "ENTRY", event: body });
          } catch (err) {
            rejects.push({ sourceEventId: body.sourceEventId, message: (err as Error).message });
          }
        }
        break;
      }

      case "MULTIPLE_EXITS": {
        for (let i = 0; i < Math.max(1, vehicles.length); i++) {
          const v = vehicles[i % Math.max(1, vehicles.length)]!;
          const body = exitEvent(v.plateNumber, i + 1);
          try {
            await this.submit(body, zone.id);
            events.push({ kind: "EXIT", event: body });
          } catch (err) {
            rejects.push({ sourceEventId: body.sourceEventId, message: (err as Error).message });
          }
        }
        break;
      }

      case "FILL_ZONE": {
        const fillTo = Math.min(request.fillTo ?? zone.capacity, zone.capacity);
        let occupied = (await this.currentOccupancy(zone.id)).occupiedCount;
        let n = 1;
        // Use provided registered vehicles first, then pad with unknown plates
        // until the zone is full. Each ENTRY goes through the same pipeline.
        const plates = vehicles.map((v) => v.plateNumber);
        while (occupied < fillTo && n <= plates.length) {
          const body = entryEvent(plates[n - 1]!, n, this.sourceEventId(code, "fill", n));
          await this.submit(body, zone.id);
          events.push({ kind: "ENTRY", event: body });
          occupied += 1;
          n += 1;
        }
        let pad = 1;
        while (occupied < fillTo) {
          const body = entryEvent(
            `SIM-UNKNOWN-${pad}`,
            n,
            this.sourceEventId(code, "fillpad", n)
          );
          await this.submit(body, zone.id);
          events.push({ kind: "ENTRY", event: body, freshPlate: `SIM-UNKNOWN-${pad}` });
          occupied += 1;
          n += 1;
          pad += 1;
        }
        // Prove the existing full-zone rejection behavior still applies.
        const overload = entryEvent("SIM-UNKNOWN-OVERFLOW", n, this.sourceEventId(code, "fillover", n));
        try {
          await this.submit(overload, zone.id);
          events.push({ kind: "ENTRY", event: overload });
        } catch (err) {
          rejects.push({ sourceEventId: overload.sourceEventId, message: (err as Error).message });
        }
        break;
      }

      case "UNKNOWN_VEHICLE": {
        const plate = request.unknownPlate ?? "ZZZ-UNKNOWN-1";
        const body = entryEvent(plate, 1);
        await this.submit(body, zone.id);
        const anomaly = await prisma.occupancyAnomaly.findFirst({
          where: { detectedPlate: plate },
          orderBy: { createdAt: "desc" },
        });
        events.push({ kind: "ENTRY", event: body, unknownPlate: plate, anomaly });
        break;
      }

      case "DUPLICATE_EVENT": {
        if (vehicles.length < 1) {
          throw new BadRequestError("DUPLICATE_EVENT requires at least one vehicleId.");
        }
        const v = vehicles[0]!;
        const sourceId = this.sourceEventId(code, "dup", 1);
        const body = entryEvent(v.plateNumber, 1, sourceId);
        await this.submit(body, zone.id);
        events.push({ kind: "ENTRY", event: body });
        try {
          await this.submit(body, zone.id);
          events.push({ kind: "ENTRY_RETRY", event: body, duplicateRejected: false });
        } catch (err) {
          rejects.push({ sourceEventId: sourceId, message: (err as Error).message });
        }
        break;
      }

      case "COMPLETE_PARKING_LIFECYCLE": {
        if (vehicles.length < 1) {
          throw new BadRequestError("COMPLETE_PARKING_LIFECYCLE requires at least one vehicleId.");
        }
        const v = vehicles[0]!;
        const entryBody = entryEvent(v.plateNumber, 1);
        const exitBody = exitEvent(v.plateNumber, 1);
        await this.submit(entryBody, zone.id);
        await this.submit(exitBody, zone.id);
        const session = await this.findSessionFor(zone.id, v.id);
        events.push({ kind: "ENTRY", event: entryBody });
        events.push({ kind: "EXIT", event: exitBody });
        events.push({
          kind: "PARKING_SESSION",
          session: {
            id: session?.id ?? null,
            status: session?.status ?? null,
            enteredAt: session?.enteredAt ?? null,
            exitedAt: session?.exitedAt ?? null,
            durationSeconds: session?.durationSeconds ?? null,
          },
        });
        break;
      }

      default:
        throw new BadRequestError(
          `Unknown scenario '${String(request.scenario)}'. Supported: ${SIMULATOR_SCENARIOS.join(", ")}.`
        );
    }

    this.runs += 1;
    this.lastRunAt = new Date().toISOString();

    return {
      scenario: request.scenario,
      zone: { id: zone.id, name: zone.name, code: zone.code, capacity: zone.capacity },
      events,
      rejects,
      occupancy: await this.currentOccupancy(zone.id),
    };
  }

  private async currentOccupancy(zoneId: string) {
    const zone = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zoneId } });
    return {
      occupiedCount: zone.occupiedCount,
      availableCount: zone.capacity - zone.occupiedCount,
    };
  }

  private async findSessionFor(zoneId: string, vehicleId: string) {
    return prisma.parkingSession.findFirst({
      where: { zoneId, vehicleId },
      orderBy: { enteredAt: "desc" },
      select: {
        id: true,
        status: true,
        enteredAt: true,
        exitedAt: true,
        durationSeconds: true,
      },
    });
  }
}