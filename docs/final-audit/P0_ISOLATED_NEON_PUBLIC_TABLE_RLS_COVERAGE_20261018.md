# P0 — Isolated Neon public table RLS coverage and restricted role grants (2026-10-18)

## Evidence
Read-only PostgreSQL catalog queries on project `round-fire-18493605`, isolated branch `br-snowy-voice-b1bovtwi`, database `neondb`.

- Ordinary/partitioned tables in `public`: **94**.
- Tables with `relrowsecurity=true`: **45**.
- Tables with `relrowsecurity=false`: **49**.
- Non-RLS tables on which `fawri_staging_rls_runtime` has SELECT, INSERT, UPDATE and DELETE: **49 of 49**.
- This is **catalog privilege evidence only**. It does not establish an exploitable application endpoint or imply that every global/system table should enable RLS.

## Non-RLS tables (49)
`account_sessions`, `accounts`, `admin_permissions`, `admin_profiles`, `audit_events`, `auth_audit_events`, `auth_otp_challenges`, `cashier_operation_attribution`, `cashier_operator_sessions`, `cashier_shifts`, `cashier_station_credentials`, `cashier_station_pairing_challenges`, `database_admin_access_audits`, `emergency_access_requests`, `emergency_authorizations`, `emergency_merchant_notices`, `emergency_owner_alerts`, `job_attempts`, `job_dead_letters`, `login_attempts`, `manual_reply_requests`, `merchant_admin_notes`, `merchant_cashier_discount_override_approvals`, `merchant_cashier_discount_settings`, `merchant_cashier_staff`, `merchant_cashier_staff_discount_policies`, `merchant_cashier_staff_permissions`, `merchant_cashier_stations`, `merchant_channel_overrides`, `merchant_deletion_requests`, `merchants`, `migration_reconciliation_results`, `migration_runs`, `migration_source_files`, `migration_source_records`, `notifications`, `order_drafts`, `order_items`, `processed_channel_events`, `provider_cost_audit_events`, `provider_cost_observations`, `provider_cost_rates`, `provider_cost_settings`, `support_attachments`, `support_inspection_requests`, `support_messages`, `support_preview_sessions`, `support_tickets`, `trusted_devices`.

## Follow-up
1. Classify all 49 by tenant data, global auth/admin state, worker-only state, and shared reference data; identify actual app connection roles and access paths.
2. Prioritize `admin_profiles`, `admin_permissions`, `database_admin_access_audits`, session/credential tables and cashier staff permissions for least-privilege review.
3. Plan restricted-role GRANT/REVOKE and/or policy changes per table with legitimate flow inventory, migration/rollback and controlled isolated acceptance.
4. Test effective identity and tenant isolation using a real restricted session and synthetic fixtures, including GUC spoofing and pooled-connection leakage.
5. No blind blanket RLS enablement or privilege revocation; this could disrupt authentication, administrative bootstrap, worker or cashier flows.

## Gate
**P0 NO-GO** pending verified runtime acceptance and remediation. No database mutations or deployments performed.
