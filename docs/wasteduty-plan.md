# WasteDuty — Implementation Plan (chassis v0 + first skin)

_First skin per the conveyor calendar (architecture.md §4.8). Statutory catalyst: UK Digital Waste Tracking mandate, 1 Oct 2026 — planning as of Aug 2026, inside the panic window._

**Definition of done:** a paying-customer-ready WasteDuty at `apps/wasteduty` — signup → trial → record waste receipts with evidence → checklist sign-offs → deadline emails → one-click inspection pack PDF → Stripe subscription — deployed on the Oracle VM via Coolify, with landing + content hub live.

## Phase 0 — Monorepo bootstrap (½–1 day)

- Turborepo (`turbo.json`: typecheck, test, build, lint pipelines) on top of the existing pnpm workspace.
- `tooling/tsconfig` shared TS config; wire `@factory/eslint-config` into it.
- Vitest at the root (test-writer needs a runner to exist).
- `compose.yaml` for local Postgres, Redis, Gotenberg via rootless podman; document `podman compose up` in CLAUDE.md.
- GitHub Actions: typecheck + test + build on push to main. Coolify deploys main, so CI is the only gate — keep it fast and required.
- First commit happens here — everything so far is uncommitted.

## Phase 1 — Chassis v0, WasteDuty-shaped only (5–8 evenings)

`packages/core` with Drizzle + Postgres, building **only the slices WasteDuty needs** (no speculative platform features). Order matters — each module depends on the previous:

1. **DB foundation** — Drizzle setup, migration workflow (`drizzle-kit generate`, SQL committed), tenancy pattern: every table gets `org_id` + `product`, RLS policy authored in the same migration. This is the pattern code-reviewer blocks on — get it right once here.
2. **Identity** — email + magic link + TOTP, orgs, members, four roles (owner/admin/member/auditor read-only). RLS session context (`set_config('app.org_id', ...)`) established here.
3. **Audit log** — append-only table (no UPDATE/DELETE grants, enforced in migration), event emitted by a single `mutate()` helper every other module must use. Built early so every later module gets coverage for free.
4. **Records** — generic typed entities from Zod schemas, versioning.
5. **Evidence vault** — R2 upload, SHA-256 at attach, immutability trigger.
6. **Checklist engine** — templated multi-step assessments, evidence requirements, sign-off.
7. **Deadline engine** — rule definitions → computed obligations → BullMQ-scheduled escalating emails via Resend.
8. **Billing** — Stripe Checkout + portal, one Product, 14-day trial, dunning webhooks.
9. **Reporting** — HTML templates → Gotenberg PDF; inspection-pack assembly (records + evidence index + audit extract).
10. **`packages/config`** — `defineSkin()` types + loader; **`packages/ui`** — Tailwind + shadcn with per-skin theme tokens, marketing/landing template.

**Agent cadence:** after each module lands, **test-writer** writes its suite (RLS isolation tests first — org A cannot read org B at the DB level; Stripe webhook replay for Billing; injected clocks for Deadline), then **code-reviewer** passes the diff before commit. Main auto-deploys — nothing unreviewed goes in.

## Phase 2 — WasteDuty skin brief → scaffold (1 evening + operator input)

- Draft the §6 skin brief: regulation & citation (UK digital waste tracking regs), statutory dates (1 Oct 2026 mandate, two-working-day rule), duty-holder ICP, EA permitted-sites register as TAM list, record types (waste receipt, waste carrier, site record), checklists (receipt checklist, quarterly review), report pack, DEFRA API link, trade bodies, keywords, £49/£149 pricing.
- **Operator verifies the regulatory facts — the brief blocks on sign-off.**
- **skin-scaffolder** consumes the brief → `apps/wasteduty`: skin.config.ts, Zod entities, checklist + deadline templates, inspection-pack + movement-register HTML, landing skeleton, seed data, draft gtm.md.

## Phase 3 — DWT adapter + app assembly (2–4 evenings)

- `packages/adapters/dwt-defra`: client against the DEFRA spec; contract tests pinned to committed spec fixtures (**test-writer**); BullMQ sync job.
- Wire the Next.js app end-to-end: onboarding checklist, record CRUD through the chassis, evidence upload, report generation, billing flow. Fix what the scaffold got generic.

## Phase 4 — Landing, content, GTM (parallel with Phase 3)

- **reg-copywriter**: pillar guide + 8–12 spokes from gtm.md and the fetched regulation text, JSON-LD, llms.txt, per-claim citations, `[VERIFY]` flags for the operator's Saturday edit pass. Vocabulary ban enforced throughout.
- Pricing page (VAT-exclusive), T&Cs from template with trading-name line, privacy policy.

## Phase 5 — Harden + ship (1–2 evenings)

- **security-auditor** full run: dependency audit, secret scan, OWASP pass on auth flows, first permissions snapshot.
- Full org JSON+files export (day-one requirement); nightly `pg_dump` → R2 job.
- Coolify service + domain + Coolify-vault secrets; smoke test; beta cohort invites (3–5 free design partners).

## Sequencing risk

The doc budgets ~2 weeks to a live landing page, but the chassis is ~8 modules of real work. If the calendar squeezes, §4.1's own answer applies: landing + waitlist go live from the marketing template **before** chassis completion (day 3), and content compounds while the chassis is built. Option: invert Phases 1 and 4.
