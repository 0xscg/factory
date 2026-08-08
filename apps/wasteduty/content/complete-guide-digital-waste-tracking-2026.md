<!-- GENERATED DRAFT — operator edit pass required before publish -->

---

title: "The complete guide to digital waste tracking (DWT) 2026"
description: "What the UK digital waste tracking mandate means for permitted receiving sites: who must comply, from when, the two-working-day rule, mandatory receipt fields, penalties and how to prepare."
slug: complete-guide-digital-waste-tracking-2026
publishDate: TBD
jsonLdType: [Article, FAQPage]
---

# The complete guide to digital waste tracking (DWT) 2026

_Rules version: The Digital Waste Tracking (England) Regulations 2026 (draft SI as published on legislation.gov.uk) · Last reviewed: 8 August 2026_

From **1 October 2026**, if you operate a permitted waste facility in England or Wales — a transfer station, a treatment site, a skip-hire yard with its own permit — you must record every load of controlled waste you receive in the government's digital waste tracking (DWT) service, and you must do it **by the end of the second working day after receipt**. ([The Digital Waste Tracking (England) Regulations 2026, legislation.gov.uk](https://www.legislation.gov.uk/ukdsi/2026/9780348282726))

This guide covers who the duty falls on, the dates, what a compliant receipt record must contain, the enforcement picture, and how a small operator gets ready without hiring a compliance officer.

**One thing up front:** software (including WasteDuty) does not take the legal duty off you. You, the site operator, remain the duty-holder. What good software does is keep your records complete, timestamped and inspection-ready, so that when the Environment Agency asks, the evidence is there.

## What is digital waste tracking?

