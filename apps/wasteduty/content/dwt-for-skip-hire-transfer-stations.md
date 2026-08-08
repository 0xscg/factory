<!-- GENERATED DRAFT — operator edit pass required before publish -->

---

title: "Digital waste tracking for skip hire firms and transfer stations"
description: "What the 1 October 2026 digital waste tracking mandate means specifically for skip-hire firms with permitted yards and small transfer stations: who in the business holds the duty, the weighbridge workflow, and a readiness plan."
slug: dwt-for-skip-hire-transfer-stations
publishDate: TBD
jsonLdType: [Article, FAQPage]
---

# Digital waste tracking for skip hire firms and transfer stations

_Rules version: The Digital Waste Tracking (England) Regulations 2026 (draft SI as published on legislation.gov.uk) · Last reviewed: 8 August 2026_

If you run a skip-hire firm with your own permitted yard, or a small transfer station, you're in the **first wave** of mandatory digital waste tracking: from **1 October 2026**, every load of controlled waste received at your permitted facility must be recorded in the DWT service by the end of the second working day following receipt ([The Digital Waste Tracking (England) Regulations 2026](https://www.legislation.gov.uk/ukdsi/2026/9780348282726)).

## The confusing bit: you wear two hats

Most skip-hire firms both **carry** waste (your wagons collect skips) and **receive** it (skips are tipped at your yard).

- **Receiver hat — mandatory 1 October 2026.** The recording duty for waste received at the permitted yard sits with you as site operator.
- **Carrier hat — mandatory October 2027** ([gov.uk DWT service page](https://www.gov.uk/government/publications/digital-waste-tracking-service)). Your own carrier-side recording comes later, but your CBDU registration number goes on every receipt — yours and any third-party site you tip at — from October 2026.

So a skip tipped at your own yard needs a DWT receipt record from day one, with your own carrier registration number in it.

## The weighbridge workflow that survives October

Per load in:

1. Wagon on the bridge; carrier's CBDU number confirmed against the carrier file (yours or a third party's).
2. EWC code assigned from your permitted shortlist; hazardous check on mixed builders' skips (plasterboard, POPs in soft furnishings `[VERIFY: current EA POPs guidance for upholstered domestic seating]`).
3. Weight, unit, estimated flag; physical form; container count/type; means of transport; D/R code — the DWT mandatory set ([DEFRA receipt data definitions](https://defra.github.io/waste-tracking-service/production/)).
4. Ticket photo attached as evidence.
5. DWT record submitted (directly or via software) — inside two working days, tracked per load.

If steps 1–4 happen at the bridge, step 5 is trivial. If they're reconstructed later from a ticket spike, the two-working-day rule is where it comes apart — 40 loads a day is 40 concurrent deadlines.

## Readiness plan for a 1–25-person firm

- **August:** confirm your permit covers what you actually receive (EWC list, tonnage); redesign the weighbridge ticket around the mandatory field set; verify and evidence every regular carrier's registration.
- **September:** dry-run month — record every receipt as if live; assign the recording job to a role with holiday cover; decide gov.uk direct entry vs software.
- **1 October:** live. Review the unrecorded-movement list daily, not weekly.

## Software, honestly

At a few loads a week the free gov.uk service is enough. At transfer-station volume, WasteDuty runs the workflow above: forms constrained to your permitted EWC codes, per-load two-working-day tracking with escalation, carrier checks with evidence and expiry reminders, hashed ticket photos, API submission to DEFRA, and a one-click inspection pack. £49/month Starter or £149/month Pro, VAT-exclusive, 14-day trial. It keeps your records inspection-ready; the legal duty remains yours as operator.

## FAQ

**My yard runs under an exemption, not a permit — am I in scope?**
`[VERIFY: treatment of exempt facilities in the final SI — the DWT receipt field set includes a receiver authorisation (permit OR exemption) number, which suggests exempt sites are in scope; confirm before publish.]`

**Do I need to record skips tipped at someone else's transfer station?**
Not as receiver — the receiving site records those from October 2026 (with your CBDU number). Your own carrier-side duty starts October 2027.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Digital waste tracking for skip hire firms and transfer stations",
      "description": "What the 1 October 2026 digital waste tracking mandate means for skip-hire firms with permitted yards and small transfer stations, and a readiness plan.",
      "author": { "@type": "Organization", "name": "WasteDuty" },
      "publisher": {
        "@type": "Organization",
        "name": "WasteDuty",
        "url": "https://wasteduty.co.uk"
      },
      "datePublished": "TBD",
      "dateModified": "2026-08-08",
      "mainEntityOfPage": "https://wasteduty.co.uk/guides/dwt-for-skip-hire-transfer-stations"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do skip hire firms need digital waste tracking from October 2026?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "If the firm operates its own permitted yard, yes — receipts at the yard must be recorded from 1 October 2026. The carrier-side recording duty follows in October 2027."
          }
        },
        {
          "@type": "Question",
          "name": "Do I record skips tipped at someone else's transfer station?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No — the receiving site records those from October 2026, using your carrier registration number. Your own carrier-side duty starts October 2027."
          }
        }
      ]
    }
  ]
}
```

---

_WasteDuty is record-keeping and workflow software. It does not provide legal advice; the site operator remains the legal duty-holder._

_WasteDuty is a trading name of [Ltd], Co. no. XXXX._
