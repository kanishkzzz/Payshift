# Tracky (Payshift)

**High-Reliability Coaching Institute Fee Collection, Idempotent Ledger Engine & Payment Reconciliation System**

Tracky is a full-stack, enterprise-grade financial management platform designed for offline and hybrid coaching institutes. It manages multi-centre batch enrolments, automated fee instalment calculation, parent self-service payments, real-time webhook reconciliation, and sequential GST invoicing with strict audit trails.

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

* **Pure Domain Core**: Separation of financial calculation rules (`src/modules/ledger/ledger-math.ts`) from database access. All arithmetic is integer-based in **Paise** (1 Rupee = 100 Paise) to completely eliminate floating-point rounding errors.
* **IST Calendar Arithmetic**: Due dates, grace periods, and overdue day calculations are pinned to calendar dates in Indian Standard Time (IST, UTC+5:30) to eliminate off-by-one errors caused by UTC midnight boundaries.
* **Webhook as Source of Truth**: Only cryptographically verified payment gateway webhooks (or audited staff manual matches) can mark money as received. Client-side browser redirects or success callbacks never alter financial state.
* **Atomic Single-Transaction Writes**: Every matched payment, instalment allocation, sequential receipt generation, reminder suppression, and audit log write executes within a single database transaction (`prisma.$transaction`).
* **Sequential GST Receipts with Row-Level Locking**: Receipts use atomic sequence tracking (`ReceiptSequence`) locked with `SELECT ... FOR UPDATE` per centre and financial year to ensure zero gaps and no duplicate receipt numbers.
* **Passwordless OTP for Parents**: Parents/guardians authenticate exclusively via 6-digit SMS OTPs (5-minute expiry, rate-limited) without storing passwords. Staff authenticate via BCrypt passwords with granular role-based access control (RBAC).

---

## System Principles & Invariants

| Principle | Implementation |
| :--- | :--- |
| **Monetary Precision** | All monetary inputs, calculations, and database columns use integer **Paise** (`BigInt` / `amountPaise`). Conversion to Rupees is performed strictly for presentation. |
| **No Mutable "Paid" Flag** | Instalment settlement is derived dynamically from allocation records (`balance = amountPaise - sum(allocations)`). An instalment is never marked "paid" by a mutable boolean flag. |
| **Oldest-First Allocation** | Incoming payments are allocated automatically against the earliest due instalments first. Any surplus amount remains unallocated as an unapplied balance. |
| **Strict Data Retention (`Restrict`)** | `onDelete: Restrict` is enforced on all financial, enrolment, instalment, payment, and DPDP consent relations. Student records are soft-deleted (`status = "ARCHIVED"`) to protect financial history. |
| **Timing-Safe Webhook Verification** | Webhook HMAC signatures are verified using constant-time comparison (`crypto.timingSafeEqual`) **before** reading or parsing the JSON payload. |
| **Idempotent Webhooks** | Duplicate webhook deliveries are deduplicated via `ProcessedWebhookEvent` and `Payment.gatewayRef`, immediately returning HTTP 200 without duplicate ledger mutations. |
| **Staff Audit Trail** | Staff cannot alter allocations manually without using the audited `/match` action, which logs the staff member's ID, timestamp, and target student. |

---

## Current Implementation Status

### 1. Authentication & Identity Management
- [x] **Guardian Passwordless Flow**: Phone-based 6-digit OTP verification with 5-minute validity (`/api/auth/otp/send`, `/api/auth/otp/verify`).
- [x] **Staff Password Authentication**: Role-based authentication (`ADMIN`, `ACCOUNTS`, `COUNSELLOR`, `TEACHER`) with BCrypt hash verification (`/api/auth/login`).
- [x] **Secure Session Engine**: Cryptographically random 32-byte tokens hashed with SHA-256 for database storage, distributed via secure `httpOnly` cookies with fallback to `Authorization: Bearer <token>`.
- [x] **Context-Aware Error Handling**: Resilient cookie setting that avoids swallowing errors while handling Next.js server component read-only cookie contexts gracefully.
- [x] **Route Guards**:
  - `requireParent(req)`: Derives `guardianId` strictly from the session; rejects requests that attempt to tamper with guardian identity.
  - `requireStaff(allowedRoles, req)`: Enforces role boundaries (e.g. `ACCOUNTS` / `ADMIN` for payment management).

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
- [x] **`PaymentGateway` Adapter Contract**: Uniform interface for payment order creation, webhook verification, and event normalization.
- [x] **`MockGateway`**: Deterministic order IDs, local checkout URL generation, and HMAC-SHA256 test webhook signing.
- [x] **`RazorpayGateway`**: Production-ready Razorpay integration running in test mode, reading credentials exclusively from environment variables.
- [x] **Flow 1: Parent Order Creation (`POST /api/parent/instalments/[instalmentId]/pay`)**:
  - Verifies that the instalment belongs to a student linked to the authenticated guardian.
  - Returns 404 (not 403) on unlinked instalments to prevent identifier enumeration.
  - Returns 400 (`alreadyPaid: true`) if the instalment balance is already 0.
  - Creates a `PaymentOrder` record (`status = "CREATED"`) and returns the checkout URL.
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

