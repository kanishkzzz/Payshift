# Tracky

Tracky is a fee operations application for coaching institutes. It brings parent fee access, staff collections and reconciliation, refund workflows, and counsellor risk follow-up into one web app.

## What is implemented

- **Parent portal:** sign in with a phone OTP, view linked students' dues and receipts, pay instalments, and choose English or Hindi for fee reminder messages. The language preference applies to messages, not the website interface.
- **Accounts workspace:** review centre-scoped dues, reconcile unmatched payments, manage refunds, and export receipt data as CSV for accounting handoff.
- **Counsellor workspace:** review risk flags and manage follow-up tasks.
- **Marketing pages:** landing page, product overview, and parent guide.
- **Payment flows:** a simulated checkout is available for local development. Razorpay can be configured with test credentials.

See [`docs/frontend-actions-and-routes.md`](docs/frontend-actions-and-routes.md) for the current page and action inventory, and [`docs/HLD.md`](docs/HLD.md) for the system design and implementation scope.

## Requirements

- Node.js 20 or newer
- npm
- A reachable PostgreSQL database. The Prisma client is configured with `@prisma/adapter-neon`; a Neon database is the expected setup.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file from the template:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Edit `.env` and set valid database connection values, including `DIRECT_URL`. Do not commit `.env` or `.env.local`.

   Next.js also reads `.env.local` when running the web app. Prisma CLI commands and the seed script load `.env` through dotenv, so keep the database variables in `.env` as well if you use `.env.local` for Next.js.

4. Apply the Prisma schema and load the demo data:

   ```bash
   npm run db:push
   npm run db:seed
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

The database must be reachable before staff login, parent OTP, or the authenticated portals can work. If you see a Neon network or WebSocket handshake error, check the database URL and network access, then restart the dev server.

## Vercel deployment

Configure the required server environment variables in the Vercel project settings; local `.env.local` values are not deployed. At minimum, set `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`, and `CRON_SECRET`. To enable parent profile photo uploads, connect a Vercel Blob store and set `BLOB_READ_WRITE_TOKEN`. For real payments, set `PAYMENT_GATEWAY=razorpay`, add the Razorpay credentials, and configure the Razorpay webhook to call `/api/webhooks/payments` with the matching webhook secret.

Before serving traffic after a schema change, run `npm run db:migrate` against the production database from a trusted environment with the production `DIRECT_URL`. Vercel builds do not change the database schema. The scheduled reminder job calls `/api/cron` once per day and requires `CRON_SECRET`.

## Demo sign-in

The seed script creates the following local staff accounts. They are for development only:

| Role | Email | Password |
| --- | --- | --- |
| Accounts | `accounts@tracky.edu` | `Staff@123` |
| Counsellor | `counsellor@tracky.edu` | `Staff@123` |
| Admin | `admin@tracky.edu` | `Staff@123` |

The demo parent phone number is `+910000000001`. In non-production mode, the OTP appears on the login page and in the development server output. No SMS provider is integrated, so an SMS will not arrive. For a public reviewer deployment, set `DEMO_PARENT_PHONE` and `DEMO_PARENT_OTP` in Vercel for this seeded parent. Production uses the configured six-digit code only for the exact demo phone and only when its seeded guardian exists. Keep this enabled only with an isolated demo database containing synthetic records.

Staff demo accounts are available only after `npm run db:seed` has completed successfully against the same database used by the app.

## Environment variables

Copy `.env.example` to `.env` and configure the values for your environment. The example file contains placeholders; replace them before use.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled PostgreSQL connection used by the app and integration tests. |
| `DATABASE_URL_POOLED` | Optional pooled URL alias; takes precedence over `DATABASE_URL` at runtime. |
| `DIRECT_URL` | Direct database connection used by Prisma CLI migrations and as a runtime fallback. |
| `NEXT_PUBLIC_APP_URL` | Base URL of the app, such as `http://localhost:3000`. |
| `DEMO_PARENT_PHONE`, `DEMO_PARENT_OTP` | Optional production reviewer OTP restricted to one seeded synthetic parent account. |
| `PAYMENT_GATEWAY` | Selects the `mock` or `razorpay` payment integration. |
| `MOCK_GATEWAY_SECRET`, `MOCK_PAYMENT_WEBHOOK_SECRET` | Secrets for the mock payment integration and webhook verification. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay test or production credentials, when using Razorpay. |
| `CRON_SECRET` | Bearer secret required by the scheduled reminder endpoint. |
| `MOCK_SMS_GATEWAY_API_KEY` | Placeholder only. There is no SMS integration yet. |
| `RAZORPAY_SETTLE_ON_VERIFY` | Enables settlement during checkout verification when set to `true`; otherwise configure the Razorpay webhook for authoritative settlement. |
| `RISK_LLM_PROVIDER` | Keep set to `mock`; other providers are not implemented. |
| `INSTITUTE_NAME` | Optional institute label used in parent-facing receipts and reminders. |

Never put real credentials in source control or expose server-only secrets through `NEXT_PUBLIC_` variables.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run build` | Build the production app. |
| `npm run start` | Serve a production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript checking. |
| `npm run db:generate` | Generate the Prisma client. |
| `npm run db:push` | Apply the Prisma schema to the configured database. |
| `npm run db:migrate` | Apply committed migrations to the configured database (use for deployments). |
| `npm run db:seed` | Load demo institutes, staff accounts, and student/fee data. |
| `npm run db:studio` | Open Prisma Studio for the configured database. |
| `npm test` | Run the Vitest suite. |

## Project structure

```text
prisma/                 Prisma schema and development seed
src/app/                Next.js pages, route handlers, and server actions
src/components/         Shared interface components
src/lib/                Prisma client, auth/session helpers, and utilities
src/modules/            Auth, ledger, payments, parent, refunds, reminders, reports
docs/HLD.md             High-level design and current implementation notes
docs/frontend-actions-and-routes.md  Frontend routes, actions, and workflows
```

## Current limitations

- Parent OTPs are displayed only in development; production SMS/WhatsApp delivery needs a provider integration.
- English/Hindi is a parent message preference; the application UI is currently English.
- The local mock checkout simulates a payment and does not charge a card or bank account.
- CSV export is an accounting handoff; it is not a live Tally integration.
- Demo accounts and seed records are sample data. Change the demo secrets before exposing an environment publicly.
