# Tracky Deployment and Reviewer Login

## Project links

- GitHub: https://github.com/kanishkzzz/Payshift
- Live app: https://payshift-eight.vercel.app
- Local product preview: http://localhost:3000/#product-ledger

The public site and repository URLs were reachable when this package was prepared on 8 November 2026. The working tree contains changes that still need to be committed and deployed before those changes appear at the public links.

## Run locally

1. Install Node.js 20 or newer and npm.
2. Clone the repository and enter its root directory.
3. Install packages:

   ```powershell
   npm install
   ```

4. Create `.env` from the sample and set values for a dedicated PostgreSQL database:

   ```powershell
   Copy-Item .env.example .env
   ```

   Prisma CLI commands and the seed script load `.env`. Keep the database values in `.env` when using `.env.local` for Next.js.

5. Apply schema migrations:

   ```powershell
   npm run db:migrate
   ```

6. Load the synthetic demo records:

   ```powershell
   npm run db:seed
   ```

   **Important:** the seed script deletes and recreates its tables' data. Use a new, disposable demo database. Never run it against customer data or a database that must be preserved.

7. Start the app:

   ```powershell
   npm run dev
   ```

8. Open http://localhost:3000. For the ledger feature preview, open http://localhost:3000/#product-ledger.

## Reviewer accounts

Sign in at `/login` on the public production URL. These are shared reviewer accounts backed by synthetic records; use them only with the isolated demo database. Do not publish a personal staff password as a reviewer credential.

| Experience | Login ID | Password or code |
| --- | --- | --- |
| Parent | `+910000000001` | `123456` after setting the Production environment variables below; locally use the latest OTP shown in the UI or dev server log. |
| Accounts staff | `accounts@tracky.edu` | `Staff@123` |
| Administrator | `admin@tracky.edu` | `Staff@123` |
| Counsellor | `counsellor@tracky.edu` | `Staff@123` |

The seed creates these staff logins. The public deployment has no SMS provider, so configure these two Vercel **Production** variables to enable the parent reviewer login:

```text
DEMO_PARENT_PHONE=+910000000001
DEMO_PARENT_OTP=123456
```

The fixed OTP is accepted only for that exact seeded phone; it does not enable fixed-code login for any other number. After changing the variables, redeploy the Production deployment. This is a shared synthetic parent account for reviewers, not a real parent account.

## Make the public link accessible

1. In Vercel, open the project and go to **Settings → Deployment Protection**.
2. Ensure the production domain is public. **Standard Protection** leaves production domains public; **All Deployments** protects them too.
3. In **Deployments**, copy the URL for the deployment marked **Production** and share that URL. Preview deployment URLs may require Vercel sign-in.
4. Open the production URL in a private/incognito browser window and verify it loads without Vercel authentication. Then test `/login` with one of the reviewer accounts above.

Vercel access protection and Tracky's own staff/parent login are separate. Making the production site public removes Vercel's gate; the app's login still controls access to its portals.

## Deploy to Vercel

1. Import `kanishkzzz/Payshift` as a Vercel project. Use the repository root as the project root. The build script is `npm run build` and runs `prisma generate` before `next build`.
2. Create a fresh PostgreSQL database dedicated to the public demo. Neon is the configured provider. Do not point the public reviewer app at a database containing real institute, parent, or student data.
3. Add the required environment variables in Vercel's Production environment. Set Preview variables too only if reviewers need preview deployments. Variable **names** are listed below; enter values in the Vercel dashboard and do not commit them.
4. From a trusted environment with the demo database configured, apply migrations and seed the empty demo database once:

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

5. Configure the reviewer parent phone and six-digit code in the Vercel Production environment. The phone must match the seeded parent account exactly. Redeploy after changing environment variables.
6. Set `NEXT_PUBLIC_APP_URL` to the deployed origin, then verify parent OTP login, staff password login, the parent dues page, and the staff dashboard.

### Environment variable names

Required for the app and scheduled job:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`
- `MOCK_GATEWAY_SECRET`
- `MOCK_PAYMENT_WEBHOOK_SECRET`
- `PAYMENT_GATEWAY`
- `RISK_LLM_PROVIDER`

Optional or feature-specific:

- `DATABASE_URL_POOLED` (runtime pooled connection override)
- `DEMO_PARENT_PHONE`
- `DEMO_PARENT_OTP`
- `INSTITUTE_NAME`
- `BLOB_READ_WRITE_TOKEN` (profile photo upload)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_SETTLE_ON_VERIFY`

Do not use `NEXT_PUBLIC_` for database credentials, gateway secrets, the cron secret, or the reviewer OTP. The seed script contains public demo staff credentials, so keep those accounts and their database isolated from real users.

## Payment, reminder, and data notes

- Keep `PAYMENT_GATEWAY` set to the mock provider for the reviewer demo. Mock checkout simulates a payment and does not charge a real payment method. Razorpay requires test credentials and a configured webhook at `/api/webhooks/payments`.
- Vercel Cron is configured in `vercel.json` to call `/api/cron` daily. The endpoint requires the `CRON_SECRET` bearer token.
- The app does not currently send production SMS or WhatsApp messages. Parent OTP is shown locally; the deployed reviewer parent uses the restricted fixed demo OTP described above.
- Risk flags are deterministic, rule-based explanations reviewed by a counsellor. There is no connected LLM provider.
- CSV export is an offline accounting handoff, not a live Tally integration. Refund cases track calculation and review; they do not transfer money.

## Checks

Run these before publishing an updated source revision:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

The Vitest suite includes pure calculation tests and database-backed service tests. Point the database-backed tests at a separate disposable test database before running them; do not use a production or reviewer database. Browser-based end-to-end tests are not configured.
