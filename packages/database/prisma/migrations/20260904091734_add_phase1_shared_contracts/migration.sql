-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('WRONG_ZONE', 'OVERSTAY', 'UNAUTHORIZED', 'GATE_TAMPERING');

-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('PENDING', 'APPEALED', 'UPHELD', 'DISMISSED', 'FINE_PAID');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeeStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "ZoneAssignmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'RESERVATION_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'VIOLATION_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'VIOLATION_APPEAL_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'VIOLATION_APPEAL_RESULT';

-- AlterTable
ALTER TABLE "parking_sessions" ADD COLUMN     "feeAmount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "establishment_config" (
    "id" TEXT NOT NULL,
    "parkingFee" JSONB NOT NULL,
    "violations" JSONB NOT NULL,
    "guestPolicy" JSONB NOT NULL,
    "zoneDefaults" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "establishment_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "status" "ZoneAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zone_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "zoneId" TEXT NOT NULL,
    "sessionId" TEXT,
    "violationType" "ViolationType" NOT NULL,
    "description" TEXT,
    "fineAmount" DOUBLE PRECISION NOT NULL,
    "status" "ViolationStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_appeals" (
    "id" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violation_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_fees" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "rateBreakdown" JSONB NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" "FeeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_sessions" (
    "id" TEXT NOT NULL,
    "parkingSessionId" TEXT NOT NULL,
    "detectedPlate" TEXT,
    "linkedReservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_userId_idx" ON "reservations"("userId");

-- CreateIndex
CREATE INDEX "reservations_vehicleId_idx" ON "reservations"("vehicleId");

-- CreateIndex
CREATE INDEX "reservations_zoneId_status_idx" ON "reservations"("zoneId", "status");

-- CreateIndex
CREATE INDEX "reservations_startAt_endAt_idx" ON "reservations"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "zone_assignments_userId_idx" ON "zone_assignments"("userId");

-- CreateIndex
CREATE INDEX "zone_assignments_vehicleId_idx" ON "zone_assignments"("vehicleId");

-- CreateIndex
CREATE INDEX "zone_assignments_zoneId_status_idx" ON "zone_assignments"("zoneId", "status");

-- CreateIndex
CREATE INDEX "violations_userId_idx" ON "violations"("userId");

-- CreateIndex
CREATE INDEX "violations_vehicleId_idx" ON "violations"("vehicleId");

-- CreateIndex
CREATE INDEX "violations_zoneId_idx" ON "violations"("zoneId");

-- CreateIndex
CREATE INDEX "violations_status_idx" ON "violations"("status");

-- CreateIndex
CREATE INDEX "violations_violationType_idx" ON "violations"("violationType");

-- CreateIndex
CREATE UNIQUE INDEX "violation_appeals_violationId_key" ON "violation_appeals"("violationId");

-- CreateIndex
CREATE INDEX "violation_appeals_userId_idx" ON "violation_appeals"("userId");

-- CreateIndex
CREATE INDEX "violation_appeals_status_idx" ON "violation_appeals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "parking_fees_sessionId_key" ON "parking_fees"("sessionId");

-- CreateIndex
CREATE INDEX "parking_fees_zoneId_idx" ON "parking_fees"("zoneId");

-- CreateIndex
CREATE INDEX "parking_fees_userId_idx" ON "parking_fees"("userId");

-- CreateIndex
CREATE INDEX "parking_fees_status_idx" ON "parking_fees"("status");

-- CreateIndex
CREATE UNIQUE INDEX "guest_sessions_parkingSessionId_key" ON "guest_sessions"("parkingSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "guest_sessions_linkedReservationId_key" ON "guest_sessions"("linkedReservationId");

-- CreateIndex
CREATE INDEX "guest_sessions_detectedPlate_idx" ON "guest_sessions"("detectedPlate");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_assignments" ADD CONSTRAINT "zone_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_assignments" ADD CONSTRAINT "zone_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_assignments" ADD CONSTRAINT "zone_assignments_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "parking_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_appeals" ADD CONSTRAINT "violation_appeals_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "violations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_appeals" ADD CONSTRAINT "violation_appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_fees" ADD CONSTRAINT "parking_fees_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "parking_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_fees" ADD CONSTRAINT "parking_fees_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_fees" ADD CONSTRAINT "parking_fees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_parkingSessionId_fkey" FOREIGN KEY ("parkingSessionId") REFERENCES "parking_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_linkedReservationId_fkey" FOREIGN KEY ("linkedReservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
