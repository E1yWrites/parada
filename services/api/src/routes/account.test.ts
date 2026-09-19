/**
 * Pre-audit remediation — account lifecycle, vehicle lifecycle, assignment
 * cancellation and zone navigation coordinates.
 *
 * Runs against the real parada_test_api database with the in-memory mail
 * transport, so every code/token read here is the one the API actually
 * issued and stored (hashed).
 */
import request from "supertest";
import * as argon2 from "argon2";
import { prisma } from "@parada/database";
import { createApp } from "../app";
import { AuthService } from "../domain/auth";
import { VerificationService, CODE_MAX_ATTEMPTS } from "../domain/verification";
import { MemoryMailer } from "../mail/mailer";
import { RealtimeHub, type RealtimeClient } from "../realtime/hub";

const TABLES = [
  "verification_tokens",
  "user_avatars",
  "guest_sessions",
  "violation_appeals",
  "violations",
  "parking_fees",
  "reservations",
  "zone_assignments",
  "occupancy_anomalies",
  "occupancy_history",
  "notifications",
  "parking_sessions",
  "occupancy_events",
  "parking_slots",
  "cameras",
  "vehicles",
  "users",
  "parking_zones",
  "establishment_config",
  "revoked_tokens",
];

async function cleanDatabase() {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }
}

const TOKEN_CONFIG = { secret: "test-secret-key-for-testing-only-32chars", issuer: "parada-api-test", expiresIn: "1d" };
const PASSWORD = "Password123!";

/** Movable clock so expiry / cooldown are tested without sleeping. */
let now = new Date("2026-09-14T08:00:00.000Z");
const clock = () => now;
const advance = (ms: number) => {
  now = new Date(now.getTime() + ms);
};

const mailer = new MemoryMailer();
const verification = new VerificationService(TOKEN_CONFIG.secret, clock);
const auth = new AuthService(TOKEN_CONFIG, { mailer, verification, clock });
const hub = new RealtimeHub();
const app = createApp({ auth, realtimeHub: hub, authRateLimit: { limit: 1000, windowMs: 60_000 } });

const codeIn = (text: string | undefined) => text?.match(/\b(\d{6})\b/)?.[1];
const tokenIn = (text: string | undefined) => text?.match(/token=([a-f0-9]{64})/)?.[1];

async function register(email: string, name = "Driver") {
  return request(app).post("/auth/register").send({ name, email, password: PASSWORD }).expect(201);
}

async function verify(email: string) {
  const code = codeIn(mailer.lastTo(email)?.text);
  expect(code).toBeDefined();
  return request(app).post("/auth/verify-email").send({ email, code }).expect(200);
}

async function login(email: string, password = PASSWORD): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password }).expect(200);
  return res.body.data.token as string;
}

/** Registered + verified + signed-in driver. */
async function driver(email: string): Promise<{ token: string; id: string }> {
  const reg = await register(email);
  await verify(email);
  const token = await login(email);
  return { token, id: reg.body.data.user.id };
}

