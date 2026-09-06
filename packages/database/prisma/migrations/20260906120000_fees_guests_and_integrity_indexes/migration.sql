-- Guest parking sessions are account-less, so their fee has no user.
-- Mirrors the parking_sessions change in 20260904115711_guest_session_accountless.
ALTER TABLE "parking_fees" DROP CONSTRAINT "parking_fees_userId_fkey";
ALTER TABLE "parking_fees" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "parking_fees" ADD CONSTRAINT "parking_fees_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One ACTIVE zone assignment per vehicle, enforced by the database rather than
-- a check-then-create race in the application layer.
CREATE UNIQUE INDEX "zone_assignments_one_active_per_vehicle"
    ON "zone_assignments"("vehicleId") WHERE "status" = 'ACTIVE';

-- A licence plate is the primary vehicle identity, so an ACTIVE plate must be
-- globally unique. Without this a second account can register someone else's
-- plate, making it ambiguous and silently downgrading the real owner to a guest.
CREATE UNIQUE INDEX "vehicles_one_active_per_normalized_plate"
    ON "vehicles"("normalizedPlate") WHERE "status" = 'ACTIVE';
