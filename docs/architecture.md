# Ghatta (घट्ट) — Factory Architecture

_A one-person startup factory producing deadline-driven compliance SaaS. Named for the Nepali water mill: sited on a constant stream, grinding continuously, operated solo. The stream is the UK regulatory calendar._

**Version 1.0 — August 2026**

---

## 1. Operating principles

1. **The deadline is the marketing department.** Every skin launches into a statutory panic window. No skin without a date or an active regulatory catalyst.
2. **One chassis, many skins.** A new product is a configuration exercise measured in days, not a build measured in weeks. If a skin needs >20% custom code, it doesn't belong in the factory.
3. **Sequential focus, parallel existence.** One skin gets active attention at a time; the rest run in maintenance mode behind pre-committed gates.
4. **Records, not advice.** Every product is sold as record-keeping and workflow software. The customer remains the legal duty-holder. This sentence shapes the code (audit trails, evidence, exports) and the legal posture equally.
5. **Cheap to try, cheap to kill.** Each skin costs <£1k marginal cash. Kill decisions are made by numbers set before launch, not feelings after it.
6. **The factory is the story.** Build in public under the Ghatta name; keep each brand straight-faced for buyers.

---

## 2. Structure & money

| Layer               | Decision                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Legal entity        | Existing UK Ltd. Each skin is a **trading name** ("WasteDuty is a trading name of [Ltd], Co. no. XXXX" in every footer, invoice, T&Cs) |
| Banking             | One account. Per-skin revenue via Stripe Products; per-skin P&L via FreeAgent/Xero tracking categories, tagged at entry (~10 min/wk)   |
| Stripe              | One account; one Product per skin; statement descriptor per charge (`GHATTA* WASTEDUTY`)                                               |
| VAT                 | All skins aggregate to one £90k threshold. Price VAT-exclusive from day one; B2B buyers reclaim                                        |
| ICO                 | One registration (£52/yr) covers all trading names                                                                                     |
| Restructure trigger | A skin sustains £5k MRR or attracts an acquirer → novate into its own Ltd under a holdco. Clean per-skin books make this a 2-week job  |
| Insurance           | PI + cyber (~£25–40/mo) from first paying customer, factory-wide policy                                                                |

---

## 3. Code architecture

### 3.1 Repository

Turborepo monorepo, TypeScript end-to-end.

```
ghatta/
├── apps/
│   ├── wasteduty/          # Next.js app: product + marketing site
│   ├── carbonduty/
│   ├── lotcheck/
│   └── protectduty/
├── packages/
│   ├── core/               # The chassis (below)
│   ├── ui/                 # Design system: Tailwind + shadcn, themed per skin via tokens
│   ├── config/             # Skin definition types + loader
│   └── adapters/           # Regulator API clients (dwt-defra, cbam-hmrc, ...)
├── tooling/                # eslint, tsconfig, CI templates
├── CLAUDE.md               # Factory-wide conventions for Claude Code
└── .claude/agents/         # code-reviewer, test-writer, skin-scaffolder
```

### 3.2 The chassis (`packages/core`)

Eight modules. Everything below ships with every skin; skins may hide, never fork.

| Module                          | Responsibility                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Identity**                    | Auth (email + magic link + TOTP), organisations, members, roles (owner/admin/member/auditor read-only)                             |
| **Billing**                     | Stripe Checkout + customer portal, per-skin products, 14-day trial, dunning webhooks                                               |
| **Records**                     | Generic typed entities defined per skin (a waste receipt, a CBAM shipment, a venue assessment) with versioning                     |
| **Evidence vault**              | File attachments on any record → Cloudflare R2, SHA-256 hash stored, immutable once attached                                       |
| **Audit log**                   | Append-only event stream on every mutation (who/what/when/before/after). The core sales artefact                                   |
| **Deadline engine**             | Per-skin rule definitions → computed obligations per org → escalating notifications (email now; SMS later)                         |
| **Checklist/inspection engine** | Templated multi-step assessments with evidence requirements, sign-off, and completion state                                        |
| **Reporting**                   | HTML report templates → PDF via Gotenberg container. "Inspection-ready pack" = records + evidence index + audit extract, one click |

### 3.3 Skin anatomy

A skin is a config file plus branding plus (optionally) one adapter:

```ts
// apps/wasteduty/skin.config.ts
export default defineSkin({
  id: "wasteduty",
  brand: { name: "WasteDuty", domain: "wasteduty.co.uk", theme: "green" },
  entities: [wasteReceipt, wasteCarrier, siteRecord], // Zod schemas
  checklists: [receiptChecklist, quarterlyReviewTemplate],
  deadlines: [dwtMandate2026, twoWorkingDayRule],
  reports: [inspectionPack, movementRegister],
  adapter: "dwt-defra", // optional
  pricing: { starter: 49, pro: 149 },
});
```

