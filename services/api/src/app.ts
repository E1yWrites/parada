import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { healthRouter } from "./routes/health";
import { zonesRouter } from "./routes/zones";
import { eventsRouter } from "./routes/events";
import { OccupancyService } from "./domain/occupancy";
import { HttpError, InternalError } from "./http/errors";
import { errorBody } from "./http/response";

export interface AppOptions {
  occupancy?: OccupancyService;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const occupancy = options.occupancy ?? new OccupancyService();

  app.use(express.json());

  app.use(healthRouter());

  const zones = zonesRouter(occupancy);
  const events = eventsRouter(occupancy);
  app.use(zones);
  app.use(events);

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
