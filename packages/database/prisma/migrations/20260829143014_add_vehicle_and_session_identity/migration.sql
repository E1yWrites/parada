/*
  Warnings:

  - Added the required column `userId` to the `parking_sessions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleId` to the `parking_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'MOTORCYCLE', 'VAN', 'TRUCK', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "occupancy_events" ADD COLUMN     "detectedPlate" TEXT,
ADD COLUMN     "normalizedPlate" TEXT,
ADD COLUMN     "ocrConfidence" DOUBLE PRECISION,
ADD COLUMN     "plateMatched" BOOLEAN,
ADD COLUMN     "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "parking_sessions" ADD COLUMN     "userId" TEXT NOT NULL,
ADD COLUMN     "vehicleId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "normalizedPlate" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'CAR',
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicles_normalizedPlate_idx" ON "vehicles"("normalizedPlate");

-- CreateIndex
CREATE INDEX "vehicles_userId_idx" ON "vehicles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_userId_normalizedPlate_key" ON "vehicles"("userId", "normalizedPlate");

-- CreateIndex
CREATE INDEX "occupancy_events_vehicleId_idx" ON "occupancy_events"("vehicleId");

-- CreateIndex
CREATE INDEX "parking_sessions_vehicleId_status_idx" ON "parking_sessions"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "parking_sessions_userId_idx" ON "parking_sessions"("userId");

-- Prevent a vehicle from having more than one ACTIVE parking session at once.
-- Partial unique index: only rows with status='ACTIVE' participate.
CREATE UNIQUE INDEX "parking_sessions_one_active_per_vehicle"
    ON "parking_sessions"("vehicleId")
    WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_events" ADD CONSTRAINT "occupancy_events_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
