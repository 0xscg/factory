<!-- GENERATED DRAFT — operator edit pass required before publish -->

---

title: "EWC codes: a practical guide for receiving sites"
description: "What European Waste Catalogue (EWC / List of Waste) codes are, how to pick the right 6-digit code at the weighbridge, common skip-hire and transfer-station codes, and why the code is a mandatory digital waste tracking field."
slug: ewc-codes-guide
publishDate: TBD
jsonLdType: [Article, FAQPage]
---

# EWC codes: a practical guide for receiving sites

_Rules version: The Digital Waste Tracking (England) Regulations 2026 (draft SI as published on legislation.gov.uk) · Last reviewed: 8 August 2026_

Every waste record you'll submit under digital waste tracking needs a **6-digit EWC code** — it's on the mandatory field list for the DEFRA Receipt of Waste API ([DEFRA receipt data definitions](https://defra.github.io/waste-tracking-service/production/)). Getting it right at the weighbridge, not retrospectively, is what keeps your records clean.

## What EWC codes are

The European Waste Catalogue — retained in UK law as the **List of Waste** ([List of Wastes (England) Regulations 2005, SI 2005/895](https://www.legislation.gov.uk/uksi/2005/895)) — classifies waste with a six-digit code: two digits for the source chapter, two for the sub-chapter, two for the specific waste. Codes marked with an asterisk (\*) are hazardous. Gov.uk's waste classification guidance (Technical Guidance WM3) is the working reference for assessment `[VERIFY: current WM3 edition/URL]`.

## How to choose a code

1. **Start from the source of the waste** (the chapter), not what it looks like.
2. **Check for a specific entry** in the sub-chapter before reaching for a "wastes not otherwise specified" (…99) code.
3. **Mirror-entry pairs:** where a hazardous (\*) and non-hazardous version of the same entry exist, the classification depends on whether hazardous properties are present — assess, don't assume.
4. **Record the reasoning** the first time you classify a new stream; reuse it as evidence.

## Codes receiving sites see constantly

| Code     | Description                                              |
| -------- | -------------------------------------------------------- |
| 17 09 04 | Mixed construction and demolition wastes (non-hazardous) |
| 20 03 01 | Mixed municipal waste                                    |
| 17 01 07 | Mixtures of concrete, bricks, tiles and ceramics         |
| 17 05 04 | Soil and stones (non-hazardous)                          |
| 20 02 01 | Biodegradable (garden) waste                             |
| 17 02 01 | Wood                                                     |
| 15 01 06 | Mixed packaging                                          |

`[VERIFY: descriptions against the List of Waste before publish — table drafted from common usage.]`

## Why it matters more under DWT

On paper, a wrong code on a transfer note surfaced only at inspection. Under DWT, the code goes into a central government record within two working days of receipt ([Digital Waste Tracking (England) Regulations 2026](https://www.legislation.gov.uk/ukdsi/2026/9780348282726)) — and your permit lists which EWC codes your site may accept. A pattern of receipts coded outside your permitted list is visible in a way it never was before. Two habits protect you: a site-specific shortlist of your permitted codes at the weighbridge, and a rule that "…99" codes trigger a supervisor check.

WasteDuty lets you constrain each site's record forms to its permitted EWC codes, flags out-of-list entries before submission, and keeps the classification evidence with the movement record. Classification remains your call as duty-holder — the software keeps the record of how you made it.

## FAQ

**Are EWC and List of Waste codes the same thing?**
Yes — "EWC code" is the everyday name; the legal instrument in England is the List of Wastes (England) Regulations 2005 ([SI 2005/895](https://www.legislation.gov.uk/uksi/2005/895)).

**What does the asterisk mean?**
The entry is hazardous waste; consignment-note and hazardous-waste rules apply, and the DWT record's hazardous indicator must be set.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "EWC codes: a practical guide for receiving sites",
      "description": "What EWC / List of Waste codes are, how to pick the right 6-digit code at the weighbridge, and why the code is a mandatory digital waste tracking field.",
      "author": { "@type": "Organization", "name": "WasteDuty" },
      "publisher": {
        "@type": "Organization",
        "name": "WasteDuty",
        "url": "https://wasteduty.co.uk"
      },
      "datePublished": "TBD",
      "dateModified": "2026-08-08",
      "mainEntityOfPage": "https://wasteduty.co.uk/guides/ewc-codes-guide"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Are EWC and List of Waste codes the same thing?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes — 'EWC code' is the everyday name; the legal instrument in England is the List of Wastes (England) Regulations 2005 (SI 2005/895)."
          }
        },
        {
          "@type": "Question",
          "name": "What does the asterisk on an EWC code mean?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The entry is hazardous waste; hazardous-waste rules apply and the digital waste tracking record's hazardous indicator must be set."
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
