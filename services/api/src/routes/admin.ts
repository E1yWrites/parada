import { Router } from "express";
import { ok } from "../http/response";
import { BadRequestError, NotFoundError } from "../http/errors";
import { asyncHandler } from "../http/asyncHandler";
import { prisma, type Prisma, type ViolationStatus } from "@parada/database";
import { requireRole, currentAuth } from "../middleware/auth";
import { availabilityOf } from "../domain/availability";
import type { OccupancyService } from "../domain/occupancy";
import type { ConfigService } from "../domain/config";
import type { ReservationService } from "../domain/reservation";
import type { ViolationService } from "../domain/violations";
import { ZoneConfigService } from "../domain/zoneConfig";
import { rateLimit } from "../http/rateLimit";
import type { RealtimeHub } from "../realtime/hub";
import { publishOccupancyOutcome, publishZoneSnapshot, withoutNotifications } from "../realtime/occupancyEvents";

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

export function adminRouter(deps: {
  occupancy: OccupancyService;
  config?: ConfigService;
  reservations?: ReservationService;
  violations?: ViolationService;
  zoneConfig?: ZoneConfigService;
  rateLimit?: { limit: number; windowMs: number };
  realtimeHub?: RealtimeHub;
}): Router {
  const router = Router();
  const zoneConfig = deps.zoneConfig ?? new ZoneConfigService({ reservations: deps.reservations });

  router.use(requireRole("ADMIN"));

  // Mutation surfaces (POST/PATCH/PUT/DELETE) are budgeted per authenticated
  // admin. Reads (dashboard polling, list views) are not rate-limited so a
  // busy control plane keeps refreshing. Only requests that already passed
  // role authorization consume the budget, so unauthenticated noise cannot
  // starve a legitimate admin.
  const adminMutationLimit = rateLimit({
    ...(deps.rateLimit ?? { limit: 120, windowMs: 60_000 }),
    keyFor: (_req, res) => `admin:${currentAuth(res).id}`,
  });
  router.use((req, res, next) => {
    if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE") {
      adminMutationLimit(req, res, next);
      return;
    }
    next();
  });

  router.get(
    "/admin/reservations",
    asyncHandler(async (_req, res) => {
      if (!deps.reservations) throw new NotFoundError("Reservation service unavailable.");
      res.json(ok(await deps.reservations.adminList()));
    })
  );

  router.patch(
    "/admin/reservations/:id/cancel",
    asyncHandler(async (req, res) => {
      if (!deps.reservations) throw new NotFoundError("Reservation service unavailable.");
      const updated = await deps.reservations.adminCancel(req.params["id"]!);
      deps.realtimeHub?.publish(
        { type: "RESERVATION_CANCELLED", occurredAt: new Date().toISOString(), payload: updated },
        { audience: "USER", userId: updated.userId }
      );
      res.json(ok(updated));
    })
  );

  router.get(
    "/admin/violations",
    asyncHandler(async (_req, res) => {
      const violations = await prisma.violation.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
          zone: { select: { id: true, name: true, code: true } },
          session: { select: { id: true, zoneId: true, enteredAt: true, exitedAt: true, status: true } },
          appeal: true,
        },
      });
      res.json(ok(violations));
    })
  );

  router.patch(
    "/admin/violations/:id/status",
    asyncHandler(async (req, res) => {
      const status = req.body?.["status"];
      if (!["PENDING", "APPEALED", "UPHELD", "DISMISSED", "FINE_PAID"].includes(status)) {
        throw new BadRequestError("Invalid violation status.");
      }
      if (!deps.violations) throw new NotFoundError("Violation service unavailable.");
      // The domain state machine decides whether this transition is legal; the
      // route holds no transition logic and never trusts a body reviewer id.
      const updated = await deps.violations.adminUpdateStatus(req.params["id"]!, status as ViolationStatus);
      res.json(ok(updated));
    })
  );

  router.get(
    "/admin/appeals",
    asyncHandler(async (_req, res) => {
      const appeals = await prisma.violationAppeal.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          violation: { include: { zone: { select: { id: true, name: true, code: true } }, vehicle: { select: { id: true, plateNumber: true } } } },
        },
      });
      res.json(ok(appeals));
    })
  );

  router.patch(
    "/admin/appeals/:id/status",
    asyncHandler(async (req, res) => {
      const status = req.body?.["status"];
      if (status !== "APPROVED" && status !== "REJECTED") throw new BadRequestError("Appeal status must be APPROVED or REJECTED.");
      if (!deps.violations) throw new NotFoundError("Violation service unavailable.");
      // Goes through the service so the violation status is settled and the
      // driver is notified of the outcome in the same transaction.
      const { appeal, notification } = await deps.violations.review(req.params["id"]!, status, currentAuth(res).id);
      deps.realtimeHub?.publish(
        {
          type: "NOTIFICATION_CREATED",
          occurredAt: new Date().toISOString(),
          payload: {
            id: notification.id,
            zoneId: notification.zoneId,
            userId: notification.userId,
            type: notification.type,
            message: notification.message,
            targetRole: notification.targetRole,
            createdAt: notification.createdAt.toISOString(),
          },
        },
        { audience: "USER", userId: notification.userId! }
      );
      res.json(ok(appeal));
    })
  );

  router.get(
    "/admin/config",
    asyncHandler(async (_req, res) => {
      if (!deps.config) throw new NotFoundError("Configuration service unavailable.");
      res.json(ok(await deps.config.getEstablishmentSettings()));
    })
  );

  router.put(
    "/admin/config",
    asyncHandler(async (req, res) => {
      if (!deps.config) throw new NotFoundError("Configuration service unavailable.");
      res.json(ok(await deps.config.updateEstablishmentSettings(req.body)));
    })
  );

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
          prisma.camera.groupBy({ by: ["status"], _count: { _all: true } }),
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
              event: {
                select: {
                  zoneId: true,
                  eventType: true,
                  source: true,
                  zone: { select: { code: true } },
                  camera: { select: { identifier: true } },
                },
              },
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

      const onlineCameras = cameraCounts.find((c) => c.status === "ONLINE")?._count._all ?? 0;
      const offlineCameras = cameraCounts.find((c) => c.status === "OFFLINE")?._count._all ?? 0;

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
          recentAnomalies: anomalies.map((a) => ({
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
            eventType: a.event?.eventType ?? null,
            source: a.event?.source ?? null,
          })),
          recentNotifications: notifications,
        })
      );
    })
  );

  router.get(
    "/admin/analytics",
    asyncHandler(async (req, res) => {
      const fromRaw = req.query["from"];
      const toRaw = req.query["to"];
      const from = typeof fromRaw === "string" ? new Date(fromRaw) : new Date(new Date().setHours(0, 0, 0, 0));
      const to = typeof toRaw === "string" ? new Date(toRaw) : new Date();
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new BadRequestError("'from' and 'to' must be valid ordered dates.");
      const [zones, sessions, fees, reservations, violations] = await Promise.all([
        prisma.parkingZone.findMany({ select: { id: true, code: true, capacity: true, occupiedCount: true } }),
        prisma.parkingSession.findMany({ where: { enteredAt: { gte: from, lte: to } }, select: { status: true, durationSeconds: true, enteredAt: true } }),
        prisma.parkingFee.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { amount: true, status: true } }),
        prisma.reservation.count({ where: { createdAt: { gte: from, lte: to } } }),
        prisma.violation.count({ where: { createdAt: { gte: from, lte: to } } }),
      ]);
      const completed = sessions.filter((session) => session.status === "COMPLETED");
      const durations = completed.map((session) => session.durationSeconds).filter((duration): duration is number => duration !== null);
      const peakHours = new Map<number, number>();
      for (const session of sessions) peakHours.set(session.enteredAt.getHours(), (peakHours.get(session.enteredAt.getHours()) ?? 0) + 1);
      const peak = [...peakHours.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
      res.json(ok({
        from: from.toISOString(),
        to: to.toISOString(),
        current: { occupied: zones.reduce((sum, zone) => sum + zone.occupiedCount, 0), capacity: zones.reduce((sum, zone) => sum + zone.capacity, 0) },
        zones: zones.map((zone) => ({ ...zone, availableCount: Math.max(0, zone.capacity - zone.occupiedCount) })),
        sessions: { total: sessions.length, active: sessions.filter((session) => session.status === "ACTIVE").length, completed: completed.length, averageDurationSeconds: durations.length ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length : 0 },
        peakEntryHour: peak ? { hour: peak[0], sessions: peak[1] } : null,
        revenue: { total: fees.reduce((sum, fee) => sum + fee.amount, 0), paid: fees.filter((fee) => fee.status === "PAID").reduce((sum, fee) => sum + fee.amount, 0), fees: fees.length },
        reservations,
        violations,
      }));
    })
  );

  router.get(
    "/admin/zones",
    asyncHandler(async (_req, res) => {
      res.json(ok(await zoneConfig.listZones()));
    })
  );

  router.post(
    "/admin/zones",
    asyncHandler(async (req, res) => {
      const created = await zoneConfig.createZone(req.body);
      res.status(201).json(ok(created));
    })
  );

  router.patch(
    "/admin/zones/:id",
    asyncHandler(async (req, res) => {
      const updated = await zoneConfig.updateZone(req.params["id"]!, req.body);
      // Capacity/status edits change availability without an occupancy
      // event, so push the committed snapshot to every zone consumer.
      if (deps.realtimeHub) {
        await publishZoneSnapshot(deps.realtimeHub, updated.id);
      }
      res.json(ok(updated));
    })
  );

  router.get(
    "/admin/zones/:id/slots",
    asyncHandler(async (req, res) => {
      res.json(ok(await zoneConfig.listSlots(req.params["id"]!)));
    })
  );

  router.post(
    "/admin/zones/:id/slots",
    asyncHandler(async (req, res) => {
      const slots = await zoneConfig.setSlots(req.params["id"]!, req.body);
      res.status(201).json(ok(slots));
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

  router.post(
    "/admin/cameras",
    asyncHandler(async (req, res) => {
      const created = await zoneConfig.createCamera(req.body);
      res.status(201).json(ok(created));
    })
  );

  router.patch(
    "/admin/cameras/:id",
    asyncHandler(async (req, res) => {
      const updated = await zoneConfig.updateCamera(req.params["id"]!, req.body);
      res.json(ok(updated));
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
              zone: { select: { code: true } },
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
            eventType: a.event?.eventType ?? null,
            source: a.event?.source ?? null,
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
    "/admin/vehicles",
    asyncHandler(async (_req, res) => {
      const vehicles = await prisma.vehicle.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          plateNumber: true,
          normalizedPlate: true,
          vehicleType: true,
          status: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: [{ plateNumber: "asc" }],
      });
      res.json(ok(vehicles));
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

      const fromParam = req.query["from"];      const toParam = req.query["to"];
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

  /**
   * ADMIN-only: explicitly admit a guest (unknown / low-confidence plate) under
   * the guest admission policy, bypassing the camera policy denial. This is
   * auditable (GUEST_ADMIN_OVERRIDE anomaly + notification) and does NOT trust
   * any userId in the request body — the acting admin is read from the token.
   */
  router.post(
    "/admin/guest-admit",
    asyncHandler(async (req, res) => {
      const adminId = currentAuth(res).id;
      const zoneIdRaw = req.body?.["zoneId"];
      const cameraIdentifier = req.body?.["cameraIdentifier"];
      const detectedPlate = req.body?.["detectedPlate"] ?? null;
      const eventType = req.body?.["eventType"] ?? "ENTRY";

      if (typeof zoneIdRaw !== "string" || typeof cameraIdentifier !== "string") {
        throw new BadRequestError("'zoneId' and 'cameraIdentifier' are required.");
      }
      if (eventType !== "ENTRY") {
        throw new BadRequestError("'eventType' must be 'ENTRY'.");
      }
      if (typeof req.body?.["sourceEventId"] !== "string" || req.body["sourceEventId"].length === 0) {
        throw new BadRequestError("'sourceEventId' (string) is required.");
      }
      if (
        req.body?.["detectedAt"] !== undefined &&
        req.body?.["detectedAt"] !== null &&
        (typeof req.body["detectedAt"] !== "string" || Number.isNaN(new Date(req.body["detectedAt"]).getTime()))
      ) {
        throw new BadRequestError("'detectedAt' must be a valid ISO date string.");
      }

      const result = await deps.occupancy.processEvent(
        {
          zoneId: zoneIdRaw,
          cameraIdentifier,
          sourceEventId: req.body["sourceEventId"],
          eventType,
          detectedPlate: typeof detectedPlate === "string" ? detectedPlate : null,
          detectedAt: typeof req.body?.["detectedAt"] === "string" ? req.body["detectedAt"] : null,
        },
        "CAMERA",
        { overrideAdminUserId: adminId }
      );

      // An admitted guest changes occupancy exactly like a camera event, so the
      // same post-commit realtime fan-out applies (zone snapshot, admission
      // decision, notifications). The pipeline's `notifications` list is
      // realtime-only and is not part of the wire response.
      if (deps.realtimeHub) {
        await publishOccupancyOutcome(deps.realtimeHub, zoneIdRaw, result);
      }

      res.status(201).json(ok(withoutNotifications(result)));
    })
  );

  return router;
}
