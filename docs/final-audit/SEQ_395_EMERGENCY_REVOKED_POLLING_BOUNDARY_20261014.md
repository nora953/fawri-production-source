# SEQ-395 — Emergency UI revoked-session polling: bounded source finding

Evidence reviewed at audit branch, `artifacts/fawri/src/pages/AdminEmergencyAccessPage.tsx`:

- Lines 240–253: `loadAll(silent)` concurrently fetches `/overview` and `/directory` every 10 seconds (lines 279–283).
- Lines 254–259: only HTTP 401 invokes session clear/redirect (lines 231–238). HTTP 403 or non-ok JSON throws.
- Lines 260–270: on success, overview, directory and authorization drafts are replaced.
- Lines 271–275: **on a silent refresh failure, error is logged but `loadError` is not set; previous `overview`, `directory`, `authorizationDrafts`, `snapshot`, and form state are not cleared**.
- Lines 428–445: page error boundary depends on `loadError` or null overview/directory; `allowed` is derived from retained `overview`.
- Lines 467–499 and 547–550: retained `allowed=true` continues rendering merchant directory names and request form with submit action even after a subsequent 403 refresh, until navigation or a later successful response. Server-side rejection of POST is separate and **not bypassed by this UI behavior**.

## Classification
**SOURCE-CONFIRMED UI stale authorization/data presentation on silent 403** (conditional on successful initial authorized load followed by revoked/denied poll). This is a security-relevant frontend state invalidation gap; it is **not** proof of unauthorized server reads or writes, and no mounted browser assertion has yet reproduced it. Cross-reference SEQ-391; avoid duplicate issue without checking ISSUES.md.

## Regression scenario still needed
1. Mount real AdminEmergencyAccessPage with deterministic mock fetch and fake 10-second interval.
2. First GET `/overview` + `/directory` returns authorized 200 with merchant sentinel and `can_request=true`; verify authorized merchant visible.
3. Next silent poll both GETs return 403; assert old merchant sentinel is removed and privileged controls are hidden/disabled (expected secure UX; source currently does not implement).
4. Distinguish 401 redirect, 403 revoke, transient 500/network failure; test initial 403 error boundary separately.
5. Verify backend POST returns 403 after revocation independently; CI SEQ-394 only covers aggregate HTTP suite, not this mounted browser scenario.

Audit-only documentation; no application fixes. Release BLOCKED, overall audit progress NOT_YET_MEASURABLE.
