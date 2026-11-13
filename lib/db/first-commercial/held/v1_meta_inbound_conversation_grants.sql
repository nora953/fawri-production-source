-- FAWRI V1 first merchant: online Meta inbound -> conversation -> reply
-- HELD, NOT APPROVED FOR NEW NEON OR HOSTED EXECUTION.
-- Separate owner write consent, independent DB+media recovery and exact
-- reviewed provider project/branch/DB remain prerequisites.
-- Target: crimson-cherry-65705041 / br-holy-waterfall-b993zglb / fawri PG18
-- SQL itself cannot independently attest Neon provider identity.
--
-- Derived from postgresMetaAutoReplyIntent, postgresManualConversationAuthority,
-- postgresMetaWebhookReplyTransport and production tenant RLS inventory.
-- Minimal tenant operations:
-- inbound events SELECT/INSERT;
-- conversations SELECT/INSERT/UPDATE;
-- messages SELECT/INSERT/UPDATE plus restricted queued-unsent reply DELETE;
-- manual reply requests SELECT/INSERT/UPDATE;
-- outbound deliveries SELECT/INSERT/UPDATE;
-- reply ledger + subscriptions READ ONLY for reply affordability;
-- no direct replies' financial receipt/refund/order entitlement DML,
-- no cashier/POS access, no unscoped job or credential token access.
-- This is a SOURCE PARTIAL GRANT. It does not independently prove Meta
-- webhook signatures, 24-hour send windows, billing reservation atomicity,
-- order/payment reconciliation, provider delivery or hosted HTTP.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';

DO $v1_meta_reply_preimage$
DECLARE t text;
BEGIN
  IF current_database()<>'fawri'
    OR current_setting('server_version_num')::integer/10000<>18
    OR session_user<>'fawri_owner' OR current_user<>session_user
    OR to_regclass('drizzle.__drizzle_migrations') IS NULL
    OR to_regprocedure('fawri_security.allows_merchant(text)') IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_roles r
      WHERE r.rolname='fawri_restricted_runtime' AND r.rolcanlogin
        AND NOT(r.rolinherit OR r.rolsuper OR r.rolbypassrls
          OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
        AND NOT EXISTS(
          SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid))
  THEN RAISE EXCEPTION 'V1_META_REPLY_PREIMAGE_NOT_ACCEPTED'; END IF;

  FOREACH t IN ARRAY ARRAY[
    'channel_inbound_events','conversations','messages',
    'manual_reply_requests','outbound_deliveries','reply_ledger',
    'subscriptions','subscription_reply_batches'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t
        AND c.relkind IN ('r','p') AND c.relrowsecurity
        AND c.relowner=(SELECT oid FROM pg_roles
          WHERE rolname='fawri_owner')
        AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid))
    THEN RAISE EXCEPTION 'V1_META_REPLY_TABLE_MISSING_RLS_OR_OWNER'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_policy
    WHERE polname='v1_meta_queued_unsent_reply_delete_only'
      AND polrelid='public.messages'::regclass)
  THEN RAISE EXCEPTION 'V1_META_REPLY_DELETE_POLICY_ALREADY_PRESENT'; END IF;
END;
$v1_meta_reply_preimage$;

GRANT SELECT,INSERT ON public.channel_inbound_events
  TO fawri_restricted_runtime;
GRANT SELECT,INSERT,UPDATE ON
  public.conversations,public.manual_reply_requests,
  public.outbound_deliveries
TO fawri_restricted_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.messages
  TO fawri_restricted_runtime;
-- This additional restrictive policy combines with the existing general
-- tenant boundary. Ordinary tenant role cannot delete customer messages,
-- sent merchant replies or any message already externally delivered.
CREATE POLICY v1_meta_queued_unsent_reply_delete_only
  ON public.messages AS RESTRICTIVE FOR DELETE
  TO fawri_restricted_runtime
  USING(
    public.fawri_tenant_or_audited_admin(merchant_id)
    AND sender='fawri'
    AND status='queued'
    AND external_message_id IS NULL
  );

-- Reply accounting is separately authorized: read-only evidence needed by
-- Meta send-intent decisions, never update payment or settlement artifacts.
GRANT SELECT ON public.reply_ledger,public.subscriptions
  TO fawri_restricted_runtime;


