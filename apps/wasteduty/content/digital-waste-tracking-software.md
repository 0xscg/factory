<!-- GENERATED DRAFT — operator edit pass required before publish -->

---

title: "Digital waste tracking software: do you need it, and what to look for"
description: "An honest comparison of the free gov.uk digital waste tracking service against paid software for permitted receiving sites — when manual entry is enough and when workflow, evidence and API submission pay for themselves."
slug: digital-waste-tracking-software
publishDate: TBD
jsonLdType: [Article, FAQPage]
---

# Digital waste tracking software: do you need it, and what to look for

_Rules version: The Digital Waste Tracking (England) Regulations 2026 (draft SI as published on legislation.gov.uk) · Last reviewed: 8 August 2026_

From 1 October 2026, permitted receiving sites in England & Wales must record every load of controlled waste in DEFRA's digital waste tracking (DWT) service within two working days of receipt ([The Digital Waste Tracking (England) Regulations 2026](https://www.legislation.gov.uk/ukdsi/2026/9780348282726)). The first question isn't "which software" — it's whether you need software at all.

## Option 1: the free gov.uk service

DEFRA's own DWT service is free to use and is the system of record regardless of how data gets into it ([gov.uk DWT service page](https://www.gov.uk/government/publications/digital-waste-tracking-service)). If your site takes a handful of loads a week, one person can key them in directly and stay comfortably inside the two-working-day window. Honestly: at that volume, paid software is hard to justify.

What the free service is not: a workflow. It won't chase you about a movement that hasn't been recorded, verify a carrier's registration, hold your ticket photos as evidence, or assemble an inspection pack. Those jobs stay yours.

## Option 2: software submitting via the DEFRA API

DEFRA publishes a "Receipt of Waste" API so software providers can submit records on an operator's behalf ([DEFRA developer guide](https://defra.github.io/waste-tracking-service/production/)). Providers pass DEFRA's production approval tests before going live.

Software earns its keep when:

- **Volume:** 20+ loads a day means manual double-entry from weighbridge tickets becomes the failure point.
- **The rolling deadline:** each movement carries its own two-working-day clock. You want per-movement deadline tracking with escalation, not a mental note.
- **Evidence:** duty of care under EPA 1990 s.34 ([legislation.gov.uk](https://www.legislation.gov.uk/ukpga/1990/43/section/34)) means being able to show what you took, from whom, with a registered carrier. Ticket photos and carrier-check records attached to each movement make an inspection a lookup.
- **Multiple people/sites:** who recorded what, when, needs an audit trail.

## What to look for (whatever you buy)

1. **DEFRA API submission** with the submission reference stored against your own record.
2. **Per-movement deadline tracking** for the two-working-day rule, with escalation before a lapse.
3. **Carrier registration checks** recorded as evidence, with expiry reminders.
4. **Immutable evidence** — attachments that can't be silently edited (content hashing is the tell).
5. **An audit log** of every change: who, what, when, before and after.
6. **One-click inspection pack** — movement register, evidence index, audit extract.
7. **Data export** — your records in a standard format, so you're never locked in.

One claim to distrust: any vendor implying their product discharges your legal duty for you. No software can. The recording duty sits with the site operator; software keeps the records audit-ready and the workflow on schedule — that's the honest pitch, and it's ours too.

## Where WasteDuty sits

WasteDuty is record-keeping and workflow software built for 1–25-person permitted receiving sites: DWT submission via the DEFRA API, two-working-day tracking per movement, carrier checks with evidence, hashed attachments, append-only audit log, and the inspection-ready pack. £49/month Starter (1 site, 2 users) or £149/month Pro (multi-site, unlimited users, API sync), VAT-exclusive, 14-day trial. If the free gov.uk service covers your volume, use it — and come back when it doesn't.

## FAQ

**Do I have to buy software to comply with DWT?**
No. The gov.uk service is free and sufficient at low volume. Software addresses workflow, evidence and volume — not the legal duty itself, which stays with you.

**Can software submit records for me?**
Yes — DEFRA's Receipt of Waste API allows approved software providers to submit on an operator's behalf ([DEFRA developer guide](https://defra.github.io/waste-tracking-service/production/)). The record remains the operator's responsibility.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Digital waste tracking software: do you need it, and what to look for",
      "description": "An honest comparison of the free gov.uk digital waste tracking service against paid software for permitted receiving sites.",
      "author": { "@type": "Organization", "name": "WasteDuty" },
      "publisher": {
        "@type": "Organization",
        "name": "WasteDuty",
        "url": "https://wasteduty.co.uk"
      },
      "datePublished": "TBD",
      "dateModified": "2026-08-08",
      "mainEntityOfPage": "https://wasteduty.co.uk/guides/digital-waste-tracking-software"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do I have to buy software to comply with digital waste tracking?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. DEFRA's gov.uk service is free and sufficient at low volume. Software addresses workflow, evidence and volume — the legal duty stays with the site operator."
          }
        },
        {
          "@type": "Question",
          "name": "Can software submit DWT records for me?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes — DEFRA's Receipt of Waste API allows approved software providers to submit on an operator's behalf. The record remains the operator's responsibility."
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
