-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "PreferredLang" AS ENUM ('EN', 'HI');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('ONLINE_GATEWAY', 'UPI_DIRECT', 'BANK_TRANSFER', 'CASH', 'CHEQUE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED', 'SUPPRESSED_PAID');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SETTLED');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'CONFIRMED', 'FALSE_FLAG');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTS', 'COUNSELLOR');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('STAFF', 'PARENT');

-- CreateTable
CREATE TABLE "centres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "gstin" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "centre_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course_start" TIMESTAMP(3) NOT NULL,
    "course_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3),
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "left_on" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "student_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "relation" TEXT NOT NULL DEFAULT 'GUARDIAN',
    "preferred_lang" "PreferredLang" NOT NULL DEFAULT 'EN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "student_id" TEXT,
    "notice_version" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "withdrawn_at" TIMESTAMP(3),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_plans" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "name" TEXT,
    "total_paise" BIGINT NOT NULL,
    "registration_paise" BIGINT NOT NULL,
    "instalment_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "discount_paise" BIGINT NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instalments" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "grace_days" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instalments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "instalment_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "gateway_order_id" TEXT NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT,
    "amount_paise" BIGINT NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "gateway_ref" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PaymentStatus" NOT NULL DEFAULT 'MATCHED',
    "notes" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "instalment_id" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "taxable_paise" BIGINT NOT NULL,
    "gst_paise" BIGINT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "instalment_id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "response_log" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_policies" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "rules_json" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_cases" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "leave_date" TIMESTAMP(3) NOT NULL,
    "computed_paise" BIGINT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "settled_by_id" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "paid_by_date" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "present" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_scores" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "test_name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "max_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_flags" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons_json" JSONB NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counsellor_tasks" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "flag_id" TEXT,
    "assignee_id" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counsellor_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ACCOUNTS',
    "centre_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_sessions" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batches_centre_id_idx" ON "batches"("centre_id");

-- CreateIndex
CREATE INDEX "students_batch_id_idx" ON "students"("batch_id");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "guardians_student_id_idx" ON "guardians"("student_id");

-- CreateIndex
CREATE INDEX "guardians_phone_idx" ON "guardians"("phone");

-- CreateIndex
CREATE INDEX "guardians_email_idx" ON "guardians"("email");

-- CreateIndex
CREATE INDEX "consents_guardian_id_idx" ON "consents"("guardian_id");

-- CreateIndex
CREATE INDEX "consents_student_id_idx" ON "consents"("student_id");

-- CreateIndex
CREATE INDEX "fee_plans_batch_id_idx" ON "fee_plans"("batch_id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE INDEX "enrollments_plan_id_idx" ON "enrollments"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_plan_id_key" ON "enrollments"("student_id", "plan_id");

-- CreateIndex
CREATE INDEX "instalments_due_date_idx" ON "instalments"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "instalments_enrollment_id_seq_key" ON "instalments"("enrollment_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_gateway_order_id_key" ON "payment_orders"("gateway_order_id");

-- CreateIndex
CREATE INDEX "payment_orders_instalment_id_idx" ON "payment_orders"("instalment_id");

-- CreateIndex
CREATE INDEX "payment_orders_guardian_id_idx" ON "payment_orders"("guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_ref_key" ON "payments"("gateway_ref");

-- CreateIndex
CREATE INDEX "payments_student_id_idx" ON "payments"("student_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "allocations_payment_id_idx" ON "allocations"("payment_id");

-- CreateIndex
CREATE INDEX "allocations_instalment_id_idx" ON "allocations"("instalment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_no_key" ON "receipts"("receipt_no");

-- CreateIndex
CREATE INDEX "reminders_scheduled_for_status_idx" ON "reminders"("scheduled_for", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_instalment_id_template_key_scheduled_for_key" ON "reminders"("instalment_id", "template_key", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "refund_policies_version_key" ON "refund_policies"("version");

-- CreateIndex
CREATE INDEX "refund_cases_enrollment_id_idx" ON "refund_cases"("enrollment_id");

-- CreateIndex
CREATE INDEX "refund_cases_policy_version_idx" ON "refund_cases"("policy_version");

-- CreateIndex
CREATE INDEX "refund_cases_approved_by_id_idx" ON "refund_cases"("approved_by_id");

-- CreateIndex
CREATE INDEX "refund_cases_settled_by_id_idx" ON "refund_cases"("settled_by_id");

-- CreateIndex
CREATE INDEX "refund_cases_paid_by_date_status_idx" ON "refund_cases"("paid_by_date", "status");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_date_idx" ON "attendance_records"("student_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_student_id_date_key" ON "attendance_records"("student_id", "date");

-- CreateIndex
CREATE INDEX "test_scores_student_id_date_idx" ON "test_scores"("student_id", "date");

-- CreateIndex
CREATE INDEX "risk_flags_student_id_idx" ON "risk_flags"("student_id");

-- CreateIndex
CREATE INDEX "risk_flags_status_idx" ON "risk_flags"("status");

-- CreateIndex
CREATE INDEX "counsellor_tasks_student_id_idx" ON "counsellor_tasks"("student_id");

-- CreateIndex
CREATE INDEX "counsellor_tasks_assignee_id_idx" ON "counsellor_tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "counsellor_tasks_status_idx" ON "counsellor_tasks"("status");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "otp_sessions_phone_idx" ON "otp_sessions"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_subject_type_subject_id_idx" ON "sessions"("subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "fee_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instalments" ADD CONSTRAINT "instalments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_instalment_id_fkey" FOREIGN KEY ("instalment_id") REFERENCES "instalments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_instalment_id_fkey" FOREIGN KEY ("instalment_id") REFERENCES "instalments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_instalment_id_fkey" FOREIGN KEY ("instalment_id") REFERENCES "instalments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_policy_version_fkey" FOREIGN KEY ("policy_version") REFERENCES "refund_policies"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_settled_by_id_fkey" FOREIGN KEY ("settled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_scores" ADD CONSTRAINT "test_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counsellor_tasks" ADD CONSTRAINT "counsellor_tasks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counsellor_tasks" ADD CONSTRAINT "counsellor_tasks_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "risk_flags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counsellor_tasks" ADD CONSTRAINT "counsellor_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "centres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
