-- Transaction-scoped tenant authority foundation. RLS cutover is a separate change.
-- No application LOGIN receives grants here. Provision an unreachable trusted
-- function owner with merchant SELECT and pg_read_all_stats before granting
-- issuer EXECUTE to the authentication LOGIN; never grant scope-table CRUD.
CREATE SCHEMA fawri_security;
REVOKE ALL ON SCHEMA fawri_security FROM PUBLIC;

CREATE TABLE fawri_security.transaction_scopes (
  runtime_login name NOT NULL,
  backend_pid integer NOT NULL CHECK (backend_pid > 0),
  transaction_id bigint NOT NULL CHECK (transaction_id > 0),
  merchant_id text NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(runtime_login,backend_pid,transaction_id),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '3 minutes')
);
CREATE INDEX transaction_scopes_expiry_idx ON fawri_security.transaction_scopes(expires_at);
REVOKE ALL ON fawri_security.transaction_scopes FROM PUBLIC;

CREATE FUNCTION fawri_security.issue_scope(
  p_runtime_login name,p_backend_pid integer,p_transaction_id bigint,p_merchant_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE
  v_now timestamptz;
  v_status text;
BEGIN
  IF NOT has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname=session_user
       AND r.rolcanlogin AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))
     OR EXISTS (SELECT 1 FROM pg_roles privileged
       WHERE (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolcreaterole)
         AND (pg_has_role(session_user,privileged.oid,'USAGE')
           OR pg_has_role(session_user,privileged.oid,'SET'))) THEN
    RAISE EXCEPTION 'tenant scope issuer is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_runtime_login IS NULL OR p_backend_pid IS NULL OR p_backend_pid <= 0
     OR p_transaction_id IS NULL OR p_transaction_id <= 0
     OR p_merchant_id IS NULL OR char_length(p_merchant_id) NOT BETWEEN 1 AND 200
     OR NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname=p_runtime_login
       AND r.rolcanlogin AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))
     OR has_function_privilege(p_runtime_login,'public.fawri_authentication_runtime()','EXECUTE') THEN
    RAISE EXCEPTION 'tenant scope target is unavailable' USING ERRCODE='42501';
  END IF;
  -- Refresh the statistics snapshot; authority never trusts a supplied actor GUC.
  PERFORM pg_stat_clear_snapshot();
  IF NOT EXISTS (SELECT 1 FROM pg_stat_activity a
       WHERE a.pid=p_backend_pid AND a.datname=current_database()
         AND a.usename=p_runtime_login AND a.backend_type='client backend'
         AND a.backend_xid::text=(p_transaction_id % 4294967296)::text)
     OR NOT EXISTS (SELECT 1 FROM public.merchants WHERE id=p_merchant_id) THEN
    RAISE EXCEPTION 'tenant scope target is unavailable' USING ERRCODE='42501';
  END IF;
  BEGIN
    v_status := pg_xact_status(p_transaction_id::text::xid8);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'tenant scope transaction is unavailable' USING ERRCODE='42501';
  END;
  IF v_status IS DISTINCT FROM 'in progress' THEN
    RAISE EXCEPTION 'tenant scope transaction is unavailable' USING ERRCODE='42501';
  END IF;
  -- Clean only expired, completed transactions. Never erase an in-progress
  -- tombstone: that would permit renewal/rebinding inside the same transaction.
  DELETE FROM fawri_security.transaction_scopes s
    WHERE (s.runtime_login,s.backend_pid,s.transaction_id) IN (
      SELECT old.runtime_login,old.backend_pid,old.transaction_id
        FROM fawri_security.transaction_scopes old
       WHERE old.expires_at < clock_timestamp()
         AND pg_xact_status(old.transaction_id::text::xid8) IS DISTINCT FROM 'in progress'
       ORDER BY old.expires_at LIMIT 64
    );
  v_now := clock_timestamp();
  INSERT INTO fawri_security.transaction_scopes
    (runtime_login,backend_pid,transaction_id,merchant_id,issued_at,expires_at)
    VALUES(p_runtime_login,p_backend_pid,p_transaction_id,p_merchant_id,v_now,v_now+interval '3 minutes')
    ON CONFLICT(runtime_login,backend_pid,transaction_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM fawri_security.transaction_scopes s
      WHERE s.runtime_login=p_runtime_login AND s.backend_pid=p_backend_pid
        AND s.transaction_id=p_transaction_id AND s.merchant_id=p_merchant_id
        AND s.issued_at<=clock_timestamp() AND s.expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'tenant scope cannot be rebound or renewed' USING ERRCODE='42501';
  END IF;
END
$body$;
REVOKE ALL ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) FROM PUBLIC;

CREATE FUNCTION fawri_security.allows_merchant(p_merchant_id text)
RETURNS boolean LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $body$
  SELECT current_setting('transaction_isolation')='read committed'
    AND EXISTS (SELECT 1 FROM fawri_security.transaction_scopes s
      WHERE s.runtime_login=session_user AND s.backend_pid=pg_backend_pid()
        AND s.transaction_id=txid_current() AND s.merchant_id=p_merchant_id
        AND s.issued_at<=clock_timestamp() AND s.expires_at>clock_timestamp())
$body$;
REVOKE ALL ON FUNCTION fawri_security.allows_merchant(text) FROM PUBLIC;