Digital waste tracking replaces the paper-and-spreadsheet patchwork of waste transfer notes, consignment notes and returns with a single digital record per waste movement, submitted to a central government service. The legal foundation is **section 58 of the Environment Act 2021**, which gave the Secretary of State the power to introduce mandatory electronic waste tracking ([Environment Act 2021 s.58](https://www.legislation.gov.uk/ukpga/2021/30/section/58)); the operational rules for England arrive via **The Digital Waste Tracking (England) Regulations 2026** ([legislation.gov.uk](https://www.legislation.gov.uk/ukdsi/2026/9780348282726)).

Your existing **duty of care** obligations do not go away. Section 34 of the Environmental Protection Act 1990 ([EPA 1990 s.34](https://www.legislation.gov.uk/ukpga/1990/43/section/34)) and the Waste (England and Wales) Regulations 2011 ([SI 2011/988](https://www.legislation.gov.uk/uksi/2011/988)) continue to apply. DWT changes _how_ movements are documented, not _whether_ you owe a duty of care.

## Who must comply, and when

The rollout is phased. The October 2026 duty lands on the **receiving site**, not the carrier.

| Date               | Who                                                                            | Where                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Spring 2026        | Public beta (voluntary) for permitted/licensed receiving site operators        | England & Wales                                                                                                                  |
| **1 October 2026** | **Mandatory for operators of permitted facilities receiving controlled waste** | England & Wales                                                                                                                  |
| January 2027       | Receiving sites                                                                | Scotland & Northern Ireland `[VERIFY: Scottish instrument cited in research as SSI 2026/145 — confirm number and NI equivalent]` |
| October 2027       | Carriers, brokers and dealers ("waste collectors")                             | UK-wide `[VERIFY against current gov.uk rollout page before publish]`                                                            |

Sources: [The Digital Waste Tracking (England) Regulations 2026](https://www.legislation.gov.uk/ukdsi/2026/9780348282726); [gov.uk digital waste tracking service page](https://www.gov.uk/government/publications/digital-waste-tracking-service).

If you run a transfer station, treatment facility or a skip-hire operation with your own permitted site, **you are in the first mandatory wave**. If you are purely a carrier with no permitted site, your recording duty arrives in October 2027 — but the receipts recorded at the sites you tip at will carry your carrier registration number from day one.

## The two-working-day rule

Each load of controlled waste received at a permitted facility must be recorded in the DWT service **by the end of the second working day following receipt** ([Digital Waste Tracking (England) Regulations 2026](https://www.legislation.gov.uk/ukdsi/2026/9780348282726)).

For a busy transfer station taking 30–60 loads a day, this is the operational crunch: a backlog of two days' tickets is a backlog of legal deadlines. Whatever process you adopt — direct entry into the gov.uk service, or software that submits via the API — it needs to run at weighbridge pace, every working day, including when the person who "does the paperwork" is on holiday.

## What a receipt record must contain

The DEFRA "Receipt of Waste" API defines the mandatory data per receipt ([DEFRA developer guide, receipt data definitions](https://defra.github.io/waste-tracking-service/production/)):

- Receiver identifier (6-digit API code)
- Date and time the waste was received
- EWC code (6-digit) and waste description
- Physical form of the waste
- Container count and type
- Weight — amount, unit (g/kg/tonnes), and whether it is estimated
- Hazardous waste indicator
- Disposal or recovery (D/R) code
- **Carrier registration number**
- Means of transport
- Receiver authorisation (permit or exemption) number
- Receipt address and postcode

Optional fields include your own reference, special handling notes, hazardous consignment details, POPs data, vehicle registration and broker/dealer details.

Practical implication: if your current weighbridge ticket or transfer note doesn't capture physical form, container details, the estimated-weight flag or the D/R code, your intake form needs updating **before** October, not after.

## Penalties and enforcement

The Environment Agency (in England) is the regulator. Failure to keep and produce the required records exposes you on two fronts: the DWT regulations themselves, and your underlying duty of care under EPA 1990 s.34, breach of which is a criminal offence ([EPA 1990 s.34](https://www.legislation.gov.uk/ukpga/1990/43/section/34)).

`[VERIFY: specific penalty amounts for DWT breaches — a £5,000 fine figure and a £26/yr registration fee circulate in secondary sources only and must not be published without a primary citation. Confirm against the final SI and gov.uk guidance.]`

What we can say from the structure of the regime: your permit compliance record already affects your standing with the EA, and inspection visits to permitted sites are routine. Expect DWT records to become a standard item on a site inspection from October 2026 onwards.

## How to prepare (a 1–25-person operator's checklist)

1. **Confirm you're in scope** — permitted facility receiving controlled waste in England or Wales = 1 October 2026.
2. **Map your intake data** against the mandatory field list above; fix the gaps on your weighbridge/ticket forms.
3. **Check every carrier you accept waste from** is on the EA register of carriers, brokers and dealers, and record the check.
4. **Decide the recording route** — gov.uk service directly, or software via the API (see below).
5. **Assign the two-working-day job to a role, not a person**, with cover arrangements.
6. **Run a dry month in September**: record every receipt as if the mandate were live, and review what fell through.
7. **Keep evidence** — ticket photos, carrier registration checks, submission references — attached to each movement record so an inspection is a lookup, not a scramble.

## Software options: the honest picture

- **The free gov.uk service.** DEFRA's own DWT service is free and is the system of record either way. If you take a handful of loads a week, manual entry may be all you need.
- **Software providers (including WasteDuty).** Worth paying for when volume, evidence and workflow matter: submissions via the DEFRA API from your weighbridge flow, the two-working-day deadline tracked per movement, carrier registration checks recorded, evidence (ticket photos) attached and hashed, and an inspection-ready pack — movement register, evidence index, audit extract — in one click.

No software, WasteDuty included, discharges the duty for you. The value is audit-ready records and a workflow that stops movements slipping past the deadline. WasteDuty is £49/month Starter or £149/month Pro, VAT-exclusive, 14-day trial.

## FAQ

**Does DWT apply to my skip-hire business?**
If you operate your own permitted site (a yard where waste is tipped, sorted or transferred), yes — from 1 October 2026. If you only carry waste to third-party sites, your own recording duty starts October 2027, but sites will need your carrier registration number on every receipt from October 2026.

**Do waste transfer notes disappear?**
The duty of care under EPA 1990 s.34 remains in force. `[VERIFY: whether the 2026 Regulations formally replace the transfer-note requirement in SI 2011/988 for movements recorded in DWT, or run alongside it — check the final SI's consequential amendments.]`

**What if the waste arrives on a Friday?**
The record is due by the end of the second working day following receipt — for a Friday receipt, ordinarily end of Tuesday. ([Digital Waste Tracking (England) Regulations 2026](https://www.legislation.gov.uk/ukdsi/2026/9780348282726))

**Is there a charge to use the government service?**
`[VERIFY: registration/usage fees — the £26/yr figure is secondary-source only.]`

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "The complete guide to digital waste tracking (DWT) 2026",
      "description": "What the UK digital waste tracking mandate means for permitted receiving sites: who must comply, from when, the two-working-day rule, mandatory receipt fields, penalties and how to prepare.",
      "author": { "@type": "Organization", "name": "WasteDuty" },
      "publisher": {
        "@type": "Organization",
        "name": "WasteDuty",
        "url": "https://wasteduty.co.uk"
      },
      "datePublished": "TBD",
      "dateModified": "2026-08-08",
      "mainEntityOfPage": "https://wasteduty.co.uk/guides/complete-guide-digital-waste-tracking-2026"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Does digital waste tracking apply to my skip-hire business?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "If you operate your own permitted site, yes — from 1 October 2026. If you only carry waste, your own recording duty starts October 2027, but receiving sites will need your carrier registration number on every receipt from October 2026."
          }
        },
        {
          "@type": "Question",
          "name": "What is the two-working-day rule?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Each load of controlled waste received at a permitted facility must be recorded in the digital waste tracking service by the end of the second working day following receipt, under The Digital Waste Tracking (England) Regulations 2026."
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
