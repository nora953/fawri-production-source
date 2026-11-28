# FAWRI V1 G4 — merchant Google signup legal-policy review packet (HELD)

**Date:** 2026-11-23  
**Scope:** owner-approved **manual-commerce V1**, not full Meta/billing/POS product.  
**Release state:** **LEGAL REVIEW REQUIRED; NOT PUBLISHED; NO-GO**.  
**Work branch:** `fix/p0-provider-receipt-order-discovery-20261015` (Draft PR #550).  
**No production policy/env/provider/Neon/Render change is authorized by this packet.**

## Owner-confirmed provisional operator facts (drafting evidence, not legal signoff)

- As of 2026-11-23 the owner confirmed FAWRI operates **personally**, from **Iraq**, while incorporation of a **U.S. company is in progress**; the not-yet-formed U.S. entity **must not** be advertised as the current contracting service provider. Draft wording must describe an individual operator until the actual legal entity and effective transfer are verified. Official spelling, service address, applicable law and legal review remain unverified; do **not** infer they are settled.
- The owner chose an eventual professional domain mailbox for public support, but expressly **deferred purchasing/setting it up** until critical launch blockers are addressed. Do not invent or publish an operational `support@fawrireply.com` mailbox or treat a hypothetical address as reachable. Existing private Google Cloud support/developer email is not evidence of an approved publicly operated support channel.
- The Google OAuth owner-console setup and maintenance-ON Render deployment are recorded in `PROGRESS.md` (2026-11-23), but neither approves these legal texts nor makes `/privacy` or `/terms` public while service maintenance is enabled.

## Why this is a concrete G4 release dependency

The first-party signup UI displays three localized versions of the same Terms and Privacy material through `PolicyContent` and `getPolicyText`, sourced from `artifacts/fawri/src/lib/translations/features/content/policies.ts`. The currently shown text is a **short legacy statement**, not an independently signed-off versioned merchant contract for the actual Google/WhatsApp/manual-commerce service. For example:

- The privacy copy enumerates account **name, phone, store and activity**, product data and customer messages. It does **not explicitly cover the Google verified subject/issuer, Google account linkage, optional phone-before-verification, WhatsApp OTP delivery/receipt, the trial-abuse evidence ledger and the impact of deletion/retention on legal/financial evidence**.
- The Terms text frames a subscription as a **reply-count allotment** and describes automatic replies stopping at expiry. In the owner's limited first-commercial V1, **Meta/AI automatic replies, electronic payment and cashier/POS are excluded** and may not be sold as current functionality. Supported first-offer behavior is manual orders, cash on delivery, and authorized audited subscription activation.
- The privacy statement allows merchant data deletion requests but does not explain **what records may need retention, deletion limits, legal holds, or how requests are actually fulfilled**. The source includes security and audit histories that cannot be silently discarded.
- These strings are displayed in **Arabic, English, and Kurdish**; all three need approved, semantically consistent content **before** their respective `FAWRI_V1_TERMS_VERSION` / `FAWRI_V1_PRIVACY_VERSION` labels may legitimately represent reviewed published texts.

This is a **content and approval gap**, not a claim that the existing authorization implementation bypasses consent. The source-only registration guard correctly rejects missing or malformed version pins for a new Google signup, while letting existing linked merchants sign in. Merely selecting syntactically valid environment values is **not** proof that these policy texts have been legally reviewed and published.

## Bounded owner/legal review decisions before first real Google merchant

| Item | Required verified decision or evidence |
| --- | --- |
| Identity & contact | Actual legal service provider/controller identity, jurisdiction, customer-support address and verifiable contact channel; never invent this from the repo name or domain. |
| Processing disclosure | Accurate collection, use and sharing of Google OIDC subject/issuer, merchant account fields, WhatsApp phone verification and provider receipts, IP/rate-limit fingerprints, anti-abuse trial records, catalog, manual orders and customer personal information. |
| Retention & requests | Real approved retention/deletion policy and requests process, including audit/financial retention exceptions, account closure and the security proof ledger. Confirm operational behavior matches the copy. |
| Service scope | Clearly say V1 does **manual COD order management** and audited admin subscription activation; do **not** promise active Meta/AI auto-replies, in-app support, POS, gateway payments or guaranteed sales. |
| Commercial terms | Reviewed price/currency display, trial eligibility only after phone/provider proof and risk review, no automatic recurring online payment in V1, subscription authorization, expiry, suspension, cancellations, disputes and refunds. |
| Geography | Countries supported, governing law/consumer obligations, cross-border storage/processors and lawful basis/consent appropriate for each marketed country; do not imply global legal compliance from one text. |
| Language parity | Legal approver validates the complete ar/en/ku displayed wording and meaning, including what an account holder is consenting to. |
| Publication proof | Freeze the exact reviewed text in source, identify an immutable version/date for **each** policy, record a review decision and confirm the actual deployed browser page matches the reviewed revision. |
| Admission authorization | Only **after** owner approval and release-specific provider/schema prerequisites may an authorized operator set `FAWRI_V1_TERMS_VERSION` / `FAWRI_V1_PRIVACY_VERSION`, and then separately enable the default-OFF Google/WhatsApp flows. |
| Hosted acceptance | Google OIDC approved origin and client, WhatsApp BUSINESS Authentication/COPY_CODE approved template and real delivered/redeemed code, two independent merchants with manual COD orders and denied cross-tenant access. These are **separate** gates from policy publication. |

## Safe next action

Review or replace the two existing localized policy bodies with **real legal text** under a tracked review; keep the exact source revision and owner signoff. Then add a source-pinned policy-version acceptance record and deploy it only inside a separately authorized maintenance-ON validation window. A valid version label, passing unit tests, or this packet **does not** authorize publishing, signing up test merchants on production, or commercial GO.

**No change to P0 counts:** the historical P0 closure register and owner-approved V1 split remain unchanged. G4 and hosted G5 remain open. This packet neither alters functional service behavior nor turns off any legal protection.
