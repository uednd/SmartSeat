-- CreateEnum
CREATE TYPE "AnomalySource" AS ENUM ('SCHEDULER', 'MQTT', 'SYSTEM');

-- AlterTable
ALTER TABLE "anomaly_events"
  ADD COLUMN "source" "AnomalySource" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "resolved_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_events_pending_once_idx"
ON "anomaly_events" (
  "event_type",
  "seat_id",
  COALESCE("device_id", ''),
  COALESCE("reservation_id", '')
)
WHERE "status" = 'PENDING';
