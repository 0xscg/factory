# DEFRA Digital Waste Tracking — adapter reference

_Research snapshot 2026-08-08 (primary sources cited; re-verify against
the developer guide before production onboarding)._

## Programme facts

- **The Digital Waste Tracking (England) Regulations 2026** come into
  force **1 October 2026**: a digital waste record per load of
  controlled waste **received at permitted facilities**, submitted **by
  the end of the second working day following receipt**.
  Source: <https://www.legislation.gov.uk/ukdsi/2026/9780348282726>
- Phased rollout (gov.uk DWT service page):
  - Spring 2026 — public beta (voluntary), permitted/licensed
    **receiving site operators**.
  - **Oct 2026** — mandatory for receiving sites, England & Wales.
  - Jan 2027 — Scotland & NI receiving sites (SSI 2026/145).
  - **Oct 2027** — carriers/brokers/dealers ("waste collectors");
    carrier private beta autumn 2026.
- **Skin implication:** the panic-window ICP is waste _receivers_
  (transfer stations, permitted sites). Carriers become a second wave in
  2027 — the CBDU checks in WasteDuty remain useful (receipts carry the
  carrier registration number) but carriers aren't the Phase 1
  duty-holder for DWT submission.

## API ("Receipt of Waste" API)

- Repo: <https://github.com/DEFRA/waste-tracking-service> (README's
  April-2026 line is stale — trust gov.uk/legislation).
- Developer guide: <https://defra.github.io/waste-tracking-service/production/>
  (api-specification, receipt-data-definitions, api-authentication-guide,
  onboarding, production-approval-tests, changelog wiki).
- OpenAPI/Swagger: linked from the api-specification page
  (`../apiSpecifications/`) — resolve and PIN the spec into
  `packages/adapters/dwt-defra/fixtures/` at onboarding time.
- **Auth: OAuth 2.0 client-credentials via AWS Cognito** (eu-west-2),
  Base64 `client_id:client_secret` → `/oauth2/token` → short-lived
  bearer. No API keys.
  - Test: `https://waste-movement-external-api-8ec5c.auth.eu-west-2.amazoncognito.com`
  - Prod: `https://waste-movement-external-api-75ee2.auth.eu-west-2.amazoncognito.com`
- **Onboarding: open now, no waitlist.** Register (Qualtrics + ToS) →
  test credentials → build → pass the 14 Production Approval Tests →
  production credentials. Contact wasteuserresearch@defra.gov.uk.
  → OPERATOR ACTION: register WasteDuty as a software provider (aim:
  the gov.uk approved-provider list — it is itself a marketing channel).

## Receipt submission data model (mandatory fields)

Receiver 6-digit API code · date/time received · EWC code (6-digit) ·
waste description · physical form · container count + type · weight
(amount, unit g/kg/t, estimated flag) · hazardous indicator · disposal/
recovery (D/R) code · carrier registration number · means of transport ·
receiver authorisation (permit/exemption) number · receipt address +
postcode.

Optional: own reference, special handling, hazardous consignment number,
POPs data, hazardous property details, carrier contact/address, vehicle
registration, broker/dealer details, regulatory position statement.

Gaps vs the current `waste_receipt` entity (close during adapter wiring):
physical form, container count/type, weight unit + estimated flag,
hazardous indicator, D/R code, means of transport, receiver
authorisation number, receipt address. Origin/producer address is NOT in
the Phase 1 mandatory set (collection-side data is a separate
submission).

## Unverified (secondary sources only — do not use in copy)

£26/yr registration fee; £5,000 fine figure. Exact per-field schema
types pend the Swagger spec.
