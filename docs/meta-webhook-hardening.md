# Meta webhook and durable messaging hardening

## Security boundary

`POST /api/meta/webhook` is accepted only when the HMAC SHA-256 signature in
`X-Hub-Signature-256` matches the exact raw request bytes. Verification fails
closed when `META_APP_SECRET` or the raw body is unavailable. Trusted loopback
replay uses the existing internal replay authentication and does not emulate a
public Meta request.

The shared `app.ts` already captures the raw body before JSON parsing. That
ordering must remain:

1. raw-body capture during `express.json` verification;
2. signature and event-id verification;
3. page-to-merchant and merchant-state enforcement;
4. manual-takeover filtering;
5. durable enqueue;
6. HTTP 200 only after every accepted or terminal event has a durable record.

Unknown pages, unreadable channel directories, and unreadable merchant state
return a retryable HTTP 503. They are never acknowledged and discarded.

## Idempotency layers

The delivery path has independent idempotency keys:

- Meta event ID or a SHA-256 fallback generated from the page and event;
- durable job `(type, dedupe_key)`;
- reply entitlement reservation keyed by the Meta event ID;
- persisted delivery outcome keyed by merchant and external message ID;
- refund job keyed by the original Meta event ID;
- refund ledger state on the reply reservation.

A duplicate webhook can therefore be acknowledged without a duplicate job,
reply, entitlement charge, or refund.

## Queue semantics

`durableJobQueue.ts` provides:

- atomic file replacement and an ownership-token lock;
- priority ordering;
- exponential retry backoff;
- worker claims with `lease_expires_at`;
- periodic heartbeats;
- explicit crash reconciliation before new work is claimed;
- dead-letter state with `safe` or `blocked` requeue policy;
- payload-free administrative summaries.

An expired reply claim is not replayed blindly. The worker first inspects the
persisted message outcome:

- confirmed `sent` completes the job;
- confirmed `failed` retries, then enters DLQ at the attempt limit; the original
  reply job is blocked from manual replay once a refund job is scheduled;
- missing/uncertain outcome enters a blocked DLQ to prevent a duplicate send.

Channel disconnect is idempotent and may safely retry after an expired claim.
Non-reply/terminal event jobs are reconciled as completed.

## Entitlement and refund rules

Reply reservations are serialized by a cross-process lock and are written
before the aggregate reply balance is changed. Each new reservation records the
exact debit source and balance after debit. A consumed reservation is returned
as a duplicate without charging again.

Only `META_REPLY_FAILED`, a confirmed safe delivery failure, can schedule a
refund. Refunds are separate high-priority durable jobs. The reservation moves
through `pending` to `refunded` and records the failure code and timestamp.
Repeated execution returns `already_refunded` and never adds a second credit.
The original failed reply job is then blocked from requeue so a refunded reply
cannot be sent later without a new entitlement decision. A balance conflict is
non-retryable and blocked for manual reconciliation.

## Logging and inspection

The new channel and messaging paths do not log access tokens, authorization
headers, webhook payloads, or customer message text. Stored error messages are
truncated and redact common credential fields. DLQ inspection returns identity,
status, attempts, timestamps, error code, and requeue policy only. Payload and
result bodies are excluded by default.

## Verification

Tests use temporary local data directories, loopback requests, and injected fake
Meta transports. No test contacts a real Meta endpoint or uses a real merchant
credential.
