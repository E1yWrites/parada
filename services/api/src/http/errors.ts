export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Authentication required.") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "You do not have permission to perform this action.") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Resource not found.") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

export class UnprocessableError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(422, "UNPROCESSABLE", message, details);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = "Too many requests. Please wait and try again.", details?: unknown) {
    super(429, "TOO_MANY_REQUESTS", message, details);
  }
}

/** Login refused because the account's email address is not yet verified. */
export class EmailNotVerifiedError extends HttpError {
  constructor(details: unknown) {
    super(403, "EMAIL_NOT_VERIFIED", "Verify your email address to continue.", details);
  }
}

/**
 * A verification code / reset token was rejected. The code tells the client
 * whether asking for a new one is the remedy (`*_EXPIRED`) or the input was
 * simply wrong (`*_INVALID`).
 */
export class VerificationError extends HttpError {
  constructor(code: "CODE_INVALID" | "CODE_EXPIRED" | "TOKEN_INVALID" | "TOKEN_EXPIRED", message: string) {
    super(422, code, message);
  }
}

export class InternalError extends HttpError {
  constructor(message = "An unexpected error occurred.") {
    super(500, "INTERNAL", message);
  }
}
