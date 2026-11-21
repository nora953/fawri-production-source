# P0 payment SQL identity and concurrency review — 2026-10-18

Source reviewed: `lib/db/drizzle/0029_verified_provider_payment_receipts.sql` and `lib/db/drizzle/0033_confirmed_provider_order_resolution.sql` at audit branch.

0029 receipt admission: requires bounded non-null IDs, recognized event types, positive amount, lowercase SHA-256-shaped payload hash and finite timestamp; uses `(provider,provider_event_id)` primary key; `INSERT ... ON CONFLICT DO NOTHING` followed by `SELECT ... FOR UPDATE`; rejects mismatched replay identity with SQLSTATE 23505; returns original first_received_at. It assumes the caller has already authenticated the provider callback and checked the gateway state: the SQL function alone cannot authenticate it.

0033 confirmed-order resolver: first matches the admitted receipt's provider event ID and all supplied identity fields; mismatch SQLSTATE 23514; advisory transaction lock keyed to payment_ref; searches both SaaS bot subscription and cashier subscription orders; rejects multiple candidates, cross-authority collision, mismatched request/payment references, and mismatched amount; row locks selected order before return. No match returns no row, not guessed merchant ownership.

Review caveats requiring tests: check callback signature and provider-state verification occur before admission; test collisions under concurrent transactions and distinct event IDs with same payment reference; test orders with metadata/request mismatch and cross-authority collision; confirm advisory lock scope and explicit function grants to a non-BYPASSRLS login; confirm function owner and RLS isolation on isolated Neon clone after migrations. Source-level inspection is not a substitute for integration or hosted acceptance.

No schema, roles, secrets, deployment, or production data changed. P0 NO-GO.
