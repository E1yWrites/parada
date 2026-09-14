-- Pre-audit remediation: account lifecycle, vehicle editing/unregistration,
-- assignment cancellation and per-zone navigation coordinates.

-- Driver-initiated release of an accepted recommendation before entry.
ALTER TYPE "ZoneAssignmentStatus" ADD VALUE 'CANCELLED';

-- One-time secrets for verification / recovery flows.
CREATE TYPE "VerificationPurpose" AS ENUM ('EMAIL_VERIFY', 'EMAIL_CHANGE', 'PHONE_CHANGE', 'PASSWORD_RESET');

-- Account profile + verification state.
ALTER TABLE "users"
    ADD COLUMN "username" TEXT,
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
    ADD COLUMN "pendingEmail" TEXT,
    ADD COLUMN "pendingPhone" TEXT,
    ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
    ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Accounts that exist before email verification was introduced were created
-- without a code; treat them as verified so nobody is locked out.
UPDATE "users" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "emailVerifiedAt" IS NULL;

-- Profile pictures (small, client-resized) live in the database.
CREATE TABLE "user_avatars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_avatars_userId_key" ON "user_avatars"("userId");
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "target" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "verification_tokens_tokenHash_key" ON "verification_tokens"("tokenHash");
CREATE INDEX "verification_tokens_userId_purpose_idx" ON "verification_tokens"("userId", "purpose");
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Driver-editable descriptive vehicle fields (never identity).
ALTER TABLE "vehicles"
    ADD COLUMN "make" TEXT,
    ADD COLUMN "model" TEXT,
    ADD COLUMN "color" TEXT;

-- Per-zone turn-by-turn destination configured by an admin.
ALTER TABLE "parking_zones"
    ADD COLUMN "navigationLat" DOUBLE PRECISION,
    ADD COLUMN "navigationLng" DOUBLE PRECISION;
