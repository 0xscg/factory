---
name: new-skin
description: Scaffold a new product skin (apps/<id>) from a filled skin brief — config, entities, checklists, deadlines, gtm.md, and landing skeleton. Use when starting a new skin.
disable-model-invocation: true
---

Scaffold a new skin for the Ghatta factory. Input: a filled skin brief (architecture doc §6 template), passed as $ARGUMENTS or provided in conversation. If the brief is missing or has empty fields, print the template from `docs/architecture.md` §6 and ask for the gaps — **no skin starts without a complete brief**.

## Steps

1. **Read `docs/architecture.md`** §3.3 (skin anatomy) and §4.2 (gtm.md) first.
2. Create `apps/<id>/` with:
   - `skin.config.ts` using `defineSkin({...})` from `@factory/config`: id, brand (name, domain, theme), entities, checklists, deadlines, reports, optional adapter, pricing from the brief.
   - Entity Zod schemas for the brief's 3–5 core record types.
   - Checklist templates (2–3 from the brief) for the chassis checklist engine.
   - Deadline rule definitions citing the statutory date(s) from the brief.
   - Landing page skeleton from the chassis marketing template, themed via tokens — mark generated copy files as generated (regeneration must never clobber hand edits).
   - Seed data for local dev.
3. Create `apps/<id>/gtm.md` from the brief: ICP, statutory date + citation, public register (TAM list), 3 trade bodies, 10 keywords, panic-window calendar, objection sheet (empty to start).
4. If the brief names a regulator API, stub an adapter in `packages/adapters/<adapter-id>/` — interface only, no speculative implementation.

## Constraints

- **Never fork core.** If the skin seems to need chassis changes, stop and list them as `packages/core` work instead — do not write skin-local copies. >20% custom code means the skin is rejected.
- All customer-facing copy follows the vocabulary ban (no "ensures/guarantees compliance"; use audit-ready, inspection-ready, evidence, records) and includes the trading-name footer line.
- Pricing VAT-exclusive; 14-day trial; no annual pricing.
- If `packages/core` / `packages/config` don't yet export what the skin needs (e.g. `defineSkin`), report the gap and build that first rather than inventing per-skin substitutes.
