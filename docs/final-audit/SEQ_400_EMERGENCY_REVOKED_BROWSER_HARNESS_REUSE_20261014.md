# SEQ-400 — Native full-App emergency revocation browser harness reuse assessment

Source inspection of existing audit-only browser harness `docs/final-audit/evidence/seq367-full-emergency-workspace-browser.mjs` and workflow `.github/workflows/audit-full-emergency-workspace.yml`.

## Reusable actual browser harness
- Runs production Vite frontend, actual `main.tsx` / App/router/providers/emergency management page in Chrome via CDP and same-origin synthetic loopback GET API.
- Existing modes: owner, assistant, denied, load-failure, invalid-chain; AR/EN/KU and 390/1280 snapshots. No production/staging backend, provider, or mutation.
- Existing denied mode returns **HTTP200** with `authorization.can_request=false` and directory200. It proves initial denied UI branch, **not** post-revocation HTTP403.
- Existing load-failure mode sends initial 503, then retry. It does **not** simulate a successful authorized load followed by a failed silent 10-second poll.

## Missing native transition test
Within a single mounted assistant browser session, first serve overview200 + directory200 with `can_request=true`, assert sentinel merchant and request form visible; then change synthetic directory GET to403 while overview remains200 + authorization null; wait for actual 10-second silent poll, verify sentinel merchant disappears and submit control is disabled. Current `AdminEmergencyAccessPage.tsx:240-283` catches silent errors without clearing overview/directory, so expected fail is source-supported, but **not yet executed in Chrome**.

## Server proof already done
SEQ-398–399 CI run 38509676662 passed aggregate emergency HTTP PostgreSQL test, including revoked directory403 and overview200 limited-history contract; it does not test browser state.

## Execution status
This checkpoint is **source-only test-harness reuse planning**; 0 new browser tests executed and 0 new product defects confirmed. Reuse the existing full-App harness in an audit-only script/workflow, without modifying application code. Avoid repeating 24 prior owner/assistant/denied baseline snapshots.

Release BLOCKED; whole audit NOT_YET_MEASURABLE.