const bearer = (token: string) => (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

async function zone(code: string, capacity = 5, nav?: { lat: number; lng: number }) {
  return prisma.parkingZone.create({
    data: {
      name: `${code} Zone`,
      code,
      capacity,
      ...(nav ? { navigationLat: nav.lat, navigationLng: nav.lng } : {}),
    },
  });
}

async function admin(email: string): Promise<string> {
  await prisma.user.create({
    data: {
      name: "Ops",
      email,
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  return login(email);
}

function spyClient(userId: string) {
  const frames: string[] = [];
  const closed = { count: 0 };
  const client: RealtimeClient = {
    id: `${userId}-${Math.random()}`,
    userId,
    role: "USER",
    write: (c) => frames.push(c),
    close: () => {
      closed.count += 1;
    },
  };
  return { client, frames, closed };
}

// 1x1 images with real magic bytes; the domain sniffs these, not Content-Type.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const JPEG_HEAD = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

beforeEach(async () => {
  await cleanDatabase();
  mailer.sent.length = 0;
  mailer.failWith = null;
  now = new Date("2026-09-14T08:00:00.000Z");
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Registration + email verification
// ---------------------------------------------------------------------------

describe("Registration requires email verification", () => {
  it("registers without a token, mails a 6-digit code, and refuses login until verified", async () => {
    const reg = await register("new@test.local");
    expect(reg.body.data.token).toBeUndefined();
    expect(reg.body.data.user.emailVerifiedAt).toBeNull();
    expect(reg.body.data.verification.expiresAt).toBe(new Date(now.getTime() + 10 * 60_000).toISOString());

    const mail = mailer.lastTo("new@test.local");
    expect(mail?.subject).toContain("verification code");
    const code = codeIn(mail?.text);
    expect(code).toMatch(/^\d{6}$/);
    // Branded PARADA mail: plain text and HTML carry the same code, the
    // product name, the establishment, the expiry, and no secrets beyond the code.
    expect(mail?.text).toContain("Hi Driver");
    expect(mail?.text).toContain("PARADA");
    expect(mail?.text).toContain("LPU-Batangas Main Campus");
    expect(mail?.text).toContain("10 minutes");
    expect(mail?.html).toContain(code!);
    expect(mail?.html).toContain("Verify your email address");
    expect(mail?.html).toContain("LPU-Batangas Main Campus");
    expect(mail?.html).not.toContain(PASSWORD);
    // The plaintext code is never stored.
    const rows = await prisma.verificationToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toContain(code);
    expect(rows[0]!.purpose).toBe("EMAIL_VERIFY");

    const refused = await request(app).post("/auth/login").send({ email: "new@test.local", password: PASSWORD }).expect(403);
    expect(refused.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(refused.body.error.details.email).toBe("new@test.local");
    // Inside the resend cooldown no new code is issued; the client is told when it may.
    expect(refused.body.error.details.verification).toBeNull();
    expect(mailer.sent).toHaveLength(1);

    await verify("new@test.local");
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${await login("new@test.local")}`).expect(200);
    expect(me.body.data.emailVerifiedAt).not.toBeNull();
    expect(me.body.data.avatarUpdatedAt).toBeNull();
  });

  it("login on an unverified account re-issues a code once the cooldown has passed", async () => {
    await register("again@test.local");
    advance(61_000);
    const refused = await request(app).post("/auth/login").send({ email: "again@test.local", password: PASSWORD }).expect(403);
    expect(refused.body.error.details.verification.expiresAt).toBeDefined();
    expect(mailer.sent).toHaveLength(2);
    // Only the newest code works.
    const first = codeIn(mailer.sent[0]!.text);
    const second = codeIn(mailer.sent[1]!.text);
    await request(app).post("/auth/verify-email").send({ email: "again@test.local", code: first }).expect(422);
    await request(app).post("/auth/verify-email").send({ email: "again@test.local", code: second }).expect(200);
  });

  it("wrong password on an unverified account is still a generic 401 (no code issued)", async () => {
    await register("wrongpw@test.local");
    await request(app).post("/auth/login").send({ email: "wrongpw@test.local", password: "nope-nope-1" }).expect(401);
    expect(mailer.sent).toHaveLength(1);
  });

  it("rejects an invalid code, burns it after too many attempts, and rejects an expired code", async () => {
    await register("codes@test.local");
    const code = codeIn(mailer.lastTo("codes@test.local")?.text)!;
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 1; i < CODE_MAX_ATTEMPTS; i += 1) {
      const res = await request(app).post("/auth/verify-email").send({ email: "codes@test.local", code: wrong }).expect(422);
      expect(res.body.error.code).toBe("CODE_INVALID");
    }
    const burned = await request(app).post("/auth/verify-email").send({ email: "codes@test.local", code: wrong }).expect(422);
    expect(burned.body.error.message).toContain("Too many incorrect attempts");
    // The real code no longer works either: a new one must be requested.
    await request(app).post("/auth/verify-email").send({ email: "codes@test.local", code }).expect(422);

    advance(61_000);
    await request(app).post("/auth/resend-verification").send({ email: "codes@test.local" }).expect(202);
    const fresh = codeIn(mailer.lastTo("codes@test.local")?.text)!;
    advance(11 * 60_000);
    const expired = await request(app).post("/auth/verify-email").send({ email: "codes@test.local", code: fresh }).expect(422);
    expect(expired.body.error.code).toBe("CODE_EXPIRED");
  });

  it("resend is generic for unknown / verified emails and rate-limited by cooldown", async () => {
    const unknown = await request(app).post("/auth/resend-verification").send({ email: "ghost@test.local" }).expect(202);
    expect(unknown.body.data.verification).toBeNull();
    expect(mailer.sent).toHaveLength(0);

    await register("resend@test.local");
    const early = await request(app).post("/auth/resend-verification").send({ email: "resend@test.local" }).expect(429);
    expect(early.body.error.details.resendAvailableAt).toBeDefined();
    advance(61_000);
    await request(app).post("/auth/resend-verification").send({ email: "resend@test.local" }).expect(202);
    expect(mailer.sent).toHaveLength(2);

    await verify("resend@test.local");
    advance(61_000);
    const done = await request(app).post("/auth/resend-verification").send({ email: "resend@test.local" }).expect(202);
    expect(done.body.data.verification).toBeNull();
    expect(mailer.sent).toHaveLength(2);
  });

  it("a used code cannot be replayed and verifying an unknown email is indistinguishable from a bad code", async () => {
    await register("used@test.local");
    const code = codeIn(mailer.lastTo("used@test.local")?.text);
    await request(app).post("/auth/verify-email").send({ email: "used@test.local", code }).expect(200);
    const replay = await request(app).post("/auth/verify-email").send({ email: "used@test.local", code }).expect(422);
    const ghost = await request(app).post("/auth/verify-email").send({ email: "ghost@test.local", code }).expect(422);
    expect(replay.body.error.code).toBe("CODE_INVALID");
    expect(ghost.body.error.code).toBe("CODE_INVALID");
    expect(ghost.body.error.message).toBe(replay.body.error.message);
  });

  it("validates registration input server-side", async () => {
    await request(app).post("/auth/register").send({ name: "X", email: "bad", password: PASSWORD }).expect(422);
    await request(app).post("/auth/register").send({ name: "Only", email: "not-an-email", password: PASSWORD }).expect(422);
    await request(app).post("/auth/register").send({ name: "Only", email: "ok@test.local", password: "short" }).expect(422);
  });

  it("does not create a verification row that the app cannot deliver (mail failure surfaces)", async () => {
    mailer.failWith = new Error("SMTP down");
    const res = await request(app).post("/auth/register").send({ name: "Mail Fail", email: "fail@test.local", password: PASSWORD });
    expect(res.status).toBe(500);
    // The account exists but no delivery was faked; the user can resend later.
    expect(await prisma.user.count({ where: { email: "fail@test.local" } })).toBe(1);
    mailer.failWith = null;
    advance(61_000);
    await request(app).post("/auth/resend-verification").send({ email: "fail@test.local" }).expect(202);
    expect(mailer.lastTo("fail@test.local")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Change password / forgot password
// ---------------------------------------------------------------------------

describe("Change password", () => {
  it("requires the current password, re-hashes with argon2id, and invalidates every earlier token", async () => {
    const { token, id: userId } = await driver("pw@test.local");
    const other = await driver("pw-other@test.local");
    const before = await prisma.user.findUniqueOrThrow({ where: { email: "pw@test.local" } });
    // An open realtime stream from the old session must be dropped by the change.
    const stream = spyClient(userId);
    hub.subscribe(stream.client);
    const otherStream = spyClient(other.id);
    hub.subscribe(otherStream.client);

    const wrong = await bearer(token)(request(app).post("/auth/password"))
      .send({ currentPassword: "WrongPass123!", newPassword: "NewPassword456!" })
      .expect(422);
    expect(wrong.body.error.message).toContain("current password");

    await bearer(token)(request(app).post("/auth/password"))
      .send({ currentPassword: PASSWORD, newPassword: "short" })
      .expect(422);
    await bearer(token)(request(app).post("/auth/password"))
      .send({ currentPassword: PASSWORD, newPassword: "NewPassword456!", confirmPassword: "different" })
      .expect(400);

    const changed = await bearer(token)(request(app).post("/auth/password"))
      .send({ currentPassword: PASSWORD, newPassword: "NewPassword456!", confirmPassword: "NewPassword456!" })
      .expect(200);
    expect(JSON.stringify(changed.body)).not.toContain("NewPassword456!");
    expect(JSON.stringify(changed.body)).not.toContain("passwordHash");
    const freshToken: string = changed.body.data.token;

    const after = await prisma.user.findUniqueOrThrow({ where: { email: "pw@test.local" } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(after.passwordChangedAt).not.toBeNull();

    // Old session dead, new session alive, old password dead.
    await bearer(token)(request(app).get("/auth/me")).expect(401);
    expect(stream.closed.count).toBe(1);
    expect(hub.connectionCount(userId)).toBe(0);
    expect(hub.connectionCount(other.id)).toBe(1);
    await bearer(freshToken)(request(app).get("/auth/me")).expect(200);
    await request(app).post("/auth/login").send({ email: "pw@test.local", password: PASSWORD }).expect(401);
    await login("pw@test.local", "NewPassword456!");
  });
});

describe("Forgot / reset password", () => {
  it("answers generically, mails a single-use 30-minute token, and resets the password", async () => {
    const { token: oldToken } = await driver("forgot@test.local");
    const unknown = await request(app).post("/auth/forgot-password").send({ email: "nobody@test.local" }).expect(202);
    const known = await request(app).post("/auth/forgot-password").send({ email: "forgot@test.local" }).expect(202);
    expect(unknown.body).toEqual(known.body);
    expect(mailer.lastTo("nobody@test.local")).toBeNull();

    const mail = mailer.lastTo("forgot@test.local");
    const resetToken = tokenIn(mail?.text)!;
    expect(resetToken).toHaveLength(64);
    expect(mail?.text).toContain(`parada://reset-password?token=${resetToken}`);
    expect(mail?.text).toContain("30 minutes");
    expect(mail?.html).toContain(`parada://reset-password?token=${resetToken}`);
    expect(mail?.html).toContain("Reset your password");
    const row = await prisma.verificationToken.findFirstOrThrow({ where: { purpose: "PASSWORD_RESET" } });
    expect(row.tokenHash).not.toBe(resetToken);
    expect(row.expiresAt.getTime() - now.getTime()).toBe(30 * 60_000);

    await request(app).post("/auth/reset-password").send({ token: "not-a-token", newPassword: "Reset12345!" }).expect(422);
    await request(app).post("/auth/reset-password").send({ token: resetToken, newPassword: "short" }).expect(422);

    const reset = await request(app).post("/auth/reset-password").send({ token: resetToken, newPassword: "Reset12345!" }).expect(200);
    expect(reset.body.data.user.email).toBe("forgot@test.local");
    expect(JSON.stringify(reset.body)).not.toContain("Reset12345!");

    // Reuse is refused, old sessions are dead, the new password works.
    const reused = await request(app).post("/auth/reset-password").send({ token: resetToken, newPassword: "Another123!" }).expect(422);
    expect(reused.body.error.code).toBe("TOKEN_INVALID");
    await bearer(oldToken)(request(app).get("/auth/me")).expect(401);
    await request(app).post("/auth/login").send({ email: "forgot@test.local", password: PASSWORD }).expect(401);
    await login("forgot@test.local", "Reset12345!");
  });

  it("rejects an expired token and never lets a reset for one account touch another", async () => {
    await driver("a@test.local");
    const b = await driver("b@test.local");
    await request(app).post("/auth/forgot-password").send({ email: "a@test.local" }).expect(202);
    const tokenA = tokenIn(mailer.lastTo("a@test.local")?.text)!;

    advance(31 * 60_000);
    const expired = await request(app).post("/auth/reset-password").send({ token: tokenA, newPassword: "Expired123!" }).expect(422);
    expect(expired.body.error.code).toBe("TOKEN_EXPIRED");
    await login("a@test.local");

    // A second request within the cooldown is silently absorbed (generic 202, no new mail).
    await request(app).post("/auth/forgot-password").send({ email: "a@test.local" }).expect(202);
    const tokenA2 = tokenIn(mailer.lastTo("a@test.local")?.text)!;
    await request(app).post("/auth/reset-password").send({ token: tokenA2, newPassword: "Second123!" }).expect(200);
    // B's credentials and session are untouched.
    await bearer(b.token)(request(app).get("/auth/me")).expect(200);
    await login("b@test.local");
    const bRow = await prisma.user.findUniqueOrThrow({ where: { email: "b@test.local" } });
    expect(bRow.tokenVersion).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Profile: name / username / email / phone / avatar
// ---------------------------------------------------------------------------

describe("Profile updates", () => {
  it("updates name and username with uniqueness and validation enforced server-side", async () => {
    const a = await driver("pa@test.local");
    const b = await driver("pb@test.local");

    const updated = await bearer(a.token)(request(app).patch("/auth/me")).send({ name: "  Alex   Driver ", username: "Alex.D" }).expect(200);
    expect(updated.body.data.name).toBe("Alex Driver");
    expect(updated.body.data.username).toBe("alex.d");

    const taken = await bearer(b.token)(request(app).patch("/auth/me")).send({ username: "ALEX.D" }).expect(409);
    expect(taken.body.error.message).toContain("already taken");
    await bearer(b.token)(request(app).patch("/auth/me")).send({ username: "x" }).expect(422);
    await bearer(b.token)(request(app).patch("/auth/me")).send({ name: "A" }).expect(422);
    await bearer(b.token)(request(app).patch("/auth/me")).send({}).expect(400);

    const cleared = await bearer(a.token)(request(app).patch("/auth/me")).send({ username: null }).expect(200);
    expect(cleared.body.data.username).toBeNull();
    // B's row was never touched by A's requests (no target id is accepted).
    const bRow = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
    expect(bRow.name).toBe("Driver");
    await bearer(a.token)(request(app).patch("/auth/me")).send({ id: b.id, userId: b.id, name: "Hijack" }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).name).toBe("Driver");
  });

  it("changes email only after the code sent to the NEW address is confirmed", async () => {
    const { token } = await driver("old@test.local");
    await bearer(token)(request(app).post("/auth/me/email")).send({ email: "old@test.local" }).expect(422);
    await bearer(token)(request(app).post("/auth/me/email")).send({ email: "nope" }).expect(422);

    await bearer(token)(request(app).post("/auth/me/email")).send({ email: "New@Test.local" }).expect(202);
    const pending = await bearer(token)(request(app).get("/auth/me")).expect(200);
    expect(pending.body.data.email).toBe("old@test.local");
    expect(pending.body.data.pendingEmail).toBe("new@test.local");
    expect(mailer.lastTo("old@test.local")?.subject).toContain("verification code"); // only the registration mail
    const code = codeIn(mailer.lastTo("new@test.local")?.text);
    expect(code).toBeDefined();

    await bearer(token)(request(app).post("/auth/me/email/confirm")).send({ code: "000000" }).expect(422);
    const confirmed = await bearer(token)(request(app).post("/auth/me/email/confirm")).send({ code }).expect(200);
    expect(confirmed.body.data.email).toBe("new@test.local");
    expect(confirmed.body.data.pendingEmail).toBeNull();
    // The old address no longer signs in; the new one does with the same session still valid.
    await request(app).post("/auth/login").send({ email: "old@test.local", password: PASSWORD }).expect(401);
    await login("new@test.local");
    await bearer(token)(request(app).get("/auth/me")).expect(200);
  });

  it("does not reveal whether a requested email belongs to someone else, and refuses the takeover at confirmation", async () => {
    await driver("victim@test.local");
    const { token } = await driver("attacker@test.local");
    const free = await bearer(token)(request(app).post("/auth/me/email")).send({ email: "free@test.local" }).expect(202);
    advance(61_000);
    const taken = await bearer(token)(request(app).post("/auth/me/email")).send({ email: "victim@test.local" }).expect(202);
    expect(Object.keys(taken.body.data)).toEqual(Object.keys(free.body.data));
    // Nothing was mailed to the victim's address for the attacker's request.
    expect(mailer.sent.filter((m) => m.to === "victim@test.local")).toHaveLength(1);
    // Even a correct code for that request cannot take the address over.
    const tokenRow = await prisma.verificationToken.findFirstOrThrow({ where: { purpose: "EMAIL_CHANGE", consumedAt: null } });
    expect(tokenRow.target).toBe("victim@test.local");
    const cancelled = await bearer(token)(request(app).delete("/auth/me/email")).expect(200);
    expect(cancelled.body.data.pendingEmail).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "victim@test.local" } })).email).toBe("victim@test.local");
  });

  it("changes phone only after the code sent to the verified email is confirmed; null clears it", async () => {
    const { token } = await driver("phone@test.local");
    await bearer(token)(request(app).post("/auth/me/phone")).send({ phone: "12" }).expect(422);
    await bearer(token)(request(app).post("/auth/me/phone")).send({ phone: "+63 (917) 123-4567" }).expect(202);
    const pending = await bearer(token)(request(app).get("/auth/me")).expect(200);
    expect(pending.body.data.phone).toBeNull();
    expect(pending.body.data.pendingPhone).toBe("+639171234567");
    const mail = mailer.lastTo("phone@test.local");
    expect(mail?.subject).toContain("phone");
    const code = codeIn(mail?.text);
    const confirmed = await bearer(token)(request(app).post("/auth/me/phone/confirm")).send({ code }).expect(200);
    expect(confirmed.body.data.phone).toBe("+639171234567");
    expect(confirmed.body.data.pendingPhone).toBeNull();
    const cleared = await bearer(token)(request(app).post("/auth/me/phone")).send({ phone: null }).expect(200);
    expect(cleared.body.data.user.phone).toBeNull();
  });

  it("uploads, serves, replaces and removes a profile picture with type/size/ownership checks", async () => {
    const a = await driver("ava@test.local");
    const b = await driver("avb@test.local");
    const ops = await admin("ops@test.local");

    // Real bytes are what count, not the declared type.
    const notImage = await bearer(a.token)(request(app).put("/auth/me/avatar"))
      .set("Content-Type", "image/png")
      .send(Buffer.from("<script>alert(1)</script>"))
      .expect(422);
    expect(notImage.body.error.message).toContain("JPEG, PNG or WebP");
    await bearer(a.token)(request(app).put("/auth/me/avatar")).set("Content-Type", "image/png").send(Buffer.alloc(0)).expect(400);
    const huge = await bearer(a.token)(request(app).put("/auth/me/avatar"))
      .set("Content-Type", "image/jpeg")
      .send(Buffer.concat([JPEG_HEAD, Buffer.alloc(2 * 1024 * 1024)]))
      .expect(413);
    expect(huge.body.error.code).toBe("PAYLOAD_TOO_LARGE");

    const uploaded = await bearer(a.token)(request(app).put("/auth/me/avatar")).set("Content-Type", "application/octet-stream").send(PNG_1X1).expect(200);
    expect(uploaded.body.data.avatarUpdatedAt).not.toBeNull();
    const me = await bearer(a.token)(request(app).get("/auth/me")).expect(200);
    expect(me.body.data.avatarUpdatedAt).toBe(uploaded.body.data.avatarUpdatedAt);

    const served = await bearer(a.token)(request(app).get(`/users/${a.id}/avatar`)).expect(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["cache-control"]).toContain("private");
    expect(Buffer.from(served.body).equals(PNG_1X1)).toBe(true);
    await bearer(a.token)(request(app).get(`/users/${a.id}/avatar`)).set("If-None-Match", String(served.headers["etag"])).expect(304);

    // Ownership: another driver is refused, an admin may view, unauthenticated is refused.
    await bearer(b.token)(request(app).get(`/users/${a.id}/avatar`)).expect(403);
    await bearer(ops)(request(app).get(`/users/${a.id}/avatar`)).expect(200);
    await request(app).get(`/users/${a.id}/avatar`).expect(401);
    await bearer(b.token)(request(app).get(`/users/${b.id}/avatar`)).expect(404);

    // Replacement changes the served bytes and the stamp; removal clears both.
    const replaced = await bearer(a.token)(request(app).put("/auth/me/avatar")).set("Content-Type", "image/jpeg").send(JPEG_HEAD).expect(200);
    expect(replaced.body.data.avatarUpdatedAt).not.toBe(uploaded.body.data.avatarUpdatedAt);
    const served2 = await bearer(a.token)(request(app).get(`/users/${a.id}/avatar`)).expect(200);
    expect(served2.headers["content-type"]).toBe("image/jpeg");
    expect(await prisma.userAvatar.count()).toBe(1);
    const removed = await bearer(a.token)(request(app).delete("/auth/me/avatar")).expect(200);
    expect(removed.body.data.avatarUpdatedAt).toBeNull();
    await bearer(a.token)(request(app).get(`/users/${a.id}/avatar`)).expect(404);

    // Admin user list carries the stamp for the console.
    await bearer(b.token)(request(app).put("/auth/me/avatar")).send(PNG_1X1).expect(200);
    const users = await bearer(ops)(request(app).get("/admin/users")).expect(200);
    const rowB = users.body.data.find((u: { id: string }) => u.id === b.id);
    expect(rowB.avatarUpdatedAt).not.toBeNull();
    expect(rowB.emailVerifiedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Vehicles: register / edit / unregister
// ---------------------------------------------------------------------------

describe("Vehicle lifecycle", () => {
  it("registers with descriptive fields, edits them, and enforces plate rules", async () => {
    const a = await driver("va@test.local");
    const b = await driver("vb@test.local");
    const created = await bearer(a.token)(request(app).post("/vehicles"))
      .send({ plateNumber: " abc 1234 ", vehicleType: "CAR", make: "Toyota", model: "Vios", color: " Red " })
      .expect(201);
    expect(created.body.data).toMatchObject({ plateNumber: "ABC 1234", normalizedPlate: "ABC1234", make: "Toyota", model: "Vios", color: "Red" });
    const id: string = created.body.data.id;

    // Same plate on another account is refused by the database's partial index -> 409, not 500.
    const dup = await bearer(b.token)(request(app).post("/vehicles")).send({ plateNumber: "ABC-1234", vehicleType: "VAN" }).expect(409);
    expect(dup.body.error.message).toContain("another account");
    await bearer(a.token)(request(app).post("/vehicles")).send({ plateNumber: "A", vehicleType: "CAR" }).expect(422);
    await bearer(a.token)(request(app).post("/vehicles")).send({ plateNumber: "ABC-1234", vehicleType: "BOAT" }).expect(400);

    const edited = await bearer(a.token)(request(app).patch(`/vehicles/${id}`))
      .send({ make: "Honda", model: null, color: "Blue", vehicleType: "VAN" })
      .expect(200);
    expect(edited.body.data).toMatchObject({ make: "Honda", model: null, color: "Blue", vehicleType: "VAN", plateNumber: "ABC 1234" });
    const replated = await bearer(a.token)(request(app).patch(`/vehicles/${id}`)).send({ plateNumber: "xyz-777" }).expect(200);
    expect(replated.body.data).toMatchObject({ plateNumber: "XYZ-777", normalizedPlate: "XYZ777" });
    await bearer(a.token)(request(app).patch(`/vehicles/${id}`)).send({}).expect(400);

    // Ownership: B cannot read, edit or unregister A's vehicle (404, no existence leak).
    await bearer(b.token)(request(app).get(`/vehicles/${id}`)).expect(404);
    await bearer(b.token)(request(app).patch(`/vehicles/${id}`)).send({ color: "Black" }).expect(404);
    await bearer(b.token)(request(app).delete(`/vehicles/${id}`)).expect(404);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id } })).color).toBe("Blue");
  });

  it("unregisters (INACTIVE, history kept), hides the vehicle from new activity, and reactivates on re-registration", async () => {
    const a = await driver("vu@test.local");
    const z = await zone("VU");
    const created = await bearer(a.token)(request(app).post("/vehicles")).send({ plateNumber: "UNR-1", vehicleType: "CAR" }).expect(201);
    const id: string = created.body.data.id;
    // Some history first: a completed session.
    const entry = await bearer(a.token)(request(app).post("/sessions/entry")).send({ vehicleId: id, zoneId: z.id }).expect(201);
    await bearer(a.token)(request(app).post(`/sessions/${entry.body.data.session.id}/exit`)).send({}).expect(200);

    const removed = await bearer(a.token)(request(app).delete(`/vehicles/${id}`)).expect(200);
    expect(removed.body.data.status).toBe("INACTIVE");
    expect(await prisma.vehicle.count({ where: { id } })).toBe(1);
    expect(await prisma.parkingSession.count({ where: { vehicleId: id } })).toBe(1);
    expect(await prisma.parkingFee.count()).toBe(1);

    const list = await bearer(a.token)(request(app).get("/vehicles")).expect(200);
    expect(list.body.data).toHaveLength(0);
    await bearer(a.token)(request(app).get(`/vehicles/${id}`)).expect(404);
    await bearer(a.token)(request(app).delete(`/vehicles/${id}`)).expect(404);
    // Not selectable for new parking activity.
    await bearer(a.token)(request(app).post("/assignments")).send({ vehicleId: id, zoneId: z.id }).expect(404);
    await bearer(a.token)(request(app).post("/reservations")).send({ vehicleId: id, zoneId: z.id }).expect(404);
    await bearer(a.token)(request(app).post("/sessions/entry")).send({ vehicleId: id, zoneId: z.id }).expect(404);
    // The camera pipeline no longer matches the plate as a registered vehicle.
    await prisma.camera.create({ data: { zoneId: z.id, name: "VU gate", identifier: "cam-vu", gateType: "BIDIRECTIONAL", status: "ONLINE" } });
    const camEvent = await request(app)
      .post(`/zones/${z.id}/events`)
      .send({ cameraIdentifier: "cam-vu", sourceEventId: "vu-1", eventType: "ENTRY", detectedPlate: "UNR-1", ocrConfidence: 0.99 });
    expect(camEvent.status).toBe(201);
    expect(camEvent.body.data.vehicleId).toBeNull();
    expect(camEvent.body.data.plateMatched).toBe(false);
    const history = await bearer(a.token)(request(app).get("/sessions")).expect(200);
    expect(history.body.data).toHaveLength(1);

    // Re-registering the same plate revives the same row, keeping its history link.
    const again = await bearer(a.token)(request(app).post("/vehicles")).send({ plateNumber: "UNR-1", vehicleType: "VAN", color: "Grey" }).expect(201);
    expect(again.body.data.id).toBe(id);
    expect(again.body.data).toMatchObject({ status: "ACTIVE", vehicleType: "VAN", color: "Grey" });
  });

  it("blocks unregistration and re-plating while the vehicle is parked, assigned, or reserved", async () => {
    const a = await driver("vblock@test.local");
    const z = await zone("VB");
    const v = (await bearer(a.token)(request(app).post("/vehicles")).send({ plateNumber: "BLK-1", vehicleType: "CAR" }).expect(201)).body.data;

    const assignment = (await bearer(a.token)(request(app).post("/assignments")).send({ vehicleId: v.id, zoneId: z.id }).expect(201)).body.data;
    const blockedByAssignment = await bearer(a.token)(request(app).delete(`/vehicles/${v.id}`)).expect(409);
    expect(blockedByAssignment.body.error.details.reason).toBe("ACTIVE_ASSIGNMENT");
    await bearer(a.token)(request(app).patch(`/vehicles/${v.id}`)).send({ plateNumber: "BLK-2" }).expect(409);
    // Descriptive edits stay allowed.
    await bearer(a.token)(request(app).patch(`/vehicles/${v.id}`)).send({ color: "White" }).expect(200);
    await bearer(a.token)(request(app).patch(`/assignments/${assignment.id}/cancel`)).expect(200);

    const reservation = (await bearer(a.token)(request(app).post("/reservations")).send({ vehicleId: v.id, zoneId: z.id }).expect(201)).body.data;
    const blockedByReservation = await bearer(a.token)(request(app).delete(`/vehicles/${v.id}`)).expect(409);
    expect(blockedByReservation.body.error.details.reason).toBe("ACTIVE_RESERVATION");
    await bearer(a.token)(request(app).patch(`/reservations/${reservation.id}/cancel`)).expect(200);

    const session = (await bearer(a.token)(request(app).post("/sessions/entry")).send({ vehicleId: v.id, zoneId: z.id }).expect(201)).body.data.session;
    const blockedBySession = await bearer(a.token)(request(app).delete(`/vehicles/${v.id}`)).expect(409);
    expect(blockedBySession.body.error.details.reason).toBe("ACTIVE_SESSION");
    await bearer(a.token)(request(app).post(`/sessions/${session.id}/exit`)).send({}).expect(200);

    await bearer(a.token)(request(app).delete(`/vehicles/${v.id}`)).expect(200);
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: z.id } })).occupiedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Recommendation acceptance -> assignment -> cancellation
// ---------------------------------------------------------------------------

describe("Accepted recommendation cancellation", () => {
  it("accepting a recommendation creates an assignment (never a reservation) that the owner can cancel before entry", async () => {
    const a = await driver("rec@test.local");
    const b = await driver("recb@test.local");
    const zA = await zone("RA", 5);
    const zB = await zone("RB", 5);
    await prisma.parkingZone.update({ where: { id: zB.id }, data: { occupiedCount: 3 } });
    const v = (await bearer(a.token)(request(app).post("/vehicles")).send({ plateNumber: "REC-1", vehicleType: "CAR" }).expect(201)).body.data;

    const rec = await request(app).get("/zones/recommendation").expect(200);
    expect(rec.body.data.recommendedZone.id).toBe(zA.id);
    expect(await prisma.zoneAssignment.count()).toBe(0);

    const spy = spyClient(a.id);
    hub.subscribe(spy.client);
    const accepted = (await bearer(a.token)(request(app).post("/assignments")).send({ vehicleId: v.id, zoneId: zA.id }).expect(201)).body.data;
    expect(accepted.status).toBe("ACTIVE");
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.parkingSession.count()).toBe(0);
    const zoneAfterAccept = await prisma.parkingZone.findUniqueOrThrow({ where: { id: zA.id } });
    expect(zoneAfterAccept.occupiedCount).toBe(0);

    // The recommendation stays dynamic: conditions change, so does the answer.
    await prisma.parkingZone.update({ where: { id: zA.id }, data: { occupiedCount: 5 } });
    const rec2 = await request(app).get("/zones/recommendation").expect(200);
    expect(rec2.body.data.recommendedZone.id).toBe(zB.id);
    await prisma.parkingZone.update({ where: { id: zA.id }, data: { occupiedCount: 0 } });

    // Another user cannot cancel it.
    await bearer(b.token)(request(app).patch(`/assignments/${accepted.id}/cancel`)).expect(404);
    await request(app).patch(`/assignments/${accepted.id}/cancel`).expect(401);

    const cancelled = (await bearer(a.token)(request(app).patch(`/assignments/${accepted.id}/cancel`)).expect(200)).body.data;
    expect(cancelled.status).toBe("CANCELLED");
    expect(spy.frames.some((f) => f.includes("\nevent: ASSIGNMENT_CANCELLED\n"))).toBe(true);
    const row = await prisma.zoneAssignment.findUniqueOrThrow({ where: { id: accepted.id } });
    expect(row.status).toBe("CANCELLED");
    expect(await prisma.zoneAssignment.count()).toBe(1);
    expect(await prisma.reservation.count()).toBe(0);
    expect(await prisma.parkingSession.count()).toBe(0);
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id: zA.id } })).occupiedCount).toBe(0);

    // Cancelling twice is a conflict; the history stays CANCELLED.
    await bearer(a.token)(request(app).patch(`/assignments/${accepted.id}/cancel`)).expect(409);
    const list = (await bearer(a.token)(request(app).get("/assignments")).expect(200)).body.data;
    expect(list.map((x: { status: string }) => x.status)).toEqual(["CANCELLED"]);

    // The user may accept another recommendation right away (any zone).
    const next = (await bearer(a.token)(request(app).post("/assignments")).send({ vehicleId: v.id, zoneId: zB.id }).expect(201)).body.data;
    expect(next.status).toBe("ACTIVE");
    // Entering a zone other than the assigned one is still refused (assignment semantics intact).
    await bearer(a.token)(request(app).post("/sessions/entry")).send({ vehicleId: v.id, zoneId: zA.id }).expect(409);
  });

  it("cannot be cancelled once the vehicle has entered, nor once expired", async () => {
    const a = await driver("entered@test.local");
    const z = await zone("EN", 5);
    const v = (await bearer(a.token)(request(app).post("/vehicles")).send({ plateNumber: "ENT-1", vehicleType: "CAR" }).expect(201)).body.data;
    const assignment = (await bearer(a.token)(request(app).post("/assignments")).send({ vehicleId: v.id, zoneId: z.id }).expect(201)).body.data;
    const session = (await bearer(a.token)(request(app).post("/sessions/entry")).send({ vehicleId: v.id, zoneId: z.id }).expect(201)).body.data.session;
    const refused = await bearer(a.token)(request(app).patch(`/assignments/${assignment.id}/cancel`)).expect(409);
    expect(refused.body.error.message).toContain("already entered");
    expect((await prisma.zoneAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("ACTIVE");
    await bearer(a.token)(request(app).post(`/sessions/${session.id}/exit`)).send({}).expect(200);

    // Once the arrival window has lapsed the assignment is EXPIRED, not CANCELLED.
    await prisma.zoneAssignment.update({ where: { id: assignment.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const late = await bearer(a.token)(request(app).patch(`/assignments/${assignment.id}/cancel`)).expect(409);
    expect(late.body.error.message).toContain("expired");
    expect((await prisma.zoneAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("EXPIRED");
  });
});

// ---------------------------------------------------------------------------
// Zone navigation coordinates
// ---------------------------------------------------------------------------

describe("Zone navigation coordinates", () => {
  it("are configured by admin, validated, persisted, and exposed to drivers; never fabricated", async () => {
    const ops = await admin("nav-admin@test.local");
    const created = await bearer(ops)(request(app).post("/admin/zones"))
      .send({ name: "Nav Zone", code: "NAV", capacity: 10, navigationLat: 13.76447, navigationLng: 121.06462 })
      .expect(201);
    expect(created.body.data).toMatchObject({ navigationLat: 13.76447, navigationLng: 121.06462 });
    const id: string = created.body.data.id;

    // Range and pairing are enforced server-side.
    await bearer(ops)(request(app).patch(`/admin/zones/${id}`)).send({ navigationLat: 91, navigationLng: 121 }).expect(422);
    await bearer(ops)(request(app).patch(`/admin/zones/${id}`)).send({ navigationLat: 13, navigationLng: 181 }).expect(422);
    await bearer(ops)(request(app).patch(`/admin/zones/${id}`)).send({ navigationLat: "13.7", navigationLng: 121 }).expect(422);
    await bearer(ops)(request(app).patch(`/admin/zones/${id}`)).send({ navigationLat: 13.7 }).expect(400);
    await bearer(ops)(request(app).post("/admin/zones")).send({ name: "Bad", code: "BAD", capacity: 1, navigationLat: 13.7 }).expect(400);
    expect((await prisma.parkingZone.findUniqueOrThrow({ where: { id } })).navigationLat).toBe(13.76447);

    const moved = await bearer(ops)(request(app).patch(`/admin/zones/${id}`)).send({ navigationLat: 13.7678, navigationLng: 121.0627 }).expect(200);
    expect(moved.body.data).toMatchObject({ navigationLat: 13.7678, navigationLng: 121.0627 });

    const adminList = await bearer(ops)(request(app).get("/admin/zones")).expect(200);
    expect(adminList.body.data[0]).toMatchObject({ navigationLat: 13.7678, navigationLng: 121.0627 });
    const publicList = await request(app).get("/zones").expect(200);
    expect(publicList.body.data[0]).toMatchObject({ navigationLat: 13.7678, navigationLng: 121.0627 });
    const rec = await request(app).get("/zones/recommendation").expect(200);
    expect(rec.body.data.recommendedZone).toMatchObject({ navigationLat: 13.7678, navigationLng: 121.0627 });

    // Clearing both leaves navigation unconfigured (null, not a made-up point).
    const cleared = await bearer(ops)(request(app).patch(`/admin/zones/${id}`)).send({ navigationLat: null, navigationLng: null }).expect(200);
    expect(cleared.body.data).toMatchObject({ navigationLat: null, navigationLng: null });
    const rec2 = await request(app).get("/zones/recommendation").expect(200);
    expect(rec2.body.data.recommendedZone).toMatchObject({ navigationLat: null, navigationLng: null });
  });
});
