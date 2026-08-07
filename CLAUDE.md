## What this repo is

Factory — a one-person factory producing deadline-driven UK compliance SaaS: one shared chassis (`packages/core`), many thin product "skins" (`apps/*`). The canonical spec is @docs/architecture.md — read it before structural work. The repo is greenfield; scaffold to match the structure in that doc.

## Decisions (not in the doc)

- Package manager: **pnpm** (via corepack) + Turborepo. Package scope: `@factory/*`.
- Git: commit **directly to main** (solo project). Coolify auto-deploys on main — never push broken builds; run typecheck/test first.
- Local services (Postgres, Redis, Gotenberg): **podman compose** (rootless podman, no Docker — see global CLAUDE.md for `DOCKER_HOST` setup).
- Deploy target is an **Oracle ARM VM** — avoid x86-only native dependencies.

## Hard rules (from the architecture doc)

- **Never fork core.** Skins configure and may hide chassis features, never copy/modify them. A skin needing >20% custom code is rejected — push the logic into `packages/core` instead.
- Every DB table carries `org_id` + `product`; tenancy enforced with **Postgres RLS**, not app code.
- Audit log is **append-only at the DB level** (no UPDATE/DELETE grants). Evidence files are immutable once attached; store SHA-256 hash.
- **Copy vocabulary ban:** never write "ensures/guarantees compliance" in any customer-facing text. Use _audit-ready, inspection-ready, evidence, records_. Product is record-keeping/workflow software; the customer remains the legal duty-holder.
- Generated artifacts (landing copy, report templates) live in files explicitly marked as generated, so regeneration never clobbers hand edits.
- Footers, invoices, T&Cs: "X is a trading name of [Ltd], Co. no. XXXX". Prices are VAT-exclusive.
- Secrets live in the Coolify vault — never commit secrets or invent `.env` conventions without asking.

## Workflow

- One skin gets active attention at a time; chassis work only in service of the active skin — no speculative platform features.
- New skins start from the skin brief template (architecture doc §6) — use `/new-skin`.
- TODO: once ESLint/Prettier (in `tooling/`) exist, add a format-on-edit hook (`/init` or `update-config` skill can do this).
