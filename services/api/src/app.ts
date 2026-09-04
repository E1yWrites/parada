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

export interface AppOptions {
  occupancy?: OccupancyService;
  auth?: AuthService;
  /** Camera/vision service API key. If set, POST /zones/:id/events requires it. */
  cameraApiKey?: string | null;
  /** OCR confidence below which a detected plate is not trusted as identity. */
  ocrPlateConfidenceThreshold?: number;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const env = loadEnv();
  const occupancy = options.occupancy ?? new OccupancyService({
    ocrPlateConfidenceThreshold:
      options.ocrPlateConfidenceThreshold ?? env.ocrPlateConfidenceThreshold,
  });

  const auth = options.auth ?? new AuthService({
    secret: env.jwtSecret,
    issuer: env.jwtIssuer,
    expiresIn: env.jwtExpiresIn,
  });

  app.use(express.json());

  app.use(healthRouter());

  const authMiddleware = createAuthMiddleware(auth["tokens"], auth);

  app.use("/auth", authRouter(auth, authMiddleware));

  const zones = zonesRouter(occupancy, new ZoneService());
  const events = eventsRouter(occupancy, {
    cameraApiKey: options.cameraApiKey !== undefined ? options.cameraApiKey : env.cameraApiKey,
  });
  app.use(zones);
  app.use(events);

  app.use(authMiddleware);

  const config = new ConfigService();
  const assignmentService = new AssignmentService(config);
  const reservationService = new ReservationService(config);
  const sessionService = new ParkingSessionService(config, assignmentService);

  const vehicles = vehiclesRouter();
  const sessions = sessionsRouter(sessionService);
  const reservations = reservationsRouter(reservationService);
  const assignments = assignmentsRouter(assignmentService);
  const admin = adminRouter();
  app.use(vehicles);
  app.use(sessions);
  app.use(reservations);
  app.use(assignments);
  app.use(admin);

  const simulator = new SimulatorService(occupancy);
  app.use(simulatorRouter(simulator));

  app.use((_req: Request, res: Response) => {
    res.status(404).json(errorBody({ code: "NOT_FOUND", message: "Route not found." }));
  });

  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof HttpError) {
        res.status(err.status).json(errorBody({ code: err.code, message: err.message, details: err.details }));
        return;
      }
      const internal = new InternalError();
      console.error("[api] unhandled error:", err);
      res.status(internal.status).json(errorBody({ code: internal.code, message: internal.message }));
    }
  );

  return app;
}