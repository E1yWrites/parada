import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 5 types every route param as `string | string[]` because wildcard
// segments (`*name`) yield arrays. This API declares only named `:param`
// segments, so every value is a single string.
type NamedParamsRequest = Request<Record<string, string>>;

export function asyncHandler(
  fn: (req: NamedParamsRequest, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req as NamedParamsRequest, res, next).catch(next);
  };
}
