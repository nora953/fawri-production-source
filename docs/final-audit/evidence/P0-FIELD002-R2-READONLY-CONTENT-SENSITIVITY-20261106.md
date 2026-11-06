# FIELD002-R2 — isolated Neon SELECT-only content-sensitivity screening, 2026-11-06

## Scope and authoritative source

- Authorized by the product owner in the current conversation **only for SELECT-only inspection of the previously reviewed isolated Neon rehearsal branch**.
- Project: `round-fire-18493605` (`Fawri-Staging`); branch: `br-young-hill-b1x9vhlz` (`fawri-p0-field002-rehearsal-20261104`); database: `neondb`. Neon branch metadata independently confirmed `primary=false`, `default=false`, `parent_id=br-falling-dust-b1km4gix`. **No default branch, staging parent or production branch SQL query was executed.**
- No SQL mutation, trigger, grant, role, import, export, schema change, cleanup, secret retrieval, direct values, merchant IDs, notification IDs or message bodies; introspection and aggregated SELECTs only.
- Product owner has attested that no actual merchants have ever been onboarded and the historical notifications were generated during precommercial testing. This is a **product-owner attestation**, not independent real-person PII certification.

## Rechecked on the actual isolated branch (SELECT-only)

| Metric | Observed |
| --- | ---: |
| Total `public.notifications` rows | 28 |
| Distinct merchant identifiers | 1 |
| Distinct account identifiers | 1 |
| Rows missing **both** source-reference columns | 15 |
| Rows with both source-reference columns | 13 |
| Rows with exactly one missing source reference | 0 |
| Non-object `variables` payloads | 0 |
| Non-merchant audience | 0 |
| Missing merchant scope | 0 |
| Rows unread | 2 |
| Rows with `expires_at` populated | 0 |
| Earliest / latest row creation date UTC | 2026-07-29 / 2026-10-09 |

The 15 rows without source references belong to four subscription-notification types, matching the prior fingerprint evidence:

| Type | Rows | JSON key occurrences | Unexpected keys | Nested JSON | Email-like | Iraq-phone-like | External-link-like |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `subscription_balance_purchase` | 9 | 76 | 0 | 0 | 0 | 0 | 0 |
| `subscription_emergency_activated` | 2 | 8 | 0 | 0 | 0 | 0 | 0 |
| `subscription_expiry_reminder` | 1 | 3 | 0 | 0 | 0 | 0 | 0 |
| `subscription_plan_event` | 3 | 28 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **15** | **115** | **0** | **0** | **0** | **0** | **0** |

Additional aggregated checks on all **15** unlinked rows:
- No unexpected sensitive **key names** indicating password, secret, token, credential, email, phone, mobile, address, customer, message, payload or cookie.
- No scalar string longer than 120 characters.
- No unexpected enumerated `plan_name` / `previous_plan_name` values or `operation` values, as compared against the reviewed product contracts.
- All 15 IDs match the historical `merchant-notification-<13-digit-epoch>-<6-alphanumeric>` shape; none requires an invented source reference to match the expected format.
- All 15 `title_key` and `body_key` strings match the `notifications.<type>.title/body` template-label structure; none is missing account/merchant scope; none has a stored expiry.
- No raw values were fetched or written into this evidence. Email/phone/URL checks are heuristic **pattern checks only**; they cannot prove absence of every real person's name or other sensitive information.

**Important separate finding concerning the other 13 rows:** all-row key enumeration shows `admin_name` and `ticket_subject` in the 11 `inspection_session_request` rows and `ticket_subject` in one support reminder. These are free-text or person-like fields despite the product owner's test-only assertion. Their original values were **not retrieved**, so we cannot independently certify that no real people's names appear anywhere in the full 28-row cohort. The original 15-reference-gap cohort does **not** contain these free-text keys.

## Exact read-only verification method

1. Neon project/branch metadata inspection and `public.notifications` schema description.
2. Aggregated `SELECT COUNT`, `FILTER`, `COUNT(DISTINCT)`, date and JSON type checks; no per-row identifiers.
3. `CROSS JOIN LATERAL jsonb_each(variables)` grouped by notification `type` and JSON **field key** only, with regex evaluations **returned as counts**, never source values.
4. Focused WHERE `source_entity_type IS NULL AND source_entity_id IS NULL` for schema-contract allowlist keys, approved enum classes, nested JSON, email/phone/URL indicators, title/body template shape, legacy ID shape, and explicit expiry. **No output of personal content.**

## Engineering disposition and exact remaining acceptance

**Accepted as a bounded evidence result:** The fifteen unlinked historical records are consistent with expected subscription test fixture structure, with zero anomalies against the named field allowlist and zero screened direct-sensitive patterns. Together with the owner's precommercial attestation, this supports treating them as **test-only legacy cohort pending final disposition**, not proof of historical writer attribution and not an authorization for guessed source links, data edits, or unrestricted production migration.

**Remaining FIELD002-R2 policy decision and proof:**
1. Adopt a **nonproduction-only preservation and commercial cutover-exclusion** disposition for the historical 28-row cohort, including clear treatment of possible real-person text in the other 13 and an explicit later review/deletion lifecycle before real merchant onboarding. This is recommended, **not yet approved by this SELECT-only authorization**.
2. Source-side generic cutover guards refuse unreviewed `rows.notifications` on the accepted code commit `6f7ab1cdb6fce50f0c082d168cdaddac7fe7d9f5`. This is not proof that every backup/restore, direct SQL tool, old deployed writer, external client, or future commercial deployment is isolated. Confirm actual release target and import/restore configuration independently before launch.
3. Keep the 13 linked notifications distinct from the 15 unlinked ones; do not infer that an email/phone regex scan proves absence of real names in `admin_name` or `ticket_subject`.
4. No deletion, backfill, new grants/roles, hosted deployment, migration 0052 or release signoff authorized.

**Gate status:** FIELD002-R1 and R3 accepted within their source/CI boundaries; R2 remains **OPEN**, 0052 **BLOCKED**, top-level `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX` **OPEN**, overall 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED (45 known rows, incomplete inventory), overall P0 percent unverified, **NO-GO**. This SELECT audit does not expand scope to the other seven residual tables.