-- The first-merchant subscription GET must remain read-only. Grant only
-- the nine actual snapshot columns on batches, never table-wide SELECT
-- or INSERT/UPDATE/DELETE of paid reply credit and expiry bookkeeping.
GRANT SELECT (
  id,subscription_id,merchant_id,source,amount,remaining,
  purchased_at,expires_at,expiry_reminder_sent_at
) ON public.subscription_reply_batches TO fawri_restricted_runtime;

DO $v1_meta_reply_postimage$
DECLARE r oid; rel text; req text;
BEGIN
  SELECT oid INTO r FROM pg_roles
  WHERE rolname='fawri_restricted_runtime' AND rolcanlogin
    AND NOT(rolinherit OR rolsuper OR rolbypassrls
      OR rolcreaterole OR rolcreatedb OR rolreplication);
  IF r IS NULL
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r)
    OR NOT EXISTS(
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid='public.messages'::regclass
        AND p.polname='v1_meta_queued_unsent_reply_delete_only'
        AND p.polcmd='d' AND NOT p.polpermissive
        AND pg_get_expr(p.polqual,p.polrelid)
          LIKE '%external_message_id IS NULL%')
    OR has_table_privilege(r,'public.reply_ledger',
       'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.subscriptions',
       'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.subscription_reply_batches',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_column_privilege(r,'public.subscription_reply_batches',
       'created_at','SELECT')
    OR has_table_privilege(r,'public.verified_provider_payment_receipts',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.saas_billing_refunds',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_table_privilege(r,'public.cashier_device_streams',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
  THEN RAISE EXCEPTION 'V1_META_REPLY_POSTIMAGE_UNSAFE'; END IF;
  -- A list of privileges inside has_table_privilege means ANY, not ALL.
  FOR rel,req IN SELECT table_name, privilege FROM (
    VALUES
      ('channel_inbound_events','SELECT'),
      ('channel_inbound_events','INSERT'),
      ('conversations','SELECT'),('conversations','INSERT'),
      ('conversations','UPDATE'),
      ('messages','SELECT'),('messages','INSERT'),('messages','UPDATE'),
      ('messages','DELETE'),
      ('manual_reply_requests','SELECT'),
      ('manual_reply_requests','INSERT'),('manual_reply_requests','UPDATE'),
      ('outbound_deliveries','SELECT'),
      ('outbound_deliveries','INSERT'),('outbound_deliveries','UPDATE'),
      ('reply_ledger','SELECT'),('subscriptions','SELECT')
  ) AS required(table_name,privilege) LOOP
    IF NOT has_table_privilege(r,'public.'||rel,req)
    THEN RAISE EXCEPTION 'V1_META_REPLY_REQUIRED_DML_MISSING'; END IF;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('id'),('subscription_id'),('merchant_id'),('source'),
      ('amount'),('remaining'),('purchased_at'),('expires_at'),
      ('expiry_reminder_sent_at')
    ) AS expected(column_name)
    WHERE NOT has_column_privilege(r,'public.subscription_reply_batches',
      expected.column_name,'SELECT')
  ) THEN RAISE EXCEPTION 'V1_META_SUBSCRIPTION_SNAPSHOT_READ_MISSING'; END IF;
  FOR rel IN SELECT table_name FROM (
    VALUES('channel_inbound_events'),('conversations'),
      ('manual_reply_requests'),('outbound_deliveries')
  ) AS tables(table_name) LOOP
    IF has_table_privilege(r,'public.'||rel,
       'DELETE,TRUNCATE,TRIGGER,REFERENCES')
    THEN RAISE EXCEPTION 'V1_META_REPLY_UNSAFE_DELETE_OR_NONROW_PRIVILEGE'; END IF;
  END LOOP;
  IF has_table_privilege(r,'public.messages',
      'TRUNCATE,TRIGGER,REFERENCES')
  THEN RAISE EXCEPTION 'V1_META_REPLY_UNSAFE_NONROW_MESSAGE_PRIVILEGE'; END IF;
END;
$v1_meta_reply_postimage$;
COMMIT;