### 4. Database Schema & Cohort Seed
- [x] 17 Prisma models covering Centres, Batches, Students, Guardians, Consents, Fee Plans, Instalments, Payment Orders, Payments, Allocations, Receipts, Reminders, Refund Policies, Attendance, Test Scores, Risk Flags, and Counsellor Tasks.
- [x] Deterministic seed script (`prisma/seed.ts`) using a fixed PRNG (seed: `20261103`) generating 63 students across 4 batches with benchmark profiles:
  - **STU-0587**: ₹30,000 fee, ₹15,000 paid, ₹15,000 overdue (exactly 23 days).
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
│   │   │   ├── parent/
│   │   │   │   └── instalments/
│   │   │   │       └── [instalmentId]/
│   │   │   │           └── pay/route.ts # Parent payment order generation
│   │   │   ├── staff/
│   │   │   │   └── unmatched-payments/
│   │   │   │       ├── route.ts       # List unallocated payments (ACCOUNTS role)
│   │   │   │       └── [id]/
│   │   │   │           ├── match/route.ts  # Transactional manual matching
│   │   │   │           └── reject/route.ts # Mark payment as rejected
│   │   │   └── webhooks/
│   │   │       └── payments/route.ts  # Payment gateway webhook processor
│   ├── lib/
│   │   ├── auth/
│   │   │   └── session.ts             # Session token generation, SHA-256 & cookies
│   │   ├── prisma.ts                  # Neon serverless Prisma client instance
│   │   ├── rate-limit.ts              # In-memory sliding window rate limiter
│   │   └── __tests__/
│   │       └── prisma.test.ts         # Schema, constraints & benchmark seed tests
│   └── modules/
│       ├── auth/
│       │   ├── auth-service.ts        # OTP & staff password authentication service
│       │   ├── guards.ts              # requireParent() and requireStaff() guards
│       │   ├── types.ts               # Auth DTOs, schemas & role definitions
│       │   └── __tests__/
│       │       └── auth.test.ts       # Auth workflow & security unit tests
│       ├── ledger/
│       │   ├── date-utils.ts          # IST calendar arithmetic & formatting
│       │   ├── ledger-math.ts         # Pure mathematical ledger calculations
│       │   ├── student-ledger.ts      # Single-call student ledger loader
│       │   ├── types.ts               # Ledger input/output interfaces
│       │   └── __tests__/
│       │       └── ledger-math.test.ts# 48 unit tests verifying edge cases
│       └── payments/
│           ├── gateways/
│           │   ├── index.ts           # Payment gateway factory
│           │   ├── mock-gateway.ts    # Deterministic mock gateway with HMAC signing
│           │   └── razorpay-gateway.ts# Razorpay REST API & webhook verifier
│           ├── services/
│           │   └── payment-service.ts # Payment order, webhook & manual match engine
│           ├── types.ts               # Payment gateways and webhook type definitions
│           └── __tests__/
│               └── payment-flows.test.ts # End-to-end integration tests for flows 1-3
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
| `POST` | `/api/parent/instalments/:id/pay` | Parent Only | Creates gateway payment order for instalment balance. |

### Webhook & Gateway Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/webhooks/payments` | Public (Signed) | Authoritative payment webhook processor with HMAC validation. |

### Staff Management Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
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
    Instalment ||--o{ PaymentOrder : creates
    Instalment ||--o{ Allocation : receives
    Payment ||--o{ Allocation : settles
    Payment ||--o| Receipt : generates
    Instalment ||--o{ Reminder : triggers
```

### Core Invariants

1. **`ReceiptSequence`**: `(centreId, financialYear)` unique compound key. Updated using `lastSeq = lastSeq + 1` within an atomic transaction protected by row locks.
2. **`Enrollment`**: Unique compound key `(studentId, planId)` prevents duplicate enrolments in the same plan.
3. **`ProcessedWebhookEvent`**: Unique `eventId` guarantees idempotency across payment provider webhook retries.
4. **`PaymentOrder`**: Unique `gatewayOrderId` maps incoming provider webhook transactions directly to an instalment and guardian.

---

## Verification & Test Coverage

The system maintains a comprehensive test suite executed with Vitest:

```bash
npm test
```

### Test Suite Summary (**86 / 86 Passing**)

* **`src/modules/ledger/__tests__/ledger-math.test.ts` (48 tests)**
  * Benchmarks STU-0587 (₹15,000 balance, 23 days overdue), STU-0412 (₹0 balance, 0 days), STU-0219 (not overdue).
  * Integer paise math and exact net fee remainder distribution into final instalments.
  * Oldest-due-date allocation order and partial payments.
  * Overpayment handling (surplus preserved as unallocated).
  * Boundary tests for grace periods (0 days vs 3 days).
  * Validation checks rejecting negative or decimal amounts.
* **`src/modules/payments/__tests__/payment-flows.test.ts` (16 tests)**
  * Mock and Razorpay timing-safe webhook HMAC verification.
  * Order creation with guardian authorization and 404 existence masking.
  * Idempotent webhook handling with zero duplicate ledger writes.
  * Automatic routing of unknown orders and mismatched amounts to `UNMATCHED`.
  * Atomic payment matching: payment recording, allocations, sequential receipt generation, reminder suppression, and audit logging.
  * Staff unmatched queue authorization, manual allocation, and non-destructive rejection.
* **`src/modules/auth/__tests__/auth.test.ts` (15 tests)**
  * 6-digit OTP generation, expiration, and rate-limiting.
  * Passwordless parent account creation without password hashes.
  * Staff BCrypt password verification and role assignment.
  * Session generation, validation, and revocation on logout.
* **`src/lib/__tests__/prisma.test.ts` (7 tests)**
  * Neon PostgreSQL database connectivity and table accessibility.
  * Referential integrity (`Restrict` delete protection on students).
  * Multi-table cohort seed verification across all 63 students.
  * Single-function-call ledger statement verification.

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

# Session Security
SESSION_SECRET="your-32-byte-hex-or-base64-random-secret"

# Payment Gateway Configuration
# Options: "mock" | "razorpay"
PAYMENT_GATEWAY="mock"
MOCK_PAYMENT_WEBHOOK_SECRET="mock_tracky_webhook_secret_key_2026"

# Razorpay Configuration (Test Mode)
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
```
