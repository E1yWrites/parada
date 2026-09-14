import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { healthRouter } from "./routes/health";
import { zonesRouter } from "./routes/zones";
import { eventsRouter } from "./routes/events";
import { authRouter } from "./routes/auth";
import { vehiclesRouter } from "./routes/vehicles";
import { sessionsRouter } from "./routes/sessions";
import { reservationsRouter } from "./routes/reservations";
import { assignmentsRouter } from "./routes/assignments";
import { adminRouter } from "./routes/admin";
import { violationsRouter } from "./routes/violations";
import { notificationsRouter } from "./routes/notifications";
import { ViolationService } from "./domain/violations";
import { OccupancyService } from "./domain/occupancy";
import { SimulatorService } from "./domain/simulator";
import { AuthService } from "./domain/auth";
import { ConfigService } from "./domain/config";
import { ZoneService } from "./domain/zones";
import { AssignmentService } from "./domain/assignment";
import { ReservationService } from "./domain/reservation";
import { ParkingSessionService } from "./domain/sessions";
import { loadEnv } from "./config/env";
import { createAuthMiddleware } from "./middleware/auth";
import { HttpError, InternalError } from "./http/errors";
import { errorBody } from "./http/response";
import { simulatorRouter } from "./routes/simulator";
import { RealtimeHub } from "./realtime/hub";
import { realtimeRouter } from "./routes/realtime";
import { AccountService } from "./domain/account";
import { usersRouter } from "./routes/users";
import { createMailerFromEnv, type Mailer } from "./mail/mailer";

export interface AppOptions {
  occupancy?: OccupancyService;
  auth?: AuthService;
  config?: ConfigService;
  assignments?: AssignmentService;
  /** Camera/vision service API key. If set, POST /zones/:id/events requires it. */
  cameraApiKey?: string | null;
  /** OCR confidence below which a detected plate is not trusted as identity. */
  ocrPlateConfidenceThreshold?: number;
  /** Override the credential-endpoint rate limit (defaults to env). */
  authRateLimit?: { limit: number; windowMs: number };
  /** Override the camera-event rate limit (defaults to env). */
  cameraEventRateLimit?: { limit: number; windowMs: number };
  /** Override the admin-mutation rate limit (defaults to env). */
  adminRateLimit?: { limit: number; windowMs: number };
  realtimeHub?: RealtimeHub;
  /** Outbound mail transport (defaults to the env-configured one). Ignored when `auth` is supplied. */
  mailer?: Mailer;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const env = loadEnv();

  const config = options.config ?? new ConfigService();
  const realtimeHub = options.realtimeHub ?? new RealtimeHub();
  const assignmentService = options.assignments ?? new AssignmentService(config);

  const reservationService = new ReservationService(config);
  const violationService = new ViolationService(config);

  const occupancy = options.occupancy ?? new OccupancyService({
    ocrPlateConfidenceThreshold:
      options.ocrPlateConfidenceThreshold ?? env.ocrPlateConfidenceThreshold,
    config,
    assignments: assignmentService,
    reservations: reservationService,
    violations: violationService,
  });

  const auth =
    options.auth ??
    new AuthService(
      {
        secret: env.jwtSecret,
        issuer: env.jwtIssuer,
        expiresIn: env.jwtExpiresIn,
      },
      {
        mailer: options.mailer ?? createMailerFromEnv(env.mail, env.nodeEnv),
        appName: env.appName,
        mobileScheme: env.mobileScheme,
      }
    );
  const accountService = new AccountService({
    mailer: auth.mailer,
    verification: auth.verification,
    appName: env.appName,
  });

  app.use(express.json());

  app.use(healthRouter());

  const authMiddleware = createAuthMiddleware(auth["tokens"], auth);

  app.use(
    "/auth",
    authRouter(auth, authMiddleware, {
      rateLimit: options.authRateLimit ?? {
        limit: env.authRateLimitPerMinute,
        windowMs: 60_000,
      },
      account: accountService,
      realtimeHub,
    })
  );

  const zones = zonesRouter(occupancy, new ZoneService(), config, authMiddleware);
  const events = eventsRouter(occupancy, {
    cameraApiKey: options.cameraApiKey !== undefined ? options.cameraApiKey : env.cameraApiKey,
    rateLimit: options.cameraEventRateLimit ?? {
      limit: env.cameraEventRateLimitPerMinute,
      windowMs: 60_000,
    },
    realtimeHub,
  });
  app.use(zones);
  app.use(events);

  app.use(authMiddleware);
  app.use(realtimeRouter(realtimeHub));
  app.use(usersRouter(accountService));

  const sessionService = new ParkingSessionService(config, assignmentService, reservationService);

  const vehicles = vehiclesRouter();
  const sessions = sessionsRouter(sessionService, realtimeHub);
  const reservations = reservationsRouter(reservationService, realtimeHub);
  const assignments = assignmentsRouter(assignmentService, realtimeHub);
  const admin = adminRouter({
    occupancy,
    config,
    reservations: reservationService,
    violations: violationService,
    rateLimit: options.adminRateLimit ?? {
      limit: env.adminRateLimitPerMinute,
      windowMs: 60_000,
    },
    realtimeHub,
  });
  app.use(vehicles);
  app.use(sessions);
  app.use(reservations);
  app.use(assignments);
  app.use(violationsRouter(violationService, realtimeHub));
  app.use(notificationsRouter());
  app.use(admin);

  const simulator = new SimulatorService(occupancy);
  app.use(simulatorRouter(simulator, realtimeHub));

  app.use((_req: Request, res: Response) => {
    res.status(404).json(errorBody({ code: "NOT_FOUND", message: "Route not found." }));
  });

  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof HttpError) {
        res.status(err.status).json(errorBody({ code: err.code, message: err.message, details: err.details }));
        return;
      }
      // body-parser failures (malformed JSON, oversized body) are client
      // errors, not server faults: report them as such instead of a 500.
      const parseErr = err as { type?: string; status?: number } | null;
      if (parseErr && typeof parseErr.type === "string" && parseErr.type.startsWith("entity.")) {
        const tooLarge = parseErr.type === "entity.too.large";
        res
          .status(tooLarge ? 413 : 400)
          .json(
            errorBody({
              code: tooLarge ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
              message: tooLarge ? "The request body is too large." : "The request body could not be parsed.",
            })
          );
        return;
      }
      const internal = new InternalError();
      console.error("[api] unhandled error:", err);
      res.status(internal.status).json(errorBody({ code: internal.code, message: internal.message }));
    }
  );

  return app;
}