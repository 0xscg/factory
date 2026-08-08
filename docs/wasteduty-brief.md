# SKIN BRIEF — WasteDuty

> Status: **DRAFT — blocks on operator sign-off.** Every `[VERIFY]` is a
> regulatory fact I could not confirm against a primary source from this
> environment; check each against gov.uk / legislation.gov.uk before the
> scaffold consumes this brief (plan §Phase 2 gate).

**Regulation & citation:** Digital waste tracking (DWT) under the
Environment Act 2021 s.58 and the Waste (Miscellaneous Amendments)
Regulations implementing mandatory digital waste tracking `[VERIFY exact
SI name & number]`. Duty of Care under EPA 1990 s.34 and the Waste (England
and Wales) Regulations 2011 continue to apply to transfer documentation.

**Statutory date(s):**

- 1 October 2026 — DWT service becomes mandatory for waste operators
  `[VERIFY — the mandate has slipped before; confirm current commencement
date and which operator categories are in scope at that date]`.
- Two working days — deadline to record a waste movement in the DWT
  service after the movement occurs `[VERIFY — confirm the window and
whether it differs for receipt vs transfer]`.
- Annual waste-return obligations for permitted sites (quarterly/annual
  returns to EA) `[VERIFY cadence per permit type]`.

**Duty-holder (ICP):** Small/medium waste operators in England & Wales who
produce, carry, or receive controlled waste and currently run on paper
transfer notes: skip-hire firms, small waste carriers/brokers/dealers,
transfer stations, construction firms with carrier registrations. 1–25
staff, no compliance officer; the owner is the duty-holder.

**Public register (TAM list):** EA public register of registered waste
carriers, brokers and dealers; EA permitted-sites register for transfer
stations `[VERIFY current export/scrape route for both]`.

**Core record types (3–5):**

1. `waste_receipt` — movement record: EWC code, description, quantity,
   carrier ref, origin/destination, transfer date, DWT submission ref.
2. `waste_carrier` — carrier/broker/dealer: registration number, expiry,
   verification date.
3. `site_record` — site/permit: permit ref, permitted EWC codes, tonnage
   limits, return cadence.

**Checklist templates (2–3):**

1. Receipt checklist — per movement: carrier registration verified,
   EWC code assigned, quantities recorded, evidence (ticket photo)
   attached, recorded in DWT within two working days.
2. Quarterly review — carrier registrations still valid, permit
   conditions reviewed, movement register reconciled, evidence complete.
3. New-carrier onboarding — registration lookup evidence, insurance,
   expiry reminder set.

**Deadline rules:**

- `dwt_mandate_2026` — fixed: 1 Oct 2026 readiness deadline (stages
  [90, 30, 7, 1] `[operator choice]`).
- `two_working_day_rule` — relative: movement date + 2 working days
  (stages [1, 0]).
- `carrier_registration_expiry` — relative: carrier expiry date (stages
  [30, 7, 1]).
- `quarterly_review` — recurring quarterly `[operator choice of dates]`.

**Report pack contents:** Inspection-ready pack (movement records +
evidence index + audit extract — chassis default); Movement register
(season/date-range table of waste_receipts for EA inspection or permit
return `[VERIFY the register format an EA officer expects]`).

**Regulator API? (spec link):** DEFRA digital waste tracking service API
`[VERIFY — spec location (DEFRA GitHub), auth model, sandbox availability,
whether third-party software integration is open at mandate date]`.
Adapter key: `dwt-defra`.

**3 trade bodies:** CIWM (Chartered Institution of Wastes Management);
ESA (Environmental Services Association); UROC (United Resource Operators
Consortium) `[VERIFY relevance for skip-hire ICP; consider NFDC]`.

**10 keywords:** digital waste tracking, digital waste tracking deadline,
digital waste tracking software, waste transfer note software, waste
tracking regulations 2026, EWC code lookup, waste carrier registration
check, duty of care waste records, skip hire software, waste movement
register.

**Pricing hypothesis:** £49 Starter (1 site, 2 users) / £149 Pro
(multi-site, unlimited users, adapter sync) — monthly, VAT-exclusive,
14-day trial.

**Kill/scale gates:** factory defaults (plan §4.7).
