-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ExplanationSource" AS ENUM ('TEMPLATE', 'LLM');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "risk_flags" ADD COLUMN     "as_of_date" TIMESTAMP(3),
ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "explanation_source" "ExplanationSource" NOT NULL DEFAULT 'TEMPLATE',
ADD COLUMN     "features_json" JSONB,
ADD COLUMN     "model_version" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "review_reason" TEXT,
ADD COLUMN     "tier" "RiskTier" NOT NULL DEFAULT 'LOW';

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ONLINE_GATEWAY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sequences_centre_id_financial_year_key" ON "receipt_sequences"("centre_id", "financial_year");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_event_id_key" ON "processed_webhook_events"("event_id");

-- CreateIndex
CREATE INDEX "risk_flags_tier_status_idx" ON "risk_flags"("tier", "status");

-- CreateIndex
CREATE INDEX "risk_flags_reviewed_by_idx" ON "risk_flags"("reviewed_by");

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centres"("id") ON DELETE CASCADE ON UPDATE CASCADE;
