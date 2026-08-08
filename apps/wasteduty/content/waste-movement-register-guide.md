<!-- GENERATED DRAFT — operator edit pass required before publish -->

---

title: "The waste movement register: building one an EA officer can actually read"
description: "What a waste movement register is, the columns it needs under the 2026 digital waste tracking field set, how it feeds permit returns, and how to keep it reconciled with evidence."
slug: waste-movement-register-guide
publishDate: TBD
jsonLdType: [Article, FAQPage]
---

# The waste movement register: building one an EA officer can actually read

_Rules version: The Digital Waste Tracking (England) Regulations 2026 (draft SI as published on legislation.gov.uk) · Last reviewed: 8 August 2026_

A movement register is the one document that answers "what came through this site, when, from whom, and where did it go" in a single table. Inspectors ask for it; permit returns are built from it; and from 1 October 2026 every row in it corresponds to a legally required digital waste tracking (DWT) record ([The Digital Waste Tracking (England) Regulations 2026](https://www.legislation.gov.uk/ukdsi/2026/9780348282726)).

## The columns that matter

Build the register on the DWT mandatory field set ([DEFRA receipt data definitions](https://defra.github.io/waste-tracking-service/production/)) so one dataset serves the register, the DWT submission and the permit return:

| Column                          | Why                                              |
| ------------------------------- | ------------------------------------------------ |
| Date/time received              | DWT mandatory; anchors the two-working-day clock |
| Your reference                  | Links to weighbridge ticket / evidence           |
| EWC code + description          | DWT mandatory; permit-condition check            |
| Physical form, containers       | DWT mandatory                                    |
| Weight (unit, estimated flag)   | DWT mandatory; tonnage-limit tracking            |
| Hazardous indicator             | DWT mandatory                                    |
| D/R code                        | DWT mandatory                                    |
| Carrier + CBDU number           | DWT mandatory; duty-of-care evidence             |
| Means of transport              | DWT mandatory                                    |
| DWT submission reference + date | Proof each row was recorded in time              |

## Three habits that keep it honest

1. **One row per load, entered at receipt** — a register reconstructed at month-end from tickets is where gaps are born.
2. **Reconcile weekly:** rows vs weighbridge tickets vs DWT submissions. Any row without a submission reference inside two working days is an incident, not admin.
3. **Tonnage running totals per EWC code** against your permit limits — quarterly returns then fall out of the register instead of becoming a separate archaeology exercise. `[VERIFY: the skin's target permit return cadence/format varies by permit — keep generic in copy]`

## Register vs the gov.uk service

The DWT service holds what you submitted; it isn't designed as your operational register with your references, evidence links and permit-limit tracking. Keep your own register as the working document, with the DWT reference per row proving each submission.

In WasteDuty the register is a view over your movement records: filter by date range or EWC code, see submission status and deadline state per row, and export it — or the full inspection pack (register + evidence index + audit extract) — in one click. The records are yours and exportable; the duty to keep them accurate stays with you as operator.

## FAQ

**Is a movement register itself a legal requirement?**
The underlying obligations are the DWT recording duty and the duty of care record-keeping under EPA 1990 s.34 and SI 2011/988 ([legislation.gov.uk](https://www.legislation.gov.uk/ukpga/1990/43/section/34)). The register is the standard way sites organise and produce those records; many permits also impose record-keeping conditions `[VERIFY: against your own permit conditions]`.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "The waste movement register: building one an EA officer can actually read",
      "description": "What a waste movement register is, the columns it needs under the 2026 digital waste tracking field set, and how to keep it reconciled with evidence.",
      "author": { "@type": "Organization", "name": "WasteDuty" },
      "publisher": {
        "@type": "Organization",
        "name": "WasteDuty",
        "url": "https://wasteduty.co.uk"
      },
      "datePublished": "TBD",
      "dateModified": "2026-08-08",
      "mainEntityOfPage": "https://wasteduty.co.uk/guides/waste-movement-register-guide"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is a waste movement register a legal requirement?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The underlying legal obligations are the digital waste tracking recording duty and duty of care record-keeping; the register is the standard way sites organise and produce those records, and many environmental permits impose record-keeping conditions."
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
