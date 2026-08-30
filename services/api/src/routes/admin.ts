import { Router } from "express";
import { ok } from "../http/response";
import { BadRequestError, NotFoundError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { ZONE_OCCUPANCY_LOW_THRESHOLD } from "@parada/config";
import { prisma } from "@parada/database";
import type { Prisma } from "@parada/database";
import { requireRole } from "../middleware/auth";
import type { OccupancySource, OccupancyEventType } from "@parada/database";

type Availability = "AVAILABLE" | "LOW_AVAILABILITY" | "FULL" | "OFFLINE";

function availabilityOf(
  occupiedCount: number,
  capacity: number,
  zoneStatus: "ACTIVE" | "INACTIVE"
): Availability {
  if (zoneStatus !== "ACTIVE") {
    return "OFFLINE";
  }
  if (capacity <= 0) {
    return "AVAILABLE";
  }
  if (occupiedCount >= capacity) {
    return "FULL";
  }
  const availableFraction = (capacity - occupiedCount) / capacity;
  if (availableFraction <= ZONE_OCCUPANCY_LOW_THRESHOLD) {
    return "LOW_AVAILABILITY";
  }
  return "AVAILABLE";
}

function zoneSummary(z: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  capacity: number;
  occupiedCount: number;
  status: "ACTIVE" | "INACTIVE";
}) {
  const availableCount = Math.max(0, z.capacity - z.occupiedCount);
  return {
    id: z.id,
    name: z.name,
    code: z.code,
    description: z.description,
    capacity: z.capacity,
    occupiedCount: z.occupiedCount,
    availableCount,
    occupancyPct: z.capacity > 0 ? (z.occupiedCount / z.capacity) * 100 : 0,
    status: z.status,
    availability: availabilityOf(z.occupiedCount, z.capacity, z.status),
  };
}

