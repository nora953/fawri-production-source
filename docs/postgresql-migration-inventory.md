# Fawri PostgreSQL migration inventory

This document is the migration contract for replacing local JSON files, in-memory maps, and browser-only operational state with PostgreSQL.

## Rules

1. PostgreSQL becomes the only writable source of truth.
2. Existing identifiers are preserved during migration whenever possible.
3. Migration scripts must be idempotent and must not silently overwrite conflicting records.
4. Every imported record must retain its original timestamps when available.
5. JSON files remain read-only during the verification window, then are retired after reconciliation.
6. Browser LocalStorage must not remain authoritative for operational data.
7. Every transitional runtime file introduced during hardening must be inventoried, audited, and assigned a PostgreSQL destination before it is used in production.

## Current server-side sources

| Source | Current responsibility | PostgreSQL destination |
|---|---|---|
| Merchant auth JSON | merchants, admins, OTP/account lifecycle, admin logs, subscriptions and notifications | accounts, merchants, admin_profiles, admin_permissions, account_sessions, subscriptions, subscription_reply_batches, notifications, audit_events |
| Legacy `bot-runtime.json` | older flat products, conversations, channels, orders and drafts | products, conversations, messages, merchant_channels, orders, order_items, order_drafts |
| Active `fawri-runtime-db.json` | map-based products, conversations, messages, Meta page connections, orders and order drafts | products, product_variants, conversations, messages, merchant_channels, orders, order_items, order_drafts |
| `processed-meta-events.json` | transitional Meta webhook idempotency identifiers and receive timestamps | processed_channel_events |
| `reply-reservations.json` | transitional per-event reply debit reservations and resulting balances | reply_ledger |
| `background-jobs.json` | transitional durable jobs, retries, worker claims, completion state and dead letters | background_jobs, job_attempts, job_dead_letters |
| Saved answers JSON | merchant saved answers | saved_answers |
| Bot training JSON | training requests | training_requests |
| Learned answers JSON | learned answers | learned_answers |
| Admin work monitor JSON | trusted devices, tracked sessions and failed logins | trusted_devices, account_sessions, login_attempts |
| Support JSON | tickets, messages, assignments and notifications | support_tickets, support_messages, notifications |
| Support preview JSON | temporary merchant-approved read-only sessions | support_preview_sessions |
| Emergency access JSON | authorizations, requests, owner alerts, merchant notices and audit chain | emergency_authorizations, emergency_access_requests, emergency_owner_alerts, emergency_merchant_notices, audit_events |
| Support image directory | private support attachments | object storage plus support_attachments metadata |

## Transitional file safety requirements

- `processed-meta-events.json` stores identifiers and timestamps only; it must not contain message text or access tokens.
- `reply-reservations.json` must use a unique external event identifier, reference the owning merchant and subscription, and fail closed while a reservation is incomplete.
- `background-jobs.json` must use atomic replacement, a cross-process lock, dedupe keys, visibility timeouts, bounded retries and explicit dead-letter state.
- Transitional files must use restrictive file permissions and must never be committed to Git.
- A failed migration or reconciliation must leave all transitional files authoritative until PostgreSQL ownership is explicitly enabled.

## Current browser-only sources that must be removed as authorities

- Conversation takeover state and manual replies.
- Order status and payment review decisions.
- Delivery, payment, reply-language and auto-reply settings.
- Any product fallback writes performed when the API fails.

These records must be written through authenticated APIs and persisted in PostgreSQL. LocalStorage may only be used for harmless UI preferences such as selected language or theme.

## Migration phases

1. Identity, access and subscription foundation.
2. Catalog and merchant settings.
3. Conversations, messages, webhook signatures and idempotent inbound events.
4. Durable jobs, retry attempts and dead-letter reconciliation.
5. Orders and payment workflow.
6. Channels and encrypted provider credentials.
7. Knowledge, saved answers and training.
8. Support, emergency access, notifications and audit events.
9. Reconciliation, read-only legacy window and final JSON retirement.

## Reconciliation requirements

For every migrated entity, compare:

- record count by merchant;
- stable identifier set;
- latest and earliest timestamp;
- monetary and reply-balance totals;
- orphan references;
- duplicate external message and event IDs;
- queued, processing, retry and dead-letter job totals;
- stale worker claims and incomplete reply reservations;
- active sessions and active temporary-access windows.

A migration phase is not complete until its reconciliation report passes.
