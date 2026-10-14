## Verified Meta durable job identity admission — 2026-10-15 Baghdad

Draft PR #547 accepted source `f76f4db29811864cd885aa4fb0eafd5577e490e2`; isolated run `38652116750`, job `116153247325`, merge checkout `71db6931587456b44938ec43135c3b6f84a55b05`: **269 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parent tests and repeated runtime invocations; overlapping workflow counts are not added. The new identity suite contributes 6 passing tests including its parent.

The original signed app, encrypted queue and live worker under a restricted nonowner role accept the valid second-tenant channel control. Conflicting payload merchant, conflicting event, and missing explicit event all dead-letter with `META_JOB_PAYLOAD_INVALID` before changing any of nine exact domain snapshots or increasing provider calls beyond the positive control's one call. Naked tenant reads and pooled context reset pass. The service admission check precedes `ensureInboundState`; the existing inbound-event collision fixture now uses a consistent canonical queue identity and retains its collision assertion.

The baseline event mismatch completed, and missing event wrote inbound/conversation/message/notification state before late rejection. Merchant mismatch was already protected by a composite foreign key (`23503`); no foreign-domain writes or RLS/FK bypass were demonstrated. Earlier failures, including the corrected fixture-reference mistake, remain documented in `P0_META_JOB_IDENTITY_20261015.md` and machine evidence `evidence/P0_META_JOB_IDENTITY_RESULTS_20261015.json`.

Full restore passed with 33 migrations, 95 tables, 45 policies, 8 functions and fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`; owned container/volume cleanup succeeded. TypeScript, syntax and diff checks passed. Graph and embedding are synthetic local providers. No schema/RLS/grant change, hosted rollout, merge or deployment is included. #535 remains open for hosted owner/RLS/runtime capability review. Further audit candidates include canonical webhook-body identity and broader precommit process termination; those are not closed by this checkpoint.

# Meta durable job identity admission — 2026-10-15 Baghdad

The worker now validates the explicit payload event and merchant against the canonical durable queue identity before `ensureInboundState` can write domain state. A missing payload merchant may use the trusted row merchant; a conflicting merchant, conflicting event, or missing explicit event returns `META_JOB_PAYLOAD_INVALID`. No schema, RLS policy, or runtime grants change.

## Baseline findings

Source `8a1a21f1e0ed870515f6314c2e46ac24091d725d`, Meta pipeline run `38650806561`, job `116148828716`: the new identity suite had 2 PASS / 4 FAIL, including its parent test. The valid signed second-tenant channel control passed.

- Merchant mismatch reached a composite foreign-key rejection (`23503`). The constraint protected the boundary; no foreign-domain writes or RLS bypass were demonstrated.
- Event mismatch wrongly completed instead of rejecting at admission.
- Missing explicit event eventually rejected but first persisted one inbound event, one conversation, two messages, and one notification.

These are internal encrypted-job integrity and late-write defects. The test does not demonstrate an external attacker reaching the encrypted queue.

## Repair and compatibility fixture

Repair source `69c2f5872abeea4da1c890c404aec06577a47e09`, Meta pipeline run `38651564164`, job `116151337815`: all three malformed cases dead-lettered with the expected code, no changes to any of nine domain tables, and provider calls remained 1 (the valid signed positive control). The gated identity proof passed.

The larger suite still failed its existing inbound-event collision case because that fixture deliberately used a different queue dedupe key. The new admission guard correctly rejected it earlier. Source `5b7e62096ad0ece0567e9948a8bd4cd97e28919a` changes that preparation-level fixture to reuse the first canonical job identity with a changed message payload, preserving the separate persisted-event collision assertion. The actual encrypted worker rejection cases remain intact. That fixture commit also accidentally changed the earlier image-collision reference to an undefined variable: run `38651851696`, job `116152281346`, reported `changedJob is not defined`. Source `f76f4db29811864cd885aa4fb0eafd5577e490e2` restores the original image reference. The final fixture diff is confined to the canonical inbound-event collision case. TypeScript and diff checks pass locally; full corrected CI acceptance is recorded above.

## Evidence scope

The new integration suite runs the original signed application, encrypted queue and live worker under a restricted nonowner role, with two valid merchant channels. Exact row counts and SHA256 snapshots cover merchant channels/settings, conversations, messages, inbound events, outbound deliveries, notifications, subscriptions and reply ledger. Queue/dead-letter audit state may change as intended. Final proof emits only after the positive control and all three denials pass. Naked tenant reads and pooled context reset are checked.

Graph and embedding providers are local synthetic services. This is targeted admission coverage, not hosted runtime-grant rollout, arbitrary process-crash coverage, or production provider acceptance. PR #547 remains draft; #535 tracks hosted owner/RLS/runtime capability review.
