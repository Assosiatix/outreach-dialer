-- Per-call cost tracking, cached voice rates, app settings (budget).
CREATE TYPE "CostStatus" AS ENUM ('none', 'estimated', 'final');

ALTER TABLE "call_logs"
  ADD COLUMN "rate_micros" INTEGER,
  ADD COLUMN "cost_call_micros" INTEGER,
  ADD COLUMN "cost_client_micros" INTEGER,
  ADD COLUMN "cost_recording_micros" INTEGER,
  ADD COLUMN "cost_total_micros" INTEGER,
  ADD COLUMN "cost_status" "CostStatus" NOT NULL DEFAULT 'none',
  ADD COLUMN "cost_checked_at" TIMESTAMP(3),
  ADD COLUMN "cost_attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "call_logs_cost_status_idx" ON "call_logs"("cost_status");

CREATE TABLE "voice_rates" (
  "number" TEXT NOT NULL,
  "outbound_micros" INTEGER,
  "inbound_micros" INTEGER,
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_rates_pkey" PRIMARY KEY ("number")
);

CREATE TABLE "app_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
