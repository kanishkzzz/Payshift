-- CreateEnum
CREATE TYPE "RefundReasonCode" AS ENUM ('STUDENT_WITHDRAWAL', 'BATCH_CANCELLED', 'MEDICAL_GROUNDS', 'DOUBLE_PAYMENT', 'OTHER');

-- AlterTable: Add columns with default for existing data safety
ALTER TABLE "refund_cases" ADD COLUMN "reason_code" "RefundReasonCode" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "refund_cases" ADD COLUMN "reason_detail" TEXT;

-- Preserve data: copy existing reason into reason_detail
UPDATE "refund_cases" SET "reason_detail" = "reason";

-- Drop old reason column
ALTER TABLE "refund_cases" DROP COLUMN "reason";

-- Drop the temporary default on reason_code
ALTER TABLE "refund_cases" ALTER COLUMN "reason_code" DROP DEFAULT;