**Definition of factory success: a new skin = config + landing copy + checklist templates + theme tokens, shipped in 3–5 working days.** The chassis absorbs everything else.

### 3.4 Stack

| Concern    | Choice                                                                                                                         | Why                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Framework  | Next.js (App Router), server actions                                                                                           | One deployable per skin, marketing + app in one                          |
| API style  | Server actions + a small REST surface for adapters/webhooks                                                                    | Solo-speed; NestJS reserved for a future standalone API if scale demands |
| DB         | Single PostgreSQL cluster; every table carries `org_id` + `product`; row-level security by org                                 | One backup story, cross-sell without migration                           |
| ORM        | Drizzle                                                                                                                        | Light, fast on ARM, SQL-transparent                                      |
| Queue/cron | BullMQ on existing Redis                                                                                                       | Deadline scans, notification fan-out, adapter syncs                      |
| Files      | Cloudflare R2                                                                                                                  | Egress-free evidence vault                                               |
| Email      | Resend (transactional) + listmonk self-hosted (marketing)                                                                      | Cost control                                                             |
| PDF        | Gotenberg container                                                                                                            | Faithful HTML→PDF for report packs                                       |
| Hosting    | Existing Oracle ARM VM via Coolify; one service per skin + shared services (Postgres, Redis, Gotenberg, listmonk, Uptime Kuma) | £0 marginal infra                                                        |
| Monitoring | Uptime Kuma + Sentry free tier; Hermes reads both                                                                              |                                                                          |
| Backups    | Nightly `pg_dump` + R2 sync; restore drill monthly (calendar-blocked)                                                          | Compliance product that loses data is dead                               |
| CI         | GitHub Actions: typecheck, test, build; Coolify auto-deploy on main                                                            |                                                                          |

### 3.5 Security baseline (non-negotiable for a compliance vendor)

TOTP 2FA available day one; RLS enforced in DB, not just app code; audit log append-only at the DB level (no UPDATE/DELETE grants); evidence hashing; secrets in Coolify vault; fortnightly dependency audit (automated PR); data export (full org JSON+files) self-serve — it's a sales feature and a GDPR obligation.

### 3.6 AI tooling

- **CLAUDE.md** at repo root: conventions, chassis API usage, "never fork core" rule, test requirements.
- **Subagents:** existing `code-reviewer` and `test-writer`, plus a new `skin-scaffolder` that takes a filled skin-definition brief and generates config, entities, checklist templates, landing skeleton, and seed data.
- **Regeneration rule:** anything generated (landing copy, report templates) lives in files marked as such, so regeneration never overwrites hand-edits.

---

## 4. Non-code architecture

### 4.1 Launch kit assembly line (~2 weeks/skin, parallel to build)

| Day    | Asset                                                                                                                                                              | Method                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 0      | Domain (.co.uk + .com), Cloudflare, brand kit (logo, palette, OG images)                                                                                           | Half a day with a prompt-pack; perfection forbidden                                                            |
| 1      | Landing + waitlist live _before any product code_                                                                                                                  | Chassis marketing template, skin theme                                                                         |
| 1–5    | Content hub: 1 pillar guide ("The complete guide to [regulation]") + 8–12 spokes targeting `[regulation] + deadline / penalties / software / checklist / template` | Claude Code drafts, you edit for accuracy; JSON-LD, llms.txt, AI-crawler config (your NQB-style GEO treatment) |
| 3–7    | Outbound list: 100+ contacts from public registers (EA permitted-sites register, HMRC importer lists where public, licensing registers, trade directories)         | Scripted scrape → CSV → Hermes-run sequence                                                                    |
| 5      | Pricing page (£49 Starter / £149 Pro, monthly, 14-day trial, no annual until PMF), T&Cs from hardened template, privacy policy                                     |                                                                                                                |
| 7–10   | Trade-body outreach (one email + one call per body), 3 comparison/alternative pages, launch thread queued                                                          |                                                                                                                |
| Launch | Beta cohort (3–5 free design partners) converts to paid; outbound sequence starts; build-in-public post                                                            |                                                                                                                |

### 4.2 Per-skin GTM config (the non-code twin of `skin.config.ts`)

Each skin maintains a one-page `gtm.md`: ICP definition, the statutory date and its citation, the public register that is the TAM list, 3 trade bodies, 10 keyword targets, the panic-window calendar, and the objection sheet. No skin launches without it.

### 4.3 Sales motion

Self-serve first: trial → onboarding checklist → conversion email sequence. A visible "book 15 minutes" option on pricing and in-app — compliance SMBs convert 2–3× with a human touch; calls capped at 5/week and batched to one evening. Every call feeds the objection sheet and the content hub.

### 4.4 Ops layer — who does what

