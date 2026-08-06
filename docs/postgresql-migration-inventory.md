# Fawri PostgreSQL migration inventory

This document is the migration contract for replacing local JSON files, in-memory maps, and browser-only operational state with PostgreSQL.

## Rules

1. PostgreSQL becomes the only writable source of truth.
2. Existing identifiers are preserved during migration whenever possible.
3. Migration scripts must be idempotent and must not silently overwrite conflicting records.
4. Every imported record must retain its original timestamps when available.
5. JSON files remain read-only during the verification window, then are retired after reconciliation.
6. Browser LocalStorage must not remain authoritative for operational data.

## Current server-side sources

| Source | Current responsibility | PostgreSQL destination |
|---|---|---|
| Merchant auth JSON | merchants, admins, OTP/account lifecycle, admin logs, subscriptions and notifications | merchants, admin_profiles, admin_permissions, merchant_sessions, admin_sessions, subscriptions, subscription_reply_batches, notifications, audit_events |
| `fawri-runtime-db.json` | products, conversations, messages, Meta page connections, orders, order drafts | products, product_variants, conversations, messages, channel_connections, orders, order_items, order_drafts |
| Saved answers JSON | merchant saved answers | saved_answers |
| Bot training JSON | training requests | training_requests |
| Learned answers JSON | learned answers | learned_answers |
| Admin work monitor JSON | trusted devices, tracked sessions, failed logins | admin_devices, admin_sessions, admin_login_attempts |
| Support JSON | tickets, messages, assignments and notifications | support_tickets, support_messages, support_assignments, notifications |
| Support preview JSON | temporary merchant-approved read-only sessions | support_preview_sessions |
| Emergency access JSON | authorizations, requests, owner alerts, merchant notices and audit chain | emergency_authorizations, emergency_access_requests, notifications, audit_events |
| Support image directory | private support attachments | object storage plus support_attachments metadata |

## Current browser-only sources that must be removed as authorities

- Conversation takeover state and manual replies.
- Order status and payment review decisions.
- Delivery, payment, reply-language and auto-reply settings.
- Any product fallback writes performed when the API fails.

These records must be written through authenticated APIs and persisted in PostgreSQL. LocalStorage may only be used for harmless UI preferences such as selected language or theme.

## Migration phases

1. Identity, access and subscription foundation.
2. Catalog and merchant settings.
3. Conversations, messages and idempotent inbound events.
4. Orders and payment workflow.
5. Channels and encrypted provider credentials.
6. Knowledge, saved answers and training.
7. Support, emergency access, notifications and audit events.
8. Reconciliation, read-only legacy window and final JSON retirement.

## Reconciliation requirements

For every migrated entity, compare:

- record count by merchant;
- stable identifier set;
- latest and earliest timestamp;
- monetary and reply-balance totals;
- orphan references;
- duplicate external message IDs;
- active sessions and active temporary-access windows.

A migration phase is not complete until its reconciliation report passes.