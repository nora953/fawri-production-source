# SEQ-390 — Emergency directory direct authorization assertions

Audit-branch test-only modifications. No application/source behavior fix, no hosted DB mutation.

## Added original-suite assertions
- Commit `37be9ceb67709e954c132834130e55e6752e585a`: after owner directory baseline, test untrusted assistant GET `/api/auth/admin/emergency-read-access/directory` returns HTTP 403 with `EMERGENCY_AUTHORIZATION_REQUIRED`.
- Commit `8b5ae3299c3104ced805d7a0573ecba0ca645d3c`: after owner grants trusted assistant authorization, test trusted assistant GET directory returns HTTP 200, `is_owner=false`, includes expected synthetic merchant, and does not expose a nonempty owner-only assistants list.
- Source service `getEmergencyDirectoryPostgres` explicitly requires `activeAuthorization` for non-owner and conditionally includes assistants only when `input.isOwner`; these are **expected contracts from source**, not runtime outcomes.

## Runtime evidence
- PR-triggered isolated PostgreSQL workflow may run automatically, but it defaults to `priority`, not `emergency`. **Neither new assertion has been executed by a verified `emergency` suite run in this stage**.
- A workflow-dispatch run selecting `emergency` is still required. Capture job/run SHA, TAP leaf assertions and cleanup before granting PASS/FAIL.
- No browser proof for initial denied directory response or revocation transition.

## Counting
2 new source assertion scenarios; 0 executed/accepted cases. No new confirmed defects. Release BLOCKED; whole audit NOT_YET_MEASURABLE.
