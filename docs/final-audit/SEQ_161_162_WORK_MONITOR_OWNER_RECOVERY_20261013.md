# SEQ-161–162 — Admin WorkMonitor and owner recovery source gates (2026-10-13)

Read-only source audit; no fresh HTTP/browser runtime or real owner recovery generation.

## SEQ-161 AdminWorkMonitorPage

`artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx` lines 155–189: GET `/api/auth/admins/:adminId/work-monitor` every 15s. Failed silent poll is caught but **does not clear `data` or set `loadError`**; existing privileged device/session details and action affordances remain visible. Candidate `WORK-MONITOR-STALE-001`, **source-confirmed only**; needs actual-component Chrome 401/403/503/expiry test. This is stale display, not evidence of successful backend unauthorized action.

Lines 194–244: trust/revoke action POST includes `owner_password` and requires response.ok and result.ok before success toast. Failed action sets error. Positive client-side check; backend authorization not inferred from UI alone.

## SEQ-162 owner recovery routes

`artifacts/api-server/src/routes/auth-owner-recovery-postgres-routes.ts` lines 227–256: status and generate both call `ownerContext(res)` and return if missing. Generation returns one-time `key_1`/`key_2` plus `display_once:true` only through owner-gated endpoint. No source proof of non-owner access.

Lines 130–175: recovery proof is AES-GCM encrypted cookie, HttpOnly, SameSite=strict, secure in production, scoped to `/api/auth/owner-recovery`, TTL; proof fingerprint binds recoveryId, invalid/expired returns 401 and clears cookie. Positive controls on source, not full security proof.

Pending: inspect `ownerContext` role semantics and recovery service atomicity, actual non-owner 403/401, replay/OTP/rate-limit tests. Do not generate real recovery credentials during audit.

No app changes. Release BLOCKED; overall ~54%/46% planning estimate unchanged.
