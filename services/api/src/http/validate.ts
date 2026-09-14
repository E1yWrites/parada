import { BadRequestError, UnprocessableError } from "./errors";

/**
 * Backend-authoritative input validation for account fields. Mobile/Admin
 * validate for UX only; these are the rules that actually hold.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
// E.164-ish: optional +, 7–15 digits after stripping spaces/dashes/parens.
const PHONE_RE = /^\+?[0-9]{7,15}$/;
const CODE_RE = /^[0-9]{6}$/;
const RESET_TOKEN_RE = /^[a-f0-9]{64}$/;

export function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string") {
    throw new BadRequestError(`'${field}' (string) is required.`);
  }
  return value;
}

/** Trims and lower-cases; rejects anything that is not a plausible address. */
export function validateEmail(raw: unknown, field = "email"): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new BadRequestError(`'${field}' (string) is required.`);
  }
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new UnprocessableError("Enter a valid email address.");
  }
  return email;
}

/** Lower-cases; letters, digits, `.`, `_`, `-`; 3–30 chars; no leading/trailing symbol. */
export function validateUsername(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new BadRequestError("'username' (string) is required.");
  }
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new UnprocessableError(
      "Username must be 3–30 characters: letters, numbers, dots, underscores or dashes."
    );
  }
  return username;
}

/** Keeps a leading `+` and digits only; 7–15 digits. */
export function validatePhone(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new BadRequestError("'phone' (string) is required.");
  }
  const phone = raw.replace(/[\s().-]/g, "");
  if (!PHONE_RE.test(phone)) {
    throw new UnprocessableError("Enter a valid phone number (7–15 digits, optional leading +).");
  }
  return phone;
}

export function validateDisplayName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new BadRequestError("'name' (string) is required.");
  }
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw new UnprocessableError("Name must be 2–80 characters.");
  }
  return name;
}

export function validateCode(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new BadRequestError("'code' (string) is required.");
  }
  const code = raw.trim();
  if (!CODE_RE.test(code)) {
    throw new UnprocessableError("Enter the 6-digit code.");
  }
  return code;
}

export function validateResetToken(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new BadRequestError("'token' (string) is required.");
  }
  const token = raw.trim().toLowerCase();
  if (!RESET_TOKEN_RE.test(token)) {
    throw new UnprocessableError("This reset link is invalid.");
  }
  return token;
}

/** Optional free-text field (vehicle make/model/color): null clears it. */
export function optionalLabel(raw: unknown, field: string, max = 40): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") {
    throw new BadRequestError(`'${field}' must be a string or null.`);
  }
  const value = raw.trim();
  if (value.length === 0) return null;
  if (value.length > max) {
    throw new UnprocessableError(`'${field}' must be at most ${max} characters.`);
  }
  return value;
}

/** WGS84 pair: both null (unset) or both finite numbers in range. */
export function validateCoordinatePair(
  latRaw: unknown,
  lngRaw: unknown
): { navigationLat: number | null; navigationLng: number | null } {
  const latUnset = latRaw === null || latRaw === undefined;
  const lngUnset = lngRaw === null || lngRaw === undefined;
  if (latUnset && lngUnset) {
    return { navigationLat: null, navigationLng: null };
  }
  if (latUnset !== lngUnset) {
    throw new BadRequestError("'navigationLat' and 'navigationLng' must be set together.");
  }
  const lat = typeof latRaw === "number" ? latRaw : Number.NaN;
  const lng = typeof lngRaw === "number" ? lngRaw : Number.NaN;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new UnprocessableError("'navigationLat' must be a number between -90 and 90.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new UnprocessableError("'navigationLng' must be a number between -180 and 180.");
  }
  return { navigationLat: lat, navigationLng: lng };
}
