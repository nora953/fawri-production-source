-- P0 migration 0034 pre-activation identity collision preflight (READ ONLY).
-- Run on a disposable copy or with an approved read-only database connection.
-- Any returned row is a NO-GO for migration activation until reconciled.
-- Provider identity uniqueness is checked independently for each key type,
-- including collisions within one authority and across both authorities.
-- Empty-string references are included because trigger 0034 locks/checks them;
-- only SQL NULL means an absent identity.
WITH orders AS (
  SELECT 'saas'::text AS authority, id::text AS order_id,
         provider_checkout_ref AS payment_ref,
         metadata->>'provider_request_id' AS request_ref
  FROM public.saas_billing_orders WHERE provider='superqi_sandbox'
  UNION ALL
  SELECT 'cashier'::text, id::text,
         provider_checkout_ref,
         metadata->>'provider_request_id'
  FROM public.cashier_billing_orders WHERE provider='superqi_sandbox'
), identities AS (
  SELECT authority, order_id, 'payment'::text AS key_type, payment_ref AS key_value
  FROM orders WHERE payment_ref IS NOT NULL
  UNION ALL
  SELECT authority, order_id, 'request'::text, request_ref
  FROM orders WHERE request_ref IS NOT NULL
)
SELECT key_type, key_value, count(*)::integer AS order_count,
       array_agg(authority || ':' || order_id ORDER BY authority,order_id) AS owners
FROM identities
GROUP BY key_type,key_value
HAVING count(*) > 1
ORDER BY key_type,key_value;
