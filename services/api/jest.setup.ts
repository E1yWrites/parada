import "dotenv/config";
import { prisma } from "@parada/database";

const url = process.env["DATABASE_URL"] ?? "";
if (!url.includes("parada_test_api")) {
  throw new Error(
    "Refusing to run @parada/api tests against a non-test database. " +
      "Set DATABASE_URL to the parada_test_api database."
  );
}

// The suites run against a HERMETIC configuration. `dotenv/config` above loads
// services/api/.env so DATABASE_URL/JWT_SECRET can come from a developer's
// file, but that same file also carries values that change *application
// behaviour* — and the npm test script only pins DATABASE_URL and the JWT
// settings via cross-env. A developer with `CAMERA_API_KEY` set in .env
// therefore made `createApp()` demand an X-API-Key that the camera-event
// suites (which exercise the open, key-less development path, and pass an
// explicit `cameraApiKey` when they want the guarded one) never send — every
// POST /zones/:id/events assertion failed with 401 instead of 201/409.
//
// Clearing these here keeps the tests honest — no assertion is relaxed, the
// guarded path is still covered via explicit createApp({ cameraApiKey })
// overrides — while making the result independent of the machine it runs on.
// src/config/env.test.ts sets its own values and is unaffected.
for (const key of [
  "CAMERA_API_KEY",
  "OCR_PLATE_CONFIDENCE_THRESHOLD",
  "AUTH_RATE_LIMIT",
  "CAMERA_EVENT_RATE_LIMIT",
  "ADMIN_RATE_LIMIT",
  "SMTP_HOST",
  "MAIL_FROM",
]) {
  delete process.env[key];
}

// Verification / recovery mail never leaves the test process: the in-memory
// transport captures messages so suites can read the code they carry.
process.env["MAIL_TRANSPORT"] = "memory";

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "user_avatars",
      "verification_tokens",
      "vehicles",
      "parking_slots",
      "cameras",
      "occupancy_events",
      "occupancy_anomalies",
      "occupancy_history",
      "parking_sessions",
      "notifications",
      "establishment_config",
      "reservations",
      "zone_assignments",
      "violations",
      "violation_appeals",
      "parking_fees",
      "guest_sessions",
      "revoked_tokens",
      "parking_zones",
      "users"
    RESTART IDENTITY CASCADE
  `);
});
