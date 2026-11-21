-- FAWRI P0 / FIELD002. Reproducible read-only historical notification audit.
-- Executed on Fawri-Staging/staging-runtime (PostgreSQL 18), 2026-11-04.
-- DO NOT export raw rows, IDs, merchant data, variables, or notification content.
-- This is a static approximation of frontend validator and SQL projection
-- requirements, NOT execution of the actual app, JS Date parser or HTTP endpoint.
-- Negative/positive tenant access needs separate scoped runtime proof.
-- Current source comparator:
-- artifacts/fawri/src/lib/merchantNotificationsAuthority.ts
-- artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts
-- Linked inspection verification follows live request rows without using stale JSON status.
WITH assessed AS (
  SELECT n.type,
    jsonb_typeof(n.variables) = 'object' AS valid_object,
    (CASE
    WHEN n.type = 'subscription_balance_purchase' THEN (
      (jsonb_typeof(n.variables->'purchased_replies') = 'number' AND pg_input_is_valid(n.variables->>'purchased_replies', 'double precision'))
      AND (jsonb_typeof(n.variables->'emergency_debt_paid') = 'number' AND pg_input_is_valid(n.variables->>'emergency_debt_paid', 'double precision'))
      AND (jsonb_typeof(n.variables->'addon_replies_added') = 'number' AND pg_input_is_valid(n.variables->>'addon_replies_added', 'double precision'))
      AND (jsonb_typeof(n.variables->'emergency_debt_remaining') = 'number' AND pg_input_is_valid(n.variables->>'emergency_debt_remaining', 'double precision'))
      AND (jsonb_typeof(n.variables->'base_replies_remaining') = 'number' AND pg_input_is_valid(n.variables->>'base_replies_remaining', 'double precision'))
      AND (jsonb_typeof(n.variables->'emergency_replies_remaining') = 'number' AND pg_input_is_valid(n.variables->>'emergency_replies_remaining', 'double precision'))
      AND (jsonb_typeof(n.variables->'addon_replies_remaining') = 'number' AND pg_input_is_valid(n.variables->>'addon_replies_remaining', 'double precision'))
      AND (jsonb_typeof(n.variables->'total_replies_available') = 'number' AND pg_input_is_valid(n.variables->>'total_replies_available', 'double precision'))
      AND (NOT (n.variables ? 'addon_batch_id') OR (jsonb_typeof(n.variables->'addon_batch_id') = 'string'))
      AND (NOT (n.variables ? 'addon_batch_expires_at') OR ((jsonb_typeof(n.variables->'addon_batch_expires_at') = 'string' AND nullif(btrim(n.variables->>'addon_batch_expires_at'), '') IS NOT NULL) AND pg_input_is_valid(n.variables->>'addon_batch_expires_at', 'timestamp with time zone')))
    )
    WHEN n.type = 'subscription_plan_event' THEN (
      (jsonb_typeof(n.variables->'operation') = 'string' AND n.variables->>'operation' IN ('activate', 'change', 'renew'))
      AND (jsonb_typeof(n.variables->'plan_name') = 'string' AND n.variables->>'plan_name' IN ('silver', 'gold', 'diamond', 'trial'))
      AND (NOT (n.variables ? 'previous_plan_name') OR (jsonb_typeof(n.variables->'previous_plan_name') = 'string' AND n.variables->>'previous_plan_name' IN ('silver', 'gold', 'diamond', 'trial')))
      AND ((jsonb_typeof(n.variables->'start_date') = 'string' AND nullif(btrim(n.variables->>'start_date'), '') IS NOT NULL) AND pg_input_is_valid(n.variables->>'start_date', 'timestamp with time zone'))
      AND ((jsonb_typeof(n.variables->'expires_at') = 'string' AND nullif(btrim(n.variables->>'expires_at'), '') IS NOT NULL) AND pg_input_is_valid(n.variables->>'expires_at', 'timestamp with time zone'))
      AND (jsonb_typeof(n.variables->'emergency_debt_paid') = 'number' AND pg_input_is_valid(n.variables->>'emergency_debt_paid', 'double precision'))
      AND (jsonb_typeof(n.variables->'emergency_debt_remaining') = 'number' AND pg_input_is_valid(n.variables->>'emergency_debt_remaining', 'double precision'))
      AND (jsonb_typeof(n.variables->'base_replies_remaining') = 'number' AND pg_input_is_valid(n.variables->>'base_replies_remaining', 'double precision'))
      AND (jsonb_typeof(n.variables->'addon_replies_remaining') = 'number' AND pg_input_is_valid(n.variables->>'addon_replies_remaining', 'double precision'))
      AND (jsonb_typeof(n.variables->'total_replies_available') = 'number' AND pg_input_is_valid(n.variables->>'total_replies_available', 'double precision'))
    )
    WHEN n.type = 'subscription_emergency_activated' THEN (
      (jsonb_typeof(n.variables->'addon_batch_id') = 'string' AND nullif(btrim(n.variables->>'addon_batch_id'), '') IS NOT NULL)
      AND (jsonb_typeof(n.variables->'emergency_replies_added') = 'number' AND pg_input_is_valid(n.variables->>'emergency_replies_added', 'double precision'))
      AND (jsonb_typeof(n.variables->'emergency_debt') = 'number' AND pg_input_is_valid(n.variables->>'emergency_debt', 'double precision'))
      AND ((jsonb_typeof(n.variables->'expires_at') = 'string' AND nullif(btrim(n.variables->>'expires_at'), '') IS NOT NULL) AND pg_input_is_valid(n.variables->>'expires_at', 'timestamp with time zone'))
    )
    WHEN n.type = 'subscription_expired' THEN (
      (jsonb_typeof(n.variables->'plan_name') = 'string' AND n.variables->>'plan_name' IN ('silver', 'gold', 'diamond', 'trial'))
      AND ((jsonb_typeof(n.variables->'expired_at') = 'string' AND nullif(btrim(n.variables->>'expired_at'), '') IS NOT NULL) AND pg_input_is_valid(n.variables->>'expired_at', 'timestamp with time zone'))
      AND (jsonb_typeof(n.variables->'addon_replies_remaining') = 'number' AND pg_input_is_valid(n.variables->>'addon_replies_remaining', 'double precision'))
    )
    WHEN n.type = 'subscription_expiry_reminder' THEN (
      (jsonb_typeof(n.variables->'plan_name') = 'string' AND n.variables->>'plan_name' IN ('silver', 'gold', 'diamond', 'trial'))
      AND ((jsonb_typeof(n.variables->'expires_at') = 'string' AND nullif(btrim(n.variables->>'expires_at'), '') IS NOT NULL) AND pg_input_is_valid(n.variables->>'expires_at', 'timestamp with time zone'))
      AND (jsonb_typeof(n.variables->'days_remaining') = 'number' AND pg_input_is_valid(n.variables->>'days_remaining', 'double precision'))
    )
    WHEN n.type = 'support_reply_reminder' THEN (
      (jsonb_typeof(n.variables->'ticket_id') = 'string' AND nullif(btrim(n.variables->>'ticket_id'), '') IS NOT NULL)
      AND (jsonb_typeof(n.variables->'ticket_subject') = 'string' AND nullif(btrim(n.variables->>'ticket_subject'), '') IS NOT NULL)
      AND ((jsonb_typeof(n.variables->'action_url') = 'string' AND nullif(btrim(n.variables->>'action_url'), '') IS NOT NULL) AND left(n.variables->>'action_url', 1) = '/' AND left(n.variables->>'action_url', 2) <> '//' AND position(chr(92) in (n.variables->>'action_url')) = 0)
    )
    WHEN n.type = 'inspection_session_request' THEN (
      (jsonb_typeof(n.variables->'ticket_id') = 'string' AND nullif(btrim(n.variables->>'ticket_id'), '') IS NOT NULL)
      AND (jsonb_typeof(n.variables->'inspection_request_id') = 'string' AND nullif(btrim(n.variables->>'inspection_request_id'), '') IS NOT NULL)
      AND (jsonb_typeof(n.variables->'ticket_subject') = 'string' AND nullif(btrim(n.variables->>'ticket_subject'), '') IS NOT NULL)
      AND (jsonb_typeof(n.variables->'admin_name') = 'string' AND nullif(btrim(n.variables->>'admin_name'), '') IS NOT NULL)
      AND (jsonb_typeof(n.variables->'mode') = 'string' AND n.variables->>'mode' IN ('live_observation', 'independent_read_only'))
      AND ((jsonb_typeof(n.variables->'request_expires_at') = 'string' AND nullif(btrim(n.variables->>'request_expires_at'), '') IS NOT NULL) AND pg_input_is_valid(n.variables->>'request_expires_at', 'timestamp with time zone'))
      AND ((jsonb_typeof(n.variables->'action_url') = 'string' AND nullif(btrim(n.variables->>'action_url'), '') IS NOT NULL) AND left(n.variables->>'action_url', 1) = '/' AND left(n.variables->>'action_url', 2) <> '//' AND position(chr(92) in (n.variables->>'action_url')) = 0)
      AND n.source_entity_type = 'support_inspection_request'
      AND i.id IS NOT NULL
      AND i.merchant_id = n.merchant_id
      AND i.id = n.source_entity_id
      AND i.id = n.variables->>'inspection_request_id'
      AND i.ticket_id = n.variables->>'ticket_id'
      AND i.status::text IN ('pending', 'approved', 'rejected', 'expired')
      AND (i.consent_decision IS NULL OR i.consent_decision::text IN ('approved', 'rejected'))
      AND (i.end_reason IS NULL OR i.end_reason IN ('request_timeout', 'approval_window_expired', 'ticket_resolved', 'ticket_closed', 'merchant_terminated'))
    )
      ELSE false
    END) IS TRUE AS valid_type,
    (n.id IS NOT NULL AND btrim(n.id) <> '' AND n.created_at IS NOT NULL)
      AS valid_common
  FROM public.notifications n
  LEFT JOIN public.support_inspection_requests i
    ON n.type = 'inspection_session_request' AND i.id = n.source_entity_id
)
SELECT type,
  count(*)::int AS rows_total,
  count(*) FILTER (WHERE valid_object AND valid_type AND valid_common)::int
    AS rows_passed_static_frontend_conditions,
  count(*) FILTER (WHERE NOT (valid_object AND valid_type AND valid_common))::int
    AS rows_failed_static_conditions
FROM assessed
GROUP BY type
ORDER BY type;
