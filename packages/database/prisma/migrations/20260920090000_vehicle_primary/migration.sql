-- Primary vehicle: the driver's default vehicle for the parking flow.

ALTER TABLE "vehicles" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: each user's most recently registered ACTIVE vehicle becomes
-- primary, so an existing driver with one active vehicle already has it
-- preselected.
UPDATE "vehicles" v
SET "isPrimary" = true
FROM (
    SELECT DISTINCT ON ("userId") "id"
    FROM "vehicles"
    WHERE "status" = 'ACTIVE'
    ORDER BY "userId", "createdAt" DESC
) latest
WHERE v."id" = latest."id";

-- At most one primary vehicle per user, and only ever on an ACTIVE vehicle.
CREATE UNIQUE INDEX "vehicles_one_primary_per_user"
    ON "vehicles"("userId") WHERE "isPrimary" = true;
