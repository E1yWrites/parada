import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { healthRouter } from "./routes/health";
import { zonesRouter } from "./routes/zones";
import { eventsRouter } from "./routes/events";
import { authRouter } from "./routes/auth";
import { vehiclesRouter } from "./routes/vehicles";
import { sessionsRouter } from "./routes/sessions";
import { adminRouter } from "./routes/admin";
import { OccupancyService } from "./domain/occupancy";
import { AuthService } from "./domain/auth";
import { loadEnv } from "./config/env";
import { createAuthMiddleware } from "./middleware/auth";
import { HttpError, InternalError } from "./http/errors";
import { errorBody } from "./http/response";

export interface AppOptions {
  occupancy?: OccupancyService;
  auth?: AuthService;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const occupancy = options.occupancy ?? new OccupancyService();

  const env = loadEnv();
  const auth = options.auth ?? new AuthService({
    secret: env.jwtSecret,
    issuer: env.jwtIssuer,
    expiresIn: env.jwtExpiresIn,
  });

  app.use(express.json());

  app.use(healthRouter());

  const authMiddleware = createAuthMiddleware(auth["tokens"], auth);

  app.use("/auth", authRouter(auth, authMiddleware));

  const zones = zonesRouter(occupancy);
  const events = eventsRouter(occupancy);
  app.use(zones);
  app.use(events);

  app.use(authMiddleware);

  const vehicles = vehiclesRouter();
  const sessions = sessionsRouter();
  const admin = adminRouter();
  app.use(vehicles);
  app.use(sessions);
  app.use(admin);

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