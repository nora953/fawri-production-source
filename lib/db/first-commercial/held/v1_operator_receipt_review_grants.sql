-- FAWRI first commercial V1, P0-ACCESS-HOSTED-IDENTITY:
-- HELD post-0053 operator capability-only grants. NO production execution.
-- Pinned new candidate only: crimson-cherry-65705041 /
-- br-holy-waterfall-b993zglb / DB fawri. SQL does not attest provider IDs.
-- Not owner-approved for Neon, provider API, production writes or deployment.
--
-- Functions come from OPERATOR_DATABASE_CAPABILITIES in
-- artifacts/api-server/src/services/operatorDirectoryPostgresAuthority.ts.
-- These are the ONLY authorized functions: directory audit and the reviewed
-- receipt review/replay/manual dispute entrypoints; no direct financial table
-- grants, no PUBLIC EXECUTE, no role membership/owner privileges.
-- Real provider receipt reconciliation, manual approvals/dual review and
-- approved HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH remain separate gates.
-- Requires independently approved and source-pinned complete 0052/0053,
-- external recovery, actual independent operator LOGIN, secret store,
-- function owner/security-definer review, exact-target SQL+HTTP.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';

DO $v1_operator_preimage$
DECLARE op oid; signature text;
BEGIN
  IF current_database()<>'fawri'
    OR current_setting('server_version_num')::integer/10000<>18
    OR session_user<>'fawri_owner'
    OR session_user<>current_user
    OR to_regclass('drizzle.__drizzle_migrations') IS NULL
  THEN RAISE EXCEPTION 'V1_OPERATOR_PREIMAGE_WRONG_TARGET'; END IF;
  SELECT oid INTO op FROM pg_catalog.pg_roles
    WHERE rolname='fawri_operator_issuer' AND rolcanlogin
      AND NOT (rolsuper OR rolbypassrls OR rolcreaterole
        OR rolcreatedb OR rolreplication OR rolinherit);
  IF op IS NULL OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=op)
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relowner=op AND n.nspname='public' AND c.relkind IN ('r','p')
    )
  THEN RAISE EXCEPTION 'V1_OPERATOR_LOGIN_UNSAFE'; END IF;
  FOR signature IN SELECT name FROM (
    VALUES
      ('public.fawri_issue_admin_directory_audit(text,text,text)'),
      ('public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)'),
      ('public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)'),
      ('public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)'),
      ('public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text)'),
      ('public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text)'),
      ('public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text)'),
      ('public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text)'),
      ('public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text)')
  ) AS allowed(name) LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'V1_OPERATOR_REQUIRED_FUNCTION_MISSING';
    END IF;
  END LOOP;
  IF to_regprocedure('public.fawri_authentication_runtime()') IS NULL
     OR to_regprocedure('fawri_security.issue_scope(name,integer,bigint,text)') IS NULL
  THEN RAISE EXCEPTION 'V1_OPERATOR_TRUST_BOUNDARY_NOT_READY'; END IF;
END;
$v1_operator_preimage$;

-- SQL function defaults may grant EXECUTE to PUBLIC: never leave that
-- authority in a commercial installation or masked via role membership.
REVOKE ALL ON FUNCTION
  public.fawri_issue_admin_directory_audit(text,text,text),
  public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text),
  public.fawri_review_verified_payment_receipt(text,text,text,text,text,text),
  public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text),
  public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text),
  public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text),
  public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text),
  public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text),
  public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text)
FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO fawri_operator_issuer;
GRANT EXECUTE ON FUNCTION
  public.fawri_issue_admin_directory_audit(text,text,text),
  public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text),
  public.fawri_review_verified_payment_receipt(text,text,text,text,text,text),
  public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text),
  public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text),
  public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text),
  public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text),
  public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text),
  public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text)
TO fawri_operator_issuer;

DO $v1_operator_postimage$
DECLARE op oid; name text;
BEGIN
  SELECT oid INTO op FROM pg_catalog.pg_roles
    WHERE rolname='fawri_operator_issuer' AND rolcanlogin
      AND NOT (rolsuper OR rolbypassrls OR rolcreaterole
        OR rolcreatedb OR rolreplication OR rolinherit);
  IF op IS NULL OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=op)
    OR has_schema_privilege(op,'public','CREATE')
    OR has_schema_privilege(op,'fawri_security','USAGE')
    OR has_function_privilege(op,'public.fawri_authentication_runtime()','EXECUTE')
    OR has_function_privilege(op,
        'fawri_security.issue_scope(name,integer,bigint,text)','EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relowner=op AND n.nspname='public' AND c.relkind IN ('r','p')
    )
  THEN RAISE EXCEPTION 'V1_OPERATOR_POSTIMAGE_PRIVILEGED'; END IF;
  FOR name IN SELECT signature FROM (
    VALUES
      ('public.fawri_issue_admin_directory_audit(text,text,text)'),
      ('public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)'),
      ('public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)'),
      ('public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)'),
      ('public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text)'),
      ('public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text)'),
      ('public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text)'),
      ('public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text)'),
      ('public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text)')
  ) AS funcs(signature) LOOP
    IF NOT has_function_privilege(op,name,'EXECUTE')
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p,
            LATERAL aclexplode(COALESCE(p.proacl,
                acldefault('f',p.proowner))) acl
        WHERE p.oid=to_regprocedure(name)
          AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
      )
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles other
        WHERE other.rolname IN (
            'fawri_auth_issuer','fawri_restricted_runtime')
          AND has_function_privilege(other.oid,name,'EXECUTE')
      )
    THEN RAISE EXCEPTION 'V1_OPERATOR_FUNCTION_ACL_UNSAFE'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname IN (
        'accounts','auth_otp_challenges','account_sessions',
        'notifications','order_drafts','orders','order_items',
        'verified_provider_payment_receipts','saas_billing_orders',
        'saas_billing_refunds','cashier_device_streams')
      AND (
        has_table_privilege(op,c.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
        OR has_any_column_privilege(op,c.oid,
            'SELECT,INSERT,UPDATE,REFERENCES')
      )
  ) THEN RAISE EXCEPTION 'V1_OPERATOR_DIRECT_DATA_PRIVILEGE_UNSAFE'; END IF;
END;
$v1_operator_postimage$;
COMMIT;
