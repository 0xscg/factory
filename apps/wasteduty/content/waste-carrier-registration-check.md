<!-- GENERATED DRAFT — operator edit pass required before publish -->

---

title: "Waste carrier registration checks (CBDU): how receiving sites verify and evidence them"
description: "How to check a waste carrier, broker or dealer registration on the Environment Agency public register, why the CBDU number is a mandatory DWT field, and how to keep evidence of every check."
slug: waste-carrier-registration-check
publishDate: TBD
jsonLdType: [Article, FAQPage]
---

# Waste carrier registration checks (CBDU): how receiving sites verify and evidence them

_Rules version: The Digital Waste Tracking (England) Regulations 2026 (draft SI as published on legislation.gov.uk) · Last reviewed: 8 August 2026_

Two reasons a receiving site checks every carrier at the gate. First, the duty of care: EPA 1990 s.34 requires reasonable measures to make sure waste is transferred only between authorised persons ([legislation.gov.uk](https://www.legislation.gov.uk/ukpga/1990/43/section/34)). Second, from 1 October 2026 the **carrier registration number is a mandatory field** on every digital waste tracking receipt ([DEFRA receipt data definitions](https://defra.github.io/waste-tracking-service/production/)) — a load from an unregistered carrier is a record you can't complete properly.

## The register and the number

Carriers, brokers and dealers register with the Environment Agency under the Control of Pollution (Amendment) Act 1989 and the Waste (England and Wales) Regulations 2011 ([SI 2011/988](https://www.legislation.gov.uk/uksi/2011/988)). Registration numbers look like **CBDU123456** (upper tier) or **CBDL123456** (lower tier). The EA's public register of waste carriers, brokers and dealers is free to search `[VERIFY: current search URL — environment.data.gov.uk public register]`.

- **Upper tier (CBDU):** carriers transporting other people's waste in the normal course of business — the tier your commercial carriers should hold. Renewable every three years `[VERIFY: renewal period]`.
- **Lower tier (CBDL):** limited categories (e.g. carrying only your own non-construction waste); does not expire `[VERIFY]`.

## A check worth doing (and evidencing)

1. **Search the register** by registration number, not just company name — names get reused and misspelled.
2. **Match the legal entity** on the registration to the entity invoicing you.
3. **Check the tier** — a skip firm carrying customers' waste on a lower-tier registration is a red flag.
4. **Note the expiry date** and diarise a re-check.
5. **Capture evidence:** screenshot or export of the register result, dated, attached to the carrier's record. An undocumented check might as well not have happened when the EA visits.

## Cadence

- **New carrier:** full check before the first load crosses the weighbridge.
- **Every load:** confirm the CBDU number given matches the carrier on file (this becomes automatic once it's a required field on your intake form).
- **Quarterly:** re-verify all active carriers; registrations lapse and get revoked.

## How WasteDuty handles it

Each carrier is a record with registration number, tier, expiry and the dated evidence of your last check. Expiry reminders fire at 30/7/1 days; receipts referencing a carrier with a lapsed check get flagged before DWT submission. The check itself — and the decision to turn a wagon away — remains yours as duty-holder; WasteDuty keeps the evidence that you made it.

## FAQ

**Is checking the register a legal requirement?**
The duty of care requires reasonable measures to transfer waste only to authorised persons (EPA 1990 s.34). Checking the public register, and keeping evidence of the check, is the standard way to demonstrate those measures were taken.

**What if a carrier turns up without a registration number?**
You can't complete the mandatory DWT receipt fields without one, and accepting the load risks a duty-of-care breach. Most sites refuse the load; that decision is the operator's.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Waste carrier registration checks (CBDU): how receiving sites verify and evidence them",
      "description": "How to check a waste carrier registration on the EA public register, why the CBDU number is a mandatory DWT field, and how to evidence every check.",
      "author": { "@type": "Organization", "name": "WasteDuty" },
      "publisher": {
        "@type": "Organization",
        "name": "WasteDuty",
        "url": "https://wasteduty.co.uk"
      },
      "datePublished": "TBD",
      "dateModified": "2026-08-08",
      "mainEntityOfPage": "https://wasteduty.co.uk/guides/waste-carrier-registration-check"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is checking the waste carrier register a legal requirement?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The duty of care under EPA 1990 s.34 requires reasonable measures to transfer waste only to authorised persons. Checking the public register and keeping evidence of the check is the standard way to demonstrate this."
          }
        },
        {
          "@type": "Question",
          "name": "What if a carrier has no registration number?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The carrier registration number is a mandatory digital waste tracking field, and accepting the load risks a duty-of-care breach. Most sites refuse the load; the decision rests with the operator."
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
