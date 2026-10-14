# SEQ-138 — Support component browser audit (2026-10-13 Baghdad)

Continue from saved6b762715/SEQ137; no restart. Final executed browser source is the audit branch PR #520 head immediately before this documentation checkpoint: `2af179d9e186ae12ae0a85e67ed9b951959a2404`.

## Result

[Chrome run38317602367](https://github.com/nora953/fawri-production-source/actions/runs/38317602367), job115038173842, Node24/Chrome154: **11 PASS /1 FAIL /0 SKIP**,12 cases; installation/build and browser/server/profile cleanup succeeded. Final marker contains all12 results. Earlier attempts were harness-debug runs only (loading observation timing and headless CDP keyboard synthesis); they add no independent coverage. No application source/schema change.

Actual merchant `SupportPage`, admin `AdminSupportTab`, React/I18nProvider/Radix and built Vite CSS were mounted against a loopback synthetic GET API. The suite verified:

- Arabic and Kurdish render RTL; English LTR at390px with no horizontal overflow. Hostile message text creates no active `img` or `script`; merchant reply and new-ticket button are enabled after confirmed authority; the new-ticket control is a native focusable button.
- Merchant initial loading, empty state, first-request503/unavailable state and actual retry recovery. After a confirmed ticket, failed silent refresh retains the ticket, disables merchant mutations, and later successful refresh restores them.
- Admin initial503/retry and empty state; owner has no reply/inspection action, assistant has reply but no inspection request, inspection-prop assistant exposes request dialog and Escape closes it.
- One intentional negative assertion failed: after admin silent refresh503, previous ticket remains visible while reply and resolve controls are both enabled. The fetch catch only sets `loadError` for nonsilent requests, and the component has no stale-authority guard unlike merchant Support.

**Finding `ADMIN-SUPPORT-STALE-001` — MEDIUM / OPEN / UI reliability.** Stale admin support actions remain enabled after refresh failure; this can invite actions based on outdated support data or present avoidable errors. The suite used synthetic GET responses and performed no write. This does not establish authorization bypass, disclosure, or mutation: actual SQL/HTTP coverage already proved the server rejects Support list/image/reply with403 after current `manage_support` is removed, even using the old cookie, then allows access again after restoration. Keep UI consistency separate from server authorization.

## Limits and next scope

This mounts the child components, not the full admin parent route/tab/session flow. Role props are supplied by the harness; parent `canManageSupport` condition is source-reviewed, while actual session/grant enforcement is evidenced separately by SQL/HTTP. No full visual review, browser-authenticated backend, actual write, accessibility sign-off, physical device, hosted grants, backend accounting or external provider was exercised. Headless CDP did not provide reliable click-to-form or trusted keyboard activation; report those as **unverified**, not pass or app failure. No consolidated repair plan or application repair.

Reuse prior source SQL/HTTP result run38288686551 at144PASS/24FAIL/0SKIP; this browser result is separate and does not change its counters. Planning stays about54% audited/46% remaining (40–60% uncertainty); dashboard/language evidence is bounded and route inventory remains incomplete.

**Next SEQ-139:** actual parent AdminPage permission/tab gate and Support overlapping-refresh behavior, followed by remaining owner/admin/merchant route groups. Preserve completed SQL, media, report and print proofs; no merge/deploy/live DB/secrets/real payment.
