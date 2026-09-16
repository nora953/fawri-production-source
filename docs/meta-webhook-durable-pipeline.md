# Meta webhook durable processing contract

## Scope

This document defines the production-safety contract for inbound Meta Messenger events, automatic reply entitlement, retries, and dead-letter handling.

## External request path

1. Capture the exact raw request body.
2. Verify `X-Hub-Signature-256` with `META_APP_SECRET` using HMAC SHA-256 and constant-time comparison.
3. Reject production traffic with `503` when the application secret is not configured.
4. Filter event identifiers already present in the processed-event store.
5. Resolve the Meta page to a merchant.
6. Return `503` when page mapping or merchant state cannot be read reliably.
7. Permanently ignore events only when a known merchant is rejected, suspended, closed, or otherwise not operational.
8. Persist every reply-eligible event as a durable job using its stable Meta event identifier as the dedupe key.
9. Mark event identifiers processed only after every durable enqueue succeeds.
10. Return `200` immediately after durable persistence; do not call the AI engine or Meta Send API in the external request.

## Internal worker path

1. Claim one available job with a worker identifier and visibility timeout.
2. Recheck merchant operational status.
3. Recheck subscription status and reserve one reply by event identifier.
4. A repeated attempt reuses the consumed reservation and never decrements twice.
5. Run the existing Messenger processor through a loopback-only, process-secret authenticated replay.
6. Read the persisted conversation result using `external_message_id`.
7. Complete the job only when the matching Fawri reply is recorded as `sent`.

## Failure classification

| Condition | Classification | Action |
|---|---|---|
| Confirmed reply status `failed` | Retryable | Keep the reservation, remove only the failed conversation pair before the next attempt, apply exponential backoff |
| Merchant/subscription state storage unavailable | Retryable | No reply, no new reservation, retry later |
| Meta page or merchant becomes terminally unavailable | Non-retryable | Move to DLQ without a refund unless a consumed reservation exists from an earlier confirmed attempt |
| Internal HTTP transport fails but stored outcome is `sent` | Success | Complete from the stored result |
| Internal HTTP transport fails and stored outcome is `failed` | Retryable | Retry safely |
| Internal HTTP transport fails and no result exists | Uncertain | Move directly to DLQ; do not retry automatically and do not refund automatically |
| HTTP returns success but no stored reply outcome exists | Uncertain | Move directly to DLQ; do not risk a duplicate customer reply |
| Maximum confirmed failed attempts reached | Dead letter | Refund exactly one consumed reservation and remove the last failed conversation pair |

## Refund rule

Automatic refund is allowed only when delivery failure is confirmed as `META_REPLY_FAILED`.

An uncertain result may represent a reply that reached Meta but was not persisted locally. Refunding or retrying automatically in that state could give the merchant an extra reply or send duplicate customer messages. Those jobs require manual review.

Refund is idempotent because the consumed reservation is removed only after the merchant balance has been restored. A second refund attempt returns `reservation_not_found` and changes no balance.

## Transitional files

| File | Purpose | PostgreSQL destination |
|---|---|---|
| `processed-meta-events.json` | Event receive idempotency | `processed_channel_events` |
| `reply-reservations.json` | Per-event reply debit and resulting balance | `reply_ledger` |
| `background-jobs.json` | Queue, claims, retries, completion, DLQ | `background_jobs`, `job_attempts`, `job_dead_letters` |
| `fawri-runtime-db.json` | Conversation delivery result during transition | `conversations`, `messages` |

All transitional files use atomic replacement and restrictive permissions. They are not suitable as the final distributed source of truth; PostgreSQL ownership must replace them before horizontal scaling.

## Required configuration

- `META_APP_SECRET`: mandatory in production.
- `META_VERIFY_TOKEN`: required for webhook verification GET requests.
- `FAWRI_DATA_DIR`: persistent private data directory during the transition.
- `FAWRI_JOB_POLL_INTERVAL_MS`: optional worker poll interval; default 500 ms for Meta worker.
- `FAWRI_JOB_VISIBILITY_TIMEOUT_MS`: optional claim timeout; default 5 minutes.
- `FAWRI_DISABLE_JOB_WORKERS=1`: test and maintenance switch only. Production must not use it during normal operation.

## Operational checks

- Run the read-only job audit and investigate stale `processing` jobs.
- Review all `dead_letter` jobs before requeue.
- Never edit queue JSON by hand.
- Payload inspection requires a separate explicit authorization flag because payloads can contain customer messages.
- Requeue requires an explicit write authorization flag and a specific job ID.
- Preserve source files until PostgreSQL migration and reconciliation pass.
