# FT-01 / 0052 — Immutable 53-migration source chain for first-commercial launch (HELD)

**Date:** 2026-11-09 Baghdad. **Exact executable SHA:** [`c0b7411c36285b9834d373a6dfb9e314eb1912dc`](https://github.com/nora953/fawri-production-source/commit/c0b7411c36285b9834d373a6dfb9e314eb1912dc).
**Direct test:** [FT-01 PostgreSQL18 run #42609504398](https://github.com/nora953/fawri-production-source/actions/runs/42609504398), job `129134002151`, **COMPLETED SUCCESS**. Does not attest Neon-hosted readiness.

## Source blocker closed at local review level

Previously `scripts/lib/ft01-clean-bootstrap-source-plan.mjs` verified journal order and exact `0052` checksum, but *recalculated* SHA values for `0000–0051` and returned a freshly generated migration source manifest. A syntactically valid unauthorized change to those earlier SQL files or to early journal timestamps could therefore silently become the new "accepted" source manifest. Snapshot/stage edits that preserved the expected fields could similarly pass as structurally valid. This was a concrete **source provenance fail-open**, not an external-provider prerequisite.

**Fix:** Freeze four independent source pins in `FT01_PINNED_CLEAN_SOURCE` and match actual source bytes after the established structural checks:
- Exact migration manifest for SQL `0000..0052` (`[index,tag,sha256(SQL)]`, 53 entries): `f218f0f24733421fc1ffd36ae09db8c7470022bb3ea3e78c5dc68b8472c5d594`.
- Canonical Drizzle journal `_journal.json`: `d8f226a4651d35fced281c40afc7a6d9d1c322dd9d47d89322088a6bb49db852`.
- Canonical `meta/0052_snapshot.json`: `993461e7bdccce8a2c7386054ce43e57b6eab73e7f80d87d13dc5e693651c9e4`.
- Canonical `migration-stages/0052/stage.json`: `4798e07b6713dfbef6231981f737ce598ddd72a9acf42fdda61f0a704eaabefd`.

The four values were independently recorded by [earlier FT-01 source-inventory CI #42609142260](https://github.com/nora953/fawri-production-source/actions/runs/42609142260) directly from the exact reviewed GitHub files, then **hard-pinned** and proved on the final executable SHA above. No original migration SQL, journal or snapshot was modified. The bundled API's `FT01_PINNED_FIRST_COMMERCIAL_SOURCE` now carries the same four pins; its source-only CI test compares all of them to the full review plan without reintroducing filesystem reads into the server.

**Negative regression acceptance:** An otherwise valid post-review SQL edit to `0001` or `0051` causes `FT01_SOURCE_CHAIN_PIN_DRIFT`; a valid `0001` journal `when` mutation causes `FT01_JOURNAL_SOURCE_PIN_DRIFT`; an extra valid metadata field in `0052_snapshot.json` causes `FT01_0052_SNAPSHOT_PIN_DRIFT`; a valid extra `stage.json` field causes `FT01_0052_STAGE_PIN_DRIFT`. Earlier structural negatives and held `0052` checks remain enforced. Tests succeeded in [#42609504398](https://github.com/nora953/fawri-production-source/actions/runs/42609504398). Exact runner log: `FT01_FIRST_COMMERCIAL_0052_INVOKER_REVIEW_MANIFEST_FAIL_CLOSED_PASS`, `FT01_SOURCE_ONLY_0052_HOLD_PASS`, and exact pinned manifest `f218f0f24733421fc1ffd36ae09db8c7470022bb3ea3e78c5dc68b8472c5d594`.

## Explicit no-go scope

This repairs a **local source-integrity prerequisite**. It does not create an approved first-commercial executable migration artifact or resolve the canonical `0052` non-superuser owner-transfer defect on the *hosted* Neon project. It does not confer independent project/branch identity, real restricted LOGIN grants, an externally tested restore, actual hosted SQL/HTTP acceptance, financial protocol `SEQ-D3` closure, provider readiness or release sign-off.

**Canonical 0052 SQL/journal/snapshot unchanged; no Neon/Railway operations, release deploy, merge, secrets, historical data import or role changes. PR #550 DRAFT. FIELD002 OPEN, 0052 hosted BLOCKED, P0 launch NO-GO.** Registry remains **29/45 `CLOSED_SOURCE` = 64.4% known source-row coverage**, 7 `OPEN`, 9 `BLOCKED`, inventory incomplete. Do not represent that as commercial-launch completion.
