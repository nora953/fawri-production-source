# SEQ-391 — Emergency access revoked-session UI source trace

2026-10-14. Source-only audit, no browser run, no backend bypass assertion, no application repair.

## Direct source observations
- `artifacts/fawri/src/pages/AdminEmergencyAccessPage.tsx:240–277` loads overview and directory together; either non-OK result throws. On `silent=true`, catch logs but does not set `loadError`, clear `overview`, clear `directory`, or clear authorization drafts. `setLoading` is also unchanged on silent errors.
- Same page `279–283` calls `loadAll(true)` every 10 seconds; a post-revocation 403 response therefore leaves the last successful in-memory overview/directory visible until another transition or unmount.
- `231–238` redirects and clears session only for 401; 403 is treated as generic load error on initial request and silent error during polling.
- `417–445` shows a generic error on initial loadError; after previously successful load, a silent 403 leaves previous data rendered and `allowed` derived from the retained overview. This is a **client-side stale presentation risk**, not proof that backend authorization was bypassed.
- `artifacts/api-server/src/services/postgresEmergencyReadAccessAuthority.ts` `getEmergencyDirectoryPostgres` requires `activeAuthorization` for nonowners; its assistants list is owner-only. New direct GET assertions in SEQ-390 remain NOT_RUN.

## Required dynamic proof
1. Mounted original App with real authorization then revocation, wait at least one 10-second refresh, observe whether previous merchant list and request controls remain visible; confirm no new successful unauthorized GET/POST.
2. Initial 403 overview200/directory403 should show denied/error state without stale data.
3. Distinguish 401 session expiry redirect from 403 authorization revocation; test race between inflight old 200 and new 403.
4. Do not file a confirmed new security defect based on source alone; check existing stale UI issue inventory first.

## State
SOURCE_ONLY / TRIAGE; 0 newly executed cases, 0 confirmed new issues. Release BLOCKED; overall completion NOT_YET_MEASURABLE.
