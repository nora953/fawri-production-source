# SEQ-139 — Support overlapping refresh order (2026-10-13 Baghdad)

Continue after SEQ-138; no restart. The child-component browser harness now includes one deterministic overlapping-list-refresh case. Executed source before this documentation update: `6755f809874be38de93ba8da0f0f7beb916b334e`.

## Result

[Chrome run38318079531](https://github.com/nora953/fawri-production-source/actions/runs/38318079531), job115039529673, Chrome154: **12 PASS /1 FAIL /0 SKIP**,13 browser cases. The one failure remains the previously recorded `ADMIN-SUPPORT-STALE-001`: silent admin refresh503 leaves reply and resolve controls enabled with the old ticket visible. No app change and no actual write. Locked install, frontend build, profile/process and loopback cleanup succeeded.

The new admin overlap case schedules the first fixture response as `AUDIT_RACE_OLD` with a1200ms delay, while later list responses carry `AUDIT_RACE_NEW` and return in10ms. It observed `{old:false,newer:true,requests:3}` after waiting beyond the delayed response. **No out-of-order stale overwrite was reproduced in this case.** This is a bounded synthetic GET result; it does not prove database snapshot freshness, full application route/session behavior, or hosted API ordering. No new race finding is added.

The actual-source review confirms `AdminSupportTab` currently has no request-generation guard, while merchant `SupportPage` does. The negative synthetic run did not reproduce a user-visible race; retain as residual source/coverage question, not a confirmed defect.

## Carry-forward

SEQ-138 native component coverage, the browser harness’s explicit inability to certify click-to-form/trusted keyboard activation, and `ADMIN-SUPPORT-STALE-001` are detailed in [SEQ_138_SUPPORT_BROWSER_20261013.md](SEQ_138_SUPPORT_BROWSER_20261013.md). Earlier disposable SQL/HTTP Support tests separately prove server-side current permission denial403. Do not equate the UI stale state with an auth bypass.

**Next SEQ-140:** mounted actual parent AdminPage tab/content authorization under synthetic authorized and denied roles, then continue the untested owner/admin/merchant route inventory. Comprehensive audit still precedes any consolidated repair plan or application repair.