export function adminRouter(): Router {
  const router = Router();

  router.use(requireRole("ADMIN"));

  router.get(
    "/admin/dashboard",
    asyncHandler(async (_req, res) => {
      const zones = (await prisma.parkingZone.findMany({
        orderBy: { code: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          capacity: true,
          occupiedCount: true,
          status: true,
        },
      })).map(zoneSummary);

      const totalCapacity = zones.reduce((s, z) => s + z.capacity, 0);
      const totalOccupied = zones.reduce((s, z) => s + z.occupiedCount, 0);
      const totalAvailable = Math.max(0, totalCapacity - totalOccupied);

      const [activeSessions, cameraCounts, recentEvents, anomalies, notifications] =
        await Promise.all([
          prisma.parkingSession.count({ where: { status: "ACTIVE" } }),
          prisma.camera.groupBy({
            by: ["status"],
            _count: { _all: true },
          }),
          prisma.occupancyEvent.findMany({
            orderBy: { detectedAt: "desc" },
            take: 10,
            select: {
              id: true,
              zoneId: true,
              eventType: true,
              detectedPlate: true,
              source: true,
              detectedAt: true,
            },
          }),
          prisma.occupancyAnomaly.findMany({
            orderBy: { createdAt: "desc" },
            take: 8,
            select: {
              id: true,
              occupancyEventId: true,
              cameraId: true,
              vehicleId: true,
              detectedPlate: true,
              anomalyType: true,
              description: true,
              resolved: true,
              createdAt: true,
            },
          }),
          prisma.notification.findMany({
            orderBy: { createdAt: "desc" },
            take: 8,
            select: {
              id: true,
              zoneId: true,
              type: true,
              message: true,
              targetRole: true,
              read: true,
              createdAt: true,
              zone: { select: { id: true, name: true, code: true } },
            },
          }),
        ]);

      const onlineCameras =
        cameraCounts.find((c) => c.status === "ONLINE")?._count._all ?? 0;
      const offlineCameras =
        cameraCounts.find((c) => c.status === "OFFLINE")?._count._all ?? 0;

      res.json(
        ok({
          summary: {
            totalZones: zones.length,
            totalCapacity,
            totalOccupied,
            totalAvailable,
            occupancyPct: totalCapacity > 0 ? (totalOccupied / totalCapacity) * 100 : 0,
            activeSessions,
            onlineCameras,
            offlineCameras,
          },
          zones,
          lowZones: zones.filter((z) => z.availability === "LOW_AVAILABILITY"),
          fullZones: zones.filter((z) => z.availability === "FULL"),
          recentEvents,
          recentAnomalies: anomalies,
          recentNotifications: notifications,
        })
      );
    })
  );

  router.get(
    "/admin/cameras",
    asyncHandler(async (_req, res) => {
      const cameras = await prisma.camera.findMany({
        orderBy: [{ zoneId: "asc" }, { gateType: "asc" }],
        select: {
          id: true,
          identifier: true,
          name: true,
          location: true,
          gateType: true,
          status: true,
          zone: { select: { id: true, name: true, code: true } },
        },
      });

      const zoneIds = cameras.map((c) => c.zone.id);
      const recent = await prisma.occupancyEvent.findMany({
        where: { zoneId: { in: zoneIds } },
        orderBy: { detectedAt: "desc" },
        take: 200,
        select: {
          id: true,
          cameraId: true,
          eventType: true,
          detectedPlate: true,
          detectedAt: true,
        },
      });
      const byCamera = new Map<string, typeof recent>();
      for (const ev of recent) {
        if (!ev.cameraId) continue;
        const list = byCamera.get(ev.cameraId) ?? [];
        if (list.length < 5) list.push(ev);
        byCamera.set(ev.cameraId, list);
      }

      res.json(
        ok(
          cameras.map((c) => ({
            id: c.id,
            identifier: c.identifier,
            name: c.name,
            location: c.location,
            gateType: c.gateType,
            status: c.status,
            zone: c.zone,
            recentEvents: byCamera.get(c.id) ?? [],
          }))
        )
      );
    })
  );

  router.get(
    "/admin/notifications",
    asyncHandler(async (req, res) => {
      const limitRaw = req.query["limit"];
      let limit = 100;
      if (typeof limitRaw === "string") {
        const parsed = Number(limitRaw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
          throw new BadRequestError("'limit' must be an integer between 1 and 500.");
        }
        limit = parsed;
      }
      const unreadOnly = req.query["unread"] === "true" || req.query["unread"] === "1";

      const notifications = await prisma.notification.findMany({
        where: {
          targetRole: "ADMIN",
          ...(unreadOnly ? { read: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          zoneId: true,
          type: true,
          message: true,
          targetRole: true,
          read: true,
          createdAt: true,
          zone: { select: { id: true, name: true, code: true } },
        },
      });

      const unreadCount = await prisma.notification.count({
        where: { targetRole: "ADMIN", read: false },
      });

      res.json(ok({ notifications, unreadCount }));
    })
  );

  router.patch(
    "/admin/notifications/:id/read",
    asyncHandler(async (req, res) => {
      const id = req.params["id"]!;
      const existing = await prisma.notification.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Notification not found.");
      }
      const updated = await prisma.notification.update({
        where: { id },
        data: { read: true },
        select: {
          id: true,
          zoneId: true,
          type: true,
          message: true,
          targetRole: true,
          read: true,
          createdAt: true,
          zone: { select: { id: true, name: true, code: true } },
        },
      });
      res.json(ok(updated));
    })
  );

  router.get(
    "/admin/anomalies",
    asyncHandler(async (req, res) => {
      const limitRaw = req.query["limit"];
      let limit = 100;
      if (typeof limitRaw === "string") {
        const parsed = Number(limitRaw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
          throw new BadRequestError("'limit' must be an integer between 1 and 500.");
        }
        limit = parsed;
      }

      const where: Prisma.OccupancyAnomalyWhereInput = {};
      const resolvedRaw = req.query["resolved"];
      if (typeof resolvedRaw === "string") {
        if (resolvedRaw === "true" || resolvedRaw === "1") where.resolved = true;
        else if (resolvedRaw === "false" || resolvedRaw === "0") where.resolved = false;
        else throw new BadRequestError("'resolved' must be 'true' or 'false'.");
      }
      const typeRaw = req.query["type"];
      if (typeof typeRaw === "string" && typeRaw.length > 0) where.anomalyType = typeRaw;

      const anomalies = await prisma.occupancyAnomaly.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          occupancyEventId: true,
          cameraId: true,
          vehicleId: true,
          detectedPlate: true,
          anomalyType: true,
          description: true,
          resolved: true,
          createdAt: true,
          event: {
            select: {
              id: true,
              zoneId: true,
              eventType: true,
              source: true,
              zone: { select: { id: true, name: true, code: true } },
              camera: { select: { identifier: true } },
            },
          },
        },
      });

      res.json(
        ok(
          anomalies.map((a) => ({
            id: a.id,
            occupancyEventId: a.occupancyEventId,
            cameraId: a.cameraId,
            vehicleId: a.vehicleId,
            detectedPlate: a.detectedPlate,
            anomalyType: a.anomalyType,
            description: a.description,
            resolved: a.resolved,
            createdAt: a.createdAt,
            zoneId: a.event?.zoneId ?? null,
            zoneCode: a.event?.zone.code ?? null,
            cameraIdentifier: a.event?.camera?.identifier ?? null,
            eventType: (a.event?.eventType as OccupancyEventType | null) ?? null,
            source: (a.event?.source as OccupancySource | null) ?? null,
          }))
        )
      );
    })
  );

  router.get(
    "/admin/zones",
    asyncHandler(async (_req, res) => {
      const zones = await prisma.parkingZone.findMany({
        orderBy: { code: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          capacity: true,
          occupiedCount: true,
          status: true,
          cameras: {
            select: {
              id: true,
              identifier: true,
              name: true,
              gateType: true,
              status: true,
            },
          },
        },
      });
      res.json(
        ok(
          zones.map((z) => ({
            ...zoneSummary(z),
            cameras: z.cameras,
            entryCamera:
              z.cameras.find((c) => c.gateType === "ENTRY") ?? null,
            exitCamera:
              z.cameras.find((c) => c.gateType === "EXIT") ?? null,
          }))
        )
      );
    })
  );

  router.get(
    "/admin/sessions",
    asyncHandler(async (req, res) => {
      const statusRaw = req.query["status"];
      if (statusRaw !== undefined && statusRaw !== "ACTIVE" && statusRaw !== "COMPLETED") {
        throw new BadRequestError("'status' must be 'ACTIVE' or 'COMPLETED'.");
      }
      const zoneId = req.query["zoneId"];
      const limitRaw = req.query["limit"];
      let limit = 200;
      if (typeof limitRaw === "string") {
        const parsed = Number(limitRaw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
          throw new BadRequestError("'limit' must be an integer between 1 and 1000.");
        }
        limit = parsed;
      }

      const sessions = await prisma.parkingSession.findMany({
        where: {
          ...(typeof statusRaw === "string" ? { status: statusRaw as "ACTIVE" | "COMPLETED" } : {}),
          ...(typeof zoneId === "string" && zoneId.length > 0 ? { zoneId } : {}),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          zone: { select: { id: true, name: true, code: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          entryEvent: { select: { id: true, detectedAt: true } },
          exitEvent: { select: { id: true, detectedAt: true } },
        },
        orderBy: { enteredAt: "desc" },
        take: limit,
      });
      res.json(ok(sessions));
    })
  );

  router.get(
    "/admin/users",
    asyncHandler(async (_req, res) => {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          _count: { select: { vehicles: true, sessions: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json(ok(users));
    })
  );

  router.get(
    "/admin/zones/:zoneId/history",
    asyncHandler(async (req, res) => {
      const zoneId = req.params["zoneId"]!;

      const zone = await prisma.parkingZone.findUnique({ where: { id: zoneId } });
      if (!zone) {
        throw new NotFoundError(`Zone '${zoneId}' not found.`);
      }

      const fromParam = req.query["from"];
      const toParam = req.query["to"];
      let from: Date | undefined;
      let to: Date | undefined;

      if (typeof fromParam === "string") {
        from = new Date(fromParam);
        if (Number.isNaN(from.getTime())) {
          throw new BadRequestError("'from' must be a valid ISO date.");
        }
      }
      if (typeof toParam === "string") {
        to = new Date(toParam);
        if (Number.isNaN(to.getTime())) {
          throw new BadRequestError("'to' must be a valid ISO date.");
        }
      }

      const limitRaw = req.query["limit"];
      let limit = 100;
      if (typeof limitRaw === "string") {
        const parsed = Number(limitRaw);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
          throw new BadRequestError("'limit' must be an integer between 1 and 1000.");
        }
        limit = parsed;
      }

      const history = await prisma.occupancyHistory.findMany({
        where: { zoneId, occurredAt: { gte: from, lte: to } },
        orderBy: { occurredAt: "asc" },
        take: limit,
        select: { id: true, occurredAt: true, occupiedCount: true, availableCount: true },
      });

      res.json(
        ok({
          zone: {
            id: zone.id,
            name: zone.name,
            code: zone.code,
            capacity: zone.capacity,
          },
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
          limit,
          entries: history,
        })
      );
    })
  );

  return router;
}
