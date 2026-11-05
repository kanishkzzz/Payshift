# Tracky (Payshift)

**High-Reliability Coaching Institute Fee Collection, Idempotent Ledger Engine, Payment Reconciliation & Automated Invoicing System**

Tracky is an enterprise-grade financial management platform designed for offline and hybrid coaching institutes. It manages multi-centre batch enrolments, automated fee instalment calculation, parent self-service payments, real-time gateway webhook reconciliation, sequential GST invoicing, automated multi-lingual payment reminders, policy-driven fee refunds, aging dues analytics, and native Tally ERP integration.

---

## Table of Contents

- [Architectural Highlights](#architectural-highlights)
- [System Principles & Invariants](#system-principles--invariants)
- [Current Implementation Status](#current-implementation-status)
- [Directory & Project Structure](#directory--project-structure)
- [API Reference](#api-reference)
- [Database Schema & Domain Models](#database-schema--domain-models)
- [Verification & Test Coverage](#verification--test-coverage)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)

---

## Architectural Highlights

* **Pure Domain Core**: Absolute separation between pure financial business rules (`ledger-math.ts`, `reminder-rules.ts`, `refund-math.ts`, `reports-math.ts`) and database I/O. All monetary arithmetic is computed in integer **Paise** (1 Rupee = 100 Paise) to eliminate floating-point rounding errors.
* **IST Calendar Arithmetic**: Due dates, grace periods, reminder schedules, and aging day calculations anchor strictly to Indian Standard Time (IST, UTC+5:30) calendar days (`YYYY-MM-DD`), preventing off-by-one errors across midnight boundaries.
* **Webhook as Source of Truth**: Only cryptographically verified payment gateway webhooks (or audited staff manual matches) can mutate money state. Client-side browser redirects or success callbacks never alter financial records.
* **Atomic Single-Transaction Writes**: Matched payments, oldest-first allocations, sequential receipt generation, reminder suppression, and audit trail records commit inside a single database transaction (`prisma.$transaction`).
* **Sequential GST Receipts with Row-Level Locking**: Receipts utilize atomic sequence tracking (`ReceiptSequence`) locked with `SELECT ... FOR UPDATE` per centre and financial year, guaranteeing continuous, gapless receipt numbers (`RCP-YYYY-CTR-XXXX`).
* **Anti-IDOR Parent Self-Service**: Guardians authenticate passwordlessly via 6-digit phone OTPs. All parent endpoints derive identity strictly from the authenticated session and enforce multi-ward phone linkage to prevent Insecure Direct Object References (IDOR).
* **Automated 4-Tier Reminder Engine**: Scheduled reminders (`BEFORE_DUE`, `ON_DUE`, `AFTER_DUE`, `ESCALATION`) with multi-lingual templates (English/Hindi), consent checks, and automatic stop-on-paid suppression.
* **Tally ERP Integration & Aging Reports**: Dues aging buckets (0–30, 31–60, 61–90, 90+ days) and standard Tally-compliant XML export for automated accounting ingestion.

---

## System Principles & Invariants

| Principle | Implementation |
| :--- | :--- |
| **Monetary Precision** | All monetary inputs, storage, and calculations use integer **Paise** (`BigInt` / `amountPaise`). Conversion to Rupees is strictly for presentation (`paiseToDecimal`). |
| **No Mutable "Paid" Flag** | Instalment settlement is derived dynamically from allocation records (`balance = amountPaise - sum(allocations)`). An instalment is never stored with a mutable boolean "paid" flag. |
| **Oldest-First Allocation** | Incoming payments allocate automatically against the earliest due instalments first. Any surplus amount remains unallocated as customer credit. |
| **Strict Data Retention (`Restrict`)** | `onDelete: Restrict` is enforced on all financial, enrolment, instalment, payment, and DPDP consent relations. Student records are soft-deleted (`status = "ARCHIVED"`) to protect financial history. |
| **Timing-Safe Webhook Verification** | Webhook HMAC signatures are verified using constant-time comparison (`crypto.timingSafeEqual`) **before** reading or parsing the JSON payload. |
| **Idempotent Webhooks** | Duplicate webhook deliveries are deduplicated via `ProcessedWebhookEvent` and `Payment.gatewayRef`, immediately returning HTTP 200 without duplicate ledger mutations. |
| **Stop-on-Paid Reminders** | Reminders scheduled for an instalment are automatically updated to `SUPPRESSED_PAID` upon settlement, preventing harassment of settled parents. |
| **Audited Staff Actions** | Staff cannot alter allocations or process refunds without recorded actions (`MANUAL_PAYMENT_MATCH`, `REFUND_APPROVED`, etc.) logging the actor ID, timestamp, and entity state. |

---

## Current Implementation Status

### 1. Authentication & Identity Management
- [x] **Guardian Passwordless Flow**: Phone-based 6-digit OTP verification with 5-minute validity (`/api/auth/otp/send`, `/api/auth/otp/verify`).
- [x] **Staff Password Authentication**: Role-based authentication (`ADMIN`, `ACCOUNTS`, `COUNSELLOR`, `TEACHER`) with BCrypt hash verification (`/api/auth/login`).
- [x] **Secure Session Engine**: Cryptographically random 32-byte tokens hashed with SHA-256 for database storage, distributed via secure `httpOnly` cookies with fallback to `Authorization: Bearer <token>`.
- [x] **Route Guards**:
  - `requireParent(req)`: Derives `guardianId` strictly from the session; rejects requests that attempt to tamper with guardian identity.
  - `requireStaff(allowedRoles, req)`: Enforces role boundaries (e.g. `ACCOUNTS` / `ADMIN` for financial actions).

### 2. Pure Ledger Domain Engine
- [x] **`generateInstalments(totalPaise, discountPaise, registrationPaise, count, startDate)`**:
  - Accurately accounts for non-discountable registration fees and student discounts.
  - Divides instalments evenly and absorbs remainder Paise into the final instalment.
  - Generates IST calendar due dates (`YYYY-MM-DD`).
- [x] **`allocatePayment(amountPaise, openInstalments)`**:
  - Deterministically sorts open instalments by due date, sequence number, and ID.
  - Supports full and partial payments.
  - Returns allocations array and returns unallocated balance if total payment exceeds outstanding fees.
- [x] **`daysOverdue(instalment, asOfDate, graceDays)`**:
  - Compares calendar dates in IST.
  - Respects configurable grace periods (e.g. 3 days). Returns `0` if paid or within grace period.
- [x] **`balance(instalments, allocations)`**:
  - Aggregates allocations per instalment without floating-point errors.
  - Calculates total fee, total paid, total remaining, and overall settlement status.
- [x] **`getStudentLedger(studentId, asOfDate)`**:
  - High-level orchestration function to fetch and compute a student's full financial statement in a single call.

### 3. Payment Gateway & Webhook Architecture
- [x] **`PaymentGateway` Adapter Contract**: Uniform interface for order creation, webhook verification, checkout payloads, and event normalization.
- [x] **`MockGateway`**: Deterministic order IDs, local checkout URL generation, and HMAC-SHA256 test webhook signing.
- [x] **`RazorpayGateway`**: Production-ready Razorpay integration running in test mode, reading credentials exclusively from environment variables.
- [x] **Flow 1: Parent Order Creation (`POST /api/parent/instalments/[instalmentId]/pay`)**:
  - Verifies that the instalment belongs to a student linked to the authenticated guardian.
  - Returns 404 (not 403) on unlinked instalments to prevent identifier enumeration.
  - Returns 400 (`alreadyPaid: true`) if the instalment balance is already 0.
  - Creates a `PaymentOrder` record (`status = "CREATED"`) and returns checkout payload.
  - Rate-limited per guardian.
- [x] **Flow 2: Webhook Processor (`POST /api/webhooks/payments`)**:
  - Verifies HMAC signature before reading body.
  - Idempotency check returns 200 on duplicate deliveries.
  - Unknown gateway orders routed to `UNMATCHED` queue with reason recorded.
  - Mismatched amounts routed to `UNMATCHED` queue without allocating funds.
  - Valid matches execute in an atomic transaction: creates `Payment`, allocates oldest-first, marks order `PAID`, issues locked sequential receipt, suppresses scheduled reminders, logs audit trail.
- [x] **Flow 3: Staff Unmatched Payments Queue**:
  - `GET /api/staff/unmatched-payments`: Lists unmatched payments for accounts staff.
  - `POST /api/staff/unmatched-payments/[id]/match`: Manually matches payment to a student with atomic allocation and receipt generation.
  - `POST /api/staff/unmatched-payments/[id]/reject`: Marks payment as `REJECTED` and retains it permanently for financial audit trails.

### 4. Automated Reminders Engine
- [x] **4-Tier Cadence Planner**:
  - `BEFORE_DUE`: 3 days before due date ($T-3$).
  - `ON_DUE`: On the due date ($T-0$).
  - `AFTER_DUE`: 3 days after due date ($T+3$, end of grace period).
  - `ESCALATION`: 7 days after due date ($T+7$).
- [x] **Multi-Lingual Templates**: English (`EN`) and Hindi (`HI`) message templates with dynamic placeholders (`studentName`, `amount`, `dueDate`, `payLink`).
- [x] **Consent & Suppression Checks**:
  - Automatically checks if DPDP consent has been withdrawn.
  - Re-checks instalment outstanding balance prior to dispatch; suppresses reminder if paid.
- [x] **Automated Cron Handler (`/api/cron`)**:
  - Secured with constant-time `CRON_SECRET` Bearer token authentication.
  - Supports `?date=YYYY-MM-DD` override for development and staging back-testing.

### 5. Policy-Driven Fee Refunds
- [x] **Refund Policy Calculator (`calculateRefundAmount`)**:
  - Configurable cooling-off period (e.g. 7 days for full tuition refund).
  - Non-refundable registration fee deduction.
  - Pro-rata tuition deduction based on course days elapsed.
- [x] **Refund State Machine**:
  - Workflow: `REQUESTED` $\rightarrow$ `APPROVED` | `REJECTED` $\rightarrow$ `SETTLED`.
  - Atomically validates available balance to prevent refunding uncollected funds.
  - Full staff review endpoints (`/api/staff/refunds`, `/api/staff/refunds/[id]`).

### 6. Aging Dues Reports & Tally XML Export
- [x] **Aging Dues Buckets (`ReportsService.getDuesReport`)**:
  - Groups overdue student balances into standard aging buckets: `CURRENT` (0–30), `OVERDUE_31_60` (31–60), `OVERDUE_61_90` (61–90), `OVERDUE_90_PLUS` (90+).
  - Provides institute-level and centre-level rollups.
- [x] **Tally ERP 9 / TallyPrime XML Export (`ReportsService.generateTallyXml`)**:
  - Generates accounting vouchers (`Receipt` type) in standard Tally XML format.
  - Automatically splits payments into Taxable Value, CGST (9%), and SGST (9%) ledgers.

### 7. Parent Self-Service Portal & GST Receipts
- [x] **Parent Dues Overview (`/api/parent/dues`)**: Lists all open enrolments and instalments across all children linked to the guardian's phone number.
- [x] **Parent Receipt History (`/api/parent/receipts`)**: Securely lists historical receipts for linked wards.
- [x] **Printable GST Receipt View (`/api/parent/receipts/[receiptId]`)**:
  - Self-contained, responsive HTML receipt ready for print/PDF export.
  - Enforces strict Anti-IDOR protection (returns 404 for non-linked receipts).
  - Hardened with Content-Security-Policy headers (`default-src 'none'; style-src 'unsafe-inline'`) and HTML text sanitization.

### 8. Database Schema & Cohort Seed
- [x] 17 Prisma models covering Centres, Batches, Students, Guardians, Consents, Fee Plans, Instalments, Payment Orders, Payments, Allocations, Receipts, Reminders, Refund Policies, Refund Cases, Attendance, Test Scores, Risk Flags, and Counsellor Tasks.
- [x] Deterministic seed script (`prisma/seed.ts`) using a fixed PRNG (seed: `20261103`) generating 63 students across 4 batches with benchmark profiles:
  - **STU-0587**: ₹30,000 fee, ₹15,000 paid, ₹15,000 overdue (23 days overdue).
  - **STU-0412**: ₹20,000 fee, ₹20,000 paid, ₹0 balance (0 days overdue).
  - **STU-0219**: ₹25,000 fee, due 2026-11-15 (not overdue).

---

## Directory & Project Structure

```text
Tracky/
├── prisma/
│   ├── schema.prisma                  # PostgreSQL schema with indexes and invariants
│   ├── seed.ts                        # Idempotent PRNG cohort seed (63 students)
│   └── migrations/                    # Version-controlled SQL migrations
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx         # Unified login (Guardian OTP + Staff Password)
│   │   │   └── signup/page.tsx        # Guardian signup with OTP verification
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts     # Staff credentials login
│   │   │   │   ├── logout/route.ts    # Session revocation & cookie clearance
│   │   │   │   ├── me/route.ts        # Authenticated caller profile
│   │   │   │   ├── otp/
│   │   │   │   │   ├── send/route.ts  # 6-digit OTP generation with rate limits
│   │   │   │   │   └── verify/route.ts# OTP validation & parent session creation
│   │   │   │   └── signup/route.ts    # Guardian registration
│   │   │   ├── cron/
│   │   │   │   └── route.ts           # Vercel Cron handler for daily reminder job
│   │   │   ├── parent/
│   │   │   │   ├── dues/route.ts      # Parent self-service dues statement
│   │   │   │   ├── instalments/[instalmentId]/
│   │   │   │   │   ├── pay/route.ts   # Parent payment order generation
│   │   │   │   │   └── pay/verify/route.ts # Checkout payment verification
│   │   │   │   └── receipts/
│   │   │   │       ├── route.ts       # Guardian receipt list
│   │   │   │       └── [receiptId]/route.ts # Printable GST receipt HTML
│   │   │   ├── staff/
│   │   │   │   ├── dues/route.ts      # Staff aging dues analytics report
│   │   │   │   ├── refunds/
│   │   │   │   │   ├── route.ts       # List/create refund cases
│   │   │   │   │   └── [id]/route.ts  # Approve/reject/settle refund case
│   │   │   │   ├── tally-exports/route.ts # Tally XML voucher export
│   │   │   │   └── unmatched-payments/
│   │   │   │       ├── route.ts       # List unallocated payments (ACCOUNTS role)
│   │   │   │       └── [id]/
│   │   │   │           ├── match/route.ts  # Transactional manual matching
│   │   │   │           └── reject/route.ts # Mark payment as rejected
│   │   │   └── webhooks/
│   │   │       ├── route.ts           # Default gateway webhook handler
│   │   │       └── payments/route.ts  # Payments-specific webhook processor
│   ├── lib/
│   │   ├── auth/session.ts            # Session token generation, SHA-256 & cookies
│   │   ├── prisma.ts                  # Neon serverless Prisma client instance
│   │   ├── rate-limit.ts              # In-memory sliding window rate limiter
│   │   └── __tests__/prisma.test.ts   # Schema, constraints & benchmark seed tests
│   └── modules/
│       ├── auth/                      # Authentication service, guards & types
│       ├── ledger/                    # Pure domain math, IST utils & student ledger
│       ├── parent/                    # Parent portal service, dues & HTML receipt view
│       ├── payments/                  # Gateway adapters, GST splits & payment service
│       ├── refunds/                   # Policy-driven refund calculation & state service
│       ├── reminders/                 # 4-tier reminder cadence, templates & dispatch
│       └── reports/                   # Aging dues bucket calculations & Tally XML export
├── vercel.json                        # Vercel Cron schedule configuration
├── .env.example                       # Documented environment variable template
├── package.json                       # Dependencies & project scripts
├── tsconfig.json                      # Strict TypeScript configuration
└── vitest.config.mts                  # Vitest configuration with path aliases
```

---

## API Reference

### Parent & Authentication Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/otp/send` | Public | Generates a 6-digit OTP sent to guardian phone (max 3 per 15 min). |
| `POST` | `/api/auth/otp/verify` | Public | Verifies OTP code and establishes parent session cookie. |
| `POST` | `/api/auth/login` | Public | Staff email/password login with role assignment. |
| `POST` | `/api/auth/logout` | Authenticated | Revokes session token in DB and clears session cookie. |
| `GET` | `/api/auth/me` | Authenticated | Returns currently authenticated user or guardian details. |
| `GET` | `/api/parent/dues` | Parent Only | Returns dues and open instalments for all linked wards. |
| `POST` | `/api/parent/instalments/:id/pay` | Parent Only | Creates gateway payment order for instalment balance. |
| `POST` | `/api/parent/instalments/:id/pay/verify` | Parent Only | Verifies checkout signature and confirms order settlement. |
| `GET` | `/api/parent/receipts` | Parent Only | Lists payment receipts for guardian's linked students. |
| `GET` | `/api/parent/receipts/:id` | Parent Only | Renders standalone printable HTML GST receipt with CSP headers. |

### Webhook & Cron Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/webhooks/payments` | Public (Signed) | Authoritative payment webhook processor with HMAC validation. |
| `GET` | `/api/cron` | `CRON_SECRET` | Scheduled cron handler for daily reminder planning and dispatch. |

### Staff Management Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/staff/dues` | `ACCOUNTS`, `ADMIN` | Returns aging dues report aggregated by centre and aging bucket. |
| `GET` | `/api/staff/tally-exports` | `ACCOUNTS`, `ADMIN` | Exports payment receipts as Tally-compatible XML vouchers. |
| `GET` | `/api/staff/refunds` | `ACCOUNTS`, `ADMIN` | Lists refund cases with status filters. |
| `POST` | `/api/staff/refunds` | `ACCOUNTS`, `ADMIN` | Initiates a refund case with automated policy calculation. |
| `POST` | `/api/staff/refunds/:id` | `ACCOUNTS`, `ADMIN` | Approves, rejects, or settles a refund case. |
| `GET` | `/api/staff/unmatched-payments` | `ACCOUNTS`, `ADMIN` | Lists payments requiring manual review and matching. |
| `POST` | `/api/staff/unmatched-payments/:id/match` | `ACCOUNTS`, `ADMIN` | Atomically matches payment to student with locked receipt. |
| `POST` | `/api/staff/unmatched-payments/:id/reject` | `ACCOUNTS`, `ADMIN` | Marks unmatched payment as `REJECTED` (never deleted). |

---

## Database Schema & Domain Models

```mermaid
erDiagram
    Centre ||--o{ Batch : operates
    Centre ||--o{ ReceiptSequence : maintains
    Batch ||--o{ Student : contains
    Batch ||--o{ FeePlan : offers
    Student ||--o{ Guardian : "represented by"
    Student ||--o{ Enrollment : holds
    Student ||--o{ Payment : "credited to"
    Student ||--o{ Consent : grants
    FeePlan ||--o{ Enrollment : defines
    Enrollment ||--o{ Instalment : schedules
    Enrollment ||--o{ RefundCase : receives
    Instalment ||--o{ PaymentOrder : creates
    Instalment ||--o{ Allocation : receives
    Instalment ||--o{ Reminder : triggers
    Payment ||--o{ Allocation : settles
    Payment ||--o| Receipt : generates
    RefundPolicy ||--o{ RefundCase : governs
```

---

## Verification & Test Coverage

The system maintains a comprehensive test suite executed with Vitest:

```bash
npm test
```

### Test Suite Summary (**135 / 135 Passing**)

* **`src/modules/ledger/__tests__/ledger-math.test.ts` (48 tests)**:
  * Benchmarks STU-0587 (₹15,000 balance, 23 days overdue), STU-0412 (₹0 balance, 0 days), STU-0219 (not overdue).
  * Integer paise math, exact remainder allocation, oldest-first sequencing, and boundary grace period testing.
* **`src/modules/payments/__tests__/payment-flows.test.ts` (16 tests)**:
  * Gateway adapters, timing-safe webhook verification, idempotency, unknown/mismatched order routing, atomic matching, and staff manual reconciliation.
* **`src/modules/auth/__tests__/auth.test.ts` (15 tests)**:
  * 6-digit OTP generation, expiration, rate-limiting, staff BCrypt validation, and session revocation.
* **`src/modules/reminders/__tests__/` (20 tests)**:
  * 4-tier reminder cadence calculation (`reminder-rules.test.ts` - 17 tests).
  * Automated scheduling, dispatching, deduplication, and stop-on-paid suppression (`reminder-service.test.ts` - 3 tests).
* **`src/modules/refunds/__tests__/refund-math.test.ts` (9 tests)**:
  * Policy evaluation: cooling-off period rules, non-refundable registration fee retention, and pro-rata deduction.
* **`src/modules/reports/__tests__/` (15 tests)**:
  * Aging dues bucket categorization (`0–30`, `31–60`, `61–90`, `90+` days) and Tally XML voucher schema validation.
* **`src/modules/parent/__tests__/parent-service.test.ts` (5 tests)**:
  * Multi-ward dues calculation, anti-IDOR protection on receipt downloads, HTML sanitization, and CGST/SGST splitting.
* **`src/lib/__tests__/prisma.test.ts` (7 tests)**:
  * Neon PostgreSQL connectivity, `Restrict` cascade invariants, and benchmark cohort verification.

---

## Getting Started

### Prerequisites

* Node.js 18.x or 20.x
* PostgreSQL database (Neon Serverless recommended)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kanishkzzz/Payshift.git
   cd Payshift
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your PostgreSQL database URL and session secret.

4. **Sync database schema:**
   ```bash
   npm run db:push
   ```

5. **Seed demo cohort and benchmarks:**
   ```bash
   npm run db:seed
   ```

6. **Run automated test suite:**
   ```bash
   npm test
   ```

7. **Start local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## Environment Configuration

See [`.env.example`](./.env.example) for the full list of configurable keys:

```ini
# Database (Neon Serverless PostgreSQL)
DATABASE_URL="postgresql://user:password@ep-xyz.region.neon.tech/tracky?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-xyz.region.neon.tech/tracky?sslmode=require"

# App & Auth Secrets
SESSION_SECRET="your-32-byte-hex-or-base64-random-secret"
AUTH_SECRET="tracky-super-secret-auth-key-at-least-32-chars-long"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Cron Security
CRON_SECRET="tracky-cron-secret-token"

# Payment Gateway Configuration (Options: "mock" | "razorpay")
PAYMENT_GATEWAY="mock"
MOCK_PAYMENT_WEBHOOK_SECRET="mock_tracky_webhook_secret_key_2026"

# Razorpay Configuration (Test Mode)
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
```
