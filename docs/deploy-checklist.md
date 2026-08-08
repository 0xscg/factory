# WasteDuty deploy checklist (Coolify, Oracle ARM VM)

_Phase 5. Items marked OPERATOR need credentials or accounts only Sushan
holds; everything else is scripted/documented._

## Operator inputs (blocking)

- [ ] OPERATOR: Coolify URL + API token (or click-ops together).
- [ ] OPERATOR: domain `wasteduty.co.uk` (+ `.com`) → Cloudflare, DNS to
      the VM; TLS via Coolify.
- [ ] OPERATOR: Stripe **live** keys → Coolify vault ONLY (never chat,
      never git). Rotate the test secret key that transited chat.
      Activate live mode; re-run `bootstrapSkinBilling` against live to
      create the product/prices; set live `STRIPE_WEBHOOK_SECRET` from
      the dashboard webhook endpoint (`/api/stripe`).
- [ ] OPERATOR: Cloudflare R2 — two buckets (`factory-evidence`,
      `factory-backups`) + S3 API token pair → vault. (Evidence still
      uses DirObjectStore until the R2 ObjectStore lands — keep
      `DATA_DIR` on a persistent volume meanwhile.)
- [ ] OPERATOR: Resend API key + verified sending domain → vault
      (`RESEND_API_KEY`, `MAIL_FROM`).
- [ ] OPERATOR: register as a DWT software provider (open, no waitlist —
      docs/dwt-defra-api.md) → test credentials → later the Production
      Approval Tests.
- [ ] OPERATOR: fill the real trading name — replace
      `[Ltd], Co. no. XXXX` in `skin.config.ts` and content files.
- [ ] OPERATOR: Sentry DSN (free tier) if wanted at launch.

## Environment (Coolify app service, from vault)

`DATABASE_URL` (app_login role — NOT the superuser; create with
`CREATE ROLE app_login LOGIN PASSWORD '<strong>' IN ROLE factory_app`),
`APP_URL`, `AUTH_SECRET` (32+ random bytes), `GOTENBERG_URL`
(shared service), `RESEND_API_KEY`, `MAIL_FROM`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `DATA_DIR` (persistent volume),
`NODE_ENV=production`.

## Steps

1. Shared services in Coolify: Postgres 16, Redis, Gotenberg (exists per
   architecture; confirm versions).
2. Run migrations as superuser once per release:
   `pnpm --filter @factory/core exec tsx -e "…runMigrations"` — or a
   release command in Coolify. Create `app_login` (above) after first
   migrate.
3. App service: build `pnpm install --frozen-lockfile && pnpm --filter
@factory/wasteduty exec next build`; start `next start`. Auto-deploy
   on main (already the repo convention — never push red).
4. Stripe webhook endpoint → `https://wasteduty.co.uk/api/stripe`,
   events: checkout.session.completed, customer.subscription.*,
   invoice.payment_failed.
5. Deadline worker: separate Coolify service running a small runner that
   calls `scheduleDeadlineScans` + `startDeadlineWorker` (REDIS_URL) —
   runner script TODO when Redis URL is known.
6. Backups: schedule `scripts/backup-db.sh` nightly (Coolify scheduled
   task or cron); calendar-block the monthly restore drill.
7. Uptime Kuma monitor on `/` and `/login`; Sentry DSN into the app env.

## Post-deploy smoke

- `/` renders with countdown; `/login` sends a real magic link (Resend);
  full sign-in incl. TOTP; create receipt + evidence; inspection-pack
  PDF downloads; Stripe test-mode checkout end-to-end before flipping
  live keys.
