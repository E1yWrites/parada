-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ZoneStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CameraStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "GateType" AS ENUM ('ENTRY', 'EXIT', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "OccupancyEventType" AS ENUM ('ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "OccupancySource" AS ENUM ('CAMERA', 'SIMULATOR', 'MANUAL');

-- CreateEnum
CREATE TYPE "ParkingSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ZONE_FULL', 'ZONE_LOW_AVAILABILITY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL,
    "occupiedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ZoneStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_zones_pkey" PRIMARY KEY ("id")
);

-- Enforce occupancy invariants at the database level:
--  occupied_count can never be negative nor exceed capacity.
ALTER TABLE "parking_zones"
    ADD CONSTRAINT "parking_zones_occupied_in_bounds"
    CHECK ("occupiedCount" >= 0 AND "occupiedCount" <= "capacity");

-- CreateTable
CREATE TABLE "parking_slots" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "slotCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "positionX" INTEGER,
    "positionY" INTEGER,
    "status" "SlotStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cameras" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "location" TEXT,
    "gateType" "GateType" NOT NULL DEFAULT 'BIDIRECTIONAL',
    "status" "CameraStatus" NOT NULL DEFAULT 'OFFLINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupancy_events" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "cameraId" TEXT,
    "eventType" "OccupancyEventType" NOT NULL,
    "previousOccupied" INTEGER NOT NULL,
    "newOccupied" INTEGER NOT NULL,
    "availableCount" INTEGER NOT NULL,
    "source" "OccupancySource" NOT NULL DEFAULT 'CAMERA',
    "sourceEventId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occupancy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupancy_history" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "occupiedCount" INTEGER NOT NULL,
    "availableCount" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occupancy_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_sessions" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "entryEventId" TEXT NOT NULL,
    "exitEventId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "status" "ParkingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "targetRole" "Role" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "parking_zones_name_key" ON "parking_zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "parking_zones_code_key" ON "parking_zones"("code");

-- CreateIndex
CREATE INDEX "parking_zones_status_idx" ON "parking_zones"("status");

-- CreateIndex
CREATE INDEX "parking_slots_zoneId_idx" ON "parking_slots"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "parking_slots_zoneId_slotCode_key" ON "parking_slots"("zoneId", "slotCode");

-- CreateIndex
CREATE UNIQUE INDEX "cameras_identifier_key" ON "cameras"("identifier");

-- CreateIndex
CREATE INDEX "cameras_zoneId_idx" ON "cameras"("zoneId");

-- CreateIndex
CREATE INDEX "occupancy_events_zoneId_detectedAt_idx" ON "occupancy_events"("zoneId", "detectedAt");

-- CreateIndex
CREATE INDEX "occupancy_events_eventType_idx" ON "occupancy_events"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "occupancy_events_cameraId_sourceEventId_key" ON "occupancy_events"("cameraId", "sourceEventId");

-- CreateIndex
CREATE INDEX "occupancy_history_zoneId_occurredAt_idx" ON "occupancy_history"("zoneId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "parking_sessions_entryEventId_key" ON "parking_sessions"("entryEventId");

-- CreateIndex
CREATE UNIQUE INDEX "parking_sessions_exitEventId_key" ON "parking_sessions"("exitEventId");

-- CreateIndex
CREATE INDEX "parking_sessions_zoneId_status_idx" ON "parking_sessions"("zoneId", "status");

-- CreateIndex
CREATE INDEX "parking_sessions_enteredAt_idx" ON "parking_sessions"("enteredAt");

-- CreateIndex
CREATE INDEX "notifications_targetRole_read_idx" ON "notifications"("targetRole", "read");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- AddForeignKey
ALTER TABLE "parking_slots" ADD CONSTRAINT "parking_slots_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_events" ADD CONSTRAINT "occupancy_events_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_events" ADD CONSTRAINT "occupancy_events_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_history" ADD CONSTRAINT "occupancy_history_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_entryEventId_fkey" FOREIGN KEY ("entryEventId") REFERENCES "occupancy_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_exitEventId_fkey" FOREIGN KEY ("exitEventId") REFERENCES "occupancy_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
