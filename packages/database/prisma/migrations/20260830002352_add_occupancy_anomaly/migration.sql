-- CreateTable
CREATE TABLE "occupancy_anomalies" (
    "id" TEXT NOT NULL,
    "occupancyEventId" TEXT NOT NULL,
    "cameraId" TEXT,
    "vehicleId" TEXT,
    "detectedPlate" TEXT,
    "anomalyType" TEXT NOT NULL,
    "description" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occupancy_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "occupancy_anomalies_occupancyEventId_key" ON "occupancy_anomalies"("occupancyEventId");

-- CreateIndex
CREATE INDEX "occupancy_anomalies_anomalyType_idx" ON "occupancy_anomalies"("anomalyType");

-- CreateIndex
CREATE INDEX "occupancy_anomalies_resolved_idx" ON "occupancy_anomalies"("resolved");

-- AddForeignKey
ALTER TABLE "occupancy_anomalies" ADD CONSTRAINT "occupancy_anomalies_occupancyEventId_fkey" FOREIGN KEY ("occupancyEventId") REFERENCES "occupancy_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_anomalies" ADD CONSTRAINT "occupancy_anomalies_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "cameras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy_anomalies" ADD CONSTRAINT "occupancy_anomalies_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