| Actor                     | Owns                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **You**                   | Positioning, pricing, gate decisions, call slots, final edit of anything customers read, weekly review                                                                                                                                                                               |
| **Claude Code**           | Chassis + skins, tests, landing pages, article drafts, scrapers, report templates                                                                                                                                                                                                    |
| **Hermes (VPS/Telegram)** | 08:00 digest (MRR, trials, churn events, uptime, error spikes); support-inbox triage with drafted replies for your approval; regulatory feed watch (gov.uk pages + DEFRA GitHub diffs per skin → alert on change); outbound sequence execution; weekly metrics pack for gate reviews |
| **SaaS (<£400/mo)**       | Stripe, FreeAgent, Cloudflare, Resend, Claude Max, insurance, domains                                                                                                                                                                                                                |

### 4.5 Legal posture (factory standard)

Sold as record-keeping and workflow software; customer remains the duty-holder. Copy bans the words "ensures/guarantees compliance" — the vocabulary is _audit-ready, inspection-ready, evidence, records_. T&Cs: liability capped at 12 months' fees; express exclusion of fines/penalties; tool-not-advice clause. Solicitor hardens the template once (~£500–1k) when the first skin passes £2k MRR; every skin inherits.

### 4.6 Weekly rhythm (35 h — evenings, 5 h/day)

| Day     | Block                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mon–Thu | Build: active skin only (chassis debt counts as build)                                                                                         |
| Fri     | GTM: outbound review, calls batch, trade-body follow-ups                                                                                       |
| Sat     | Content: edit 2–3 drafted articles, build-in-public post, next skin's gtm.md                                                                   |
| Sun     | Ops (2 h): Hermes review, metrics, support backlog zero, next-week plan. Rest of day off — burnout is a factory-level risk, not a personal one |

### 4.7 Metrics & gates (pre-committed)

Per skin at day 90 from paid launch:

| Verdict                | Threshold                                  | Action                                                                      |
| ---------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| **Kill → maintenance** | <5 paying or <£500 MRR                     | No new features; support + security only; landing stays live (option value) |
| **Hold**               | 5–15 paying, £500–1.5k MRR                 | Runs on automation; revisit at day 180                                      |
| **Scale**              | >£1.5k MRR or >15 logos or trial→paid >10% | Earns the next quarter of focus; conveyor pauses                            |

Factory-level: £5k MRR = breakeven vs burn; **£8k MRR sustained 2 months = full-time trigger and everything else stops**. North-star metric: _days from skin brief → first paying customer_ (target: <45, falling each cycle).

### 4.8 Conveyor calendar (first 24 weeks)

| Wks   | Skin        | Milestone                                                                   |
| ----- | ----------- | --------------------------------------------------------------------------- |
| 1–2   | WasteDuty   | Chassis v0; landing live day 3; content hub drafting                        |
| 3–4   | WasteDuty   | Receipt records + DWT adapter; 3–5 beta sites                               |
| 5     | WasteDuty   | **Paid launch**; outbound to EA register                                    |
| 6–9   | WasteDuty   | Panic-month sprint (mandate 1 Oct 2026); CarbonDuty content hub in parallel |
| 10–13 | CarbonDuty  | Build + paid launch into pre-Jan-2027 scramble                              |
| 14–16 | LotCheck    | Micro-build gap-filler; ProtectDuty content ramp                            |
| 17–20 | ProtectDuty | Build + paid launch                                                         |
| 21–24 | All         | Gate review → double down on the leader                                     |

---

## 5. Failure modes & mitigations

| Risk                                                 | Mitigation                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Attention fragmentation (the classic factory killer) | One active skin; gates decide, not mood; maintenance mode is genuinely frozen          |
| Regulatory drift breaks a maintained skin            | Hermes feed-watch per skin; every skin carries a "rules version" surfaced to customers |
| Chassis becomes a second product competing for time  | Chassis work only in service of the active skin; no speculative platform features      |
| Deadline slips (governments do this)                 | Conveyor re-orders by next-firmest date; content hubs keep compounding regardless      |
| Support load from killed skins                       | Kill ≠ sunset: honour existing customers, close new signups if support cost > revenue  |
| Solo burnout                                         | Sunday half-day, calls capped, Hermes owns the inbox first pass                        |

---

## 6. Appendix — Skin brief template (fill this to start any skin)

```
SKIN BRIEF — [name]
Regulation & citation:
Statutory date(s):
Duty-holder (ICP):
Public register (TAM list):
Core record types (3–5):
Checklist templates (2–3):
Deadline rules:
Report pack contents:
Regulator API? (spec link):
3 trade bodies:
10 keywords:
Pricing hypothesis:
Kill/scale gates (inherit factory defaults unless stated):
```

_The brief is the factory's input format. Claude Code's `skin-scaffolder` consumes it; the launch kit consumes it; the gtm.md is generated from it. One page in → product out._
