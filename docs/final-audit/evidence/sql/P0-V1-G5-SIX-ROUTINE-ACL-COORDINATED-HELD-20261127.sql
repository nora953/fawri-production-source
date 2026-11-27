-- HELD SOURCE ONLY. DO NOT EXECUTE ON NEON OR PRODUCTION.
-- This is a new rollback-only disposable rehearsal candidate, not deployment
-- authorization. Derived from the accepted six-function matrix and the
-- 2026-11-27 production catalog preimage. Production execution must separately
-- pin the actual endpoint, traffic isolation, source/deploy/rollback, costs,
-- recovery checkpoint and owner approval. Test this exact guard locally first.
-- Default and only transaction ending here is ROLLBACK.
-- No user data, role creation, role membership, table, default ACL or history DDL.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';
SET LOCAL search_path = pg_catalog;

DO $g5$
DECLARE
  owner_oid oid;
  item record;
  fn record;
  phase integer;
  actual_acl text[];
  expected_acl text[];
  principal text;
  allowed text[];
  role_row record;
  count_public integer;
BEGIN
  IF current_database() <> 'fawri'
     OR current_setting('server_version_num')::integer / 10000 <> 18
     OR session_user <> 'fawri_owner' OR current_user <> session_user THEN
    RAISE EXCEPTION 'G5_IDENTITY_MISMATCH';
  END IF;
  SELECT oid INTO STRICT owner_oid FROM pg_roles
    WHERE rolname='fawri_owner' AND rolcanlogin AND NOT rolsuper;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fawri_v1_recurring_backup_reader') THEN
    RAISE EXCEPTION 'G5_READER_MUST_NOT_EXIST';
  END IF;
  FOREACH principal IN ARRAY ARRAY['fawri_restricted_runtime','fawri_auth_issuer',
    'fawri_operator_issuer','fawri_cashier_retirement_writer'] LOOP
    SELECT * INTO STRICT role_row FROM pg_roles WHERE rolname=principal;
    IF role_row.rolcanlogin IS DISTINCT FROM (principal <> 'fawri_cashier_retirement_writer')
      OR role_row.rolinherit OR role_row.rolsuper OR role_row.rolbypassrls
      OR role_row.rolcreaterole OR role_row.rolcreatedb OR role_row.rolreplication
      OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_row.oid) THEN
      RAISE EXCEPTION 'G5_ROLE_DRIFT';
    END IF;
  END LOOP;

  -- phase 0: verify all six BEFORE any modification.
  -- phase 1: modify exactly the proven five grant edges and six PUBLIC edges.
  -- phase 2: verify exact postimage and all effective permissions.
  FOR phase IN 0..2 LOOP
    FOR item IN SELECT * FROM (VALUES
      ('public.fawri_tenant_or_audited_admin(text)', 'a871b1d9a76f90af0bdabedfda6026458585a3efa21e4857f9694c104a808da0', 's', ARRAY['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer']::text[]),
      ('public.fawri_lock_cashier_approver(text,text)', 'c852a1ad439ef1d2e32189c9e378ef19ca603d42a60c538653544da5b69d50d9', 'v', ARRAY[]::text[]),
      ('public.fawri_lock_cashier_discount_approval(text,text,text)', '1e0cad527c4f2b1d971029b0d6a3c9a1a064743009d3a0f347ebb1f5f6fb951b', 'v', ARRAY[]::text[]),
      ('public.fawri_consume_cashier_discount_approval(text,text,text,text,text,bigint,text,timestamptz,bigint,text)', 'c93f40822b8d0f9c5a2f2b08804276e02252a675d10c1e79d60c6771fbe22bbc', 'v', ARRAY[]::text[]),
      ('public.fawri_lock_cashier_discount_setting(text)', '59df197ff8008b59b22435e4396d488e315303846bd3c2283508b0a6ac07d535', 'v', ARRAY['fawri_auth_issuer']::text[]),
      ('public.fawri_invalidate_pending_cashier_discount_approvals(text)', '8f8744e28952b47b06937f5603062ff5b7834ba330c76e9362457bcafa49ca9e', 'v', ARRAY['fawri_auth_issuer']::text[])
    ) AS e(signature,body_hash,volatility,named_grants) LOOP
      SELECT p.* INTO STRICT fn FROM pg_proc p WHERE p.oid=to_regprocedure(item.signature);
      IF fn.proowner<>owner_oid OR NOT fn.prosecdef OR NOT fn.proisstrict
        OR fn.provolatile::text<>item.volatility
        OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
        OR encode(sha256(convert_to(fn.prosrc,'UTF8')),'hex')<>item.body_hash THEN
        RAISE EXCEPTION 'G5_FUNCTION_DRIFT: %',item.signature;
      END IF;
      IF phase=1 THEN
        FOREACH principal IN ARRAY item.named_grants LOOP
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',item.signature,principal);
        END LOOP;
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',item.signature);
      ELSE
        allowed:=CASE WHEN phase=0 THEN ARRAY['PUBLIC','fawri_owner']
                      ELSE ARRAY['fawri_owner']||item.named_grants END;
        SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC'
          ELSE pg_get_userbyid(a.grantee)::text END ORDER BY a.grantee)
          INTO actual_acl FROM aclexplode(COALESCE(fn.proacl,acldefault('f',fn.proowner))) a;
        SELECT array_agg(name ORDER BY name) INTO expected_acl FROM unnest(allowed) AS x(name);
        SELECT array_agg(name ORDER BY name) INTO actual_acl FROM unnest(actual_acl) AS x(name);
        IF actual_acl IS DISTINCT FROM expected_acl OR
          EXISTS(SELECT 1 FROM aclexplode(COALESCE(fn.proacl,acldefault('f',fn.proowner))) a
                 WHERE a.grantor<>owner_oid OR a.privilege_type<>'EXECUTE' OR a.is_grantable) THEN
          RAISE EXCEPTION 'G5_ACL_DRIFT: %, phase %',item.signature,phase;
        END IF;
        FOREACH principal IN ARRAY ARRAY['fawri_owner','fawri_restricted_runtime',
          'fawri_auth_issuer','fawri_operator_issuer','fawri_cashier_retirement_writer'] LOOP
          IF has_function_privilege(principal::name,fn.oid,'EXECUTE') IS DISTINCT FROM
             (phase=0 OR principal=ANY(allowed)) THEN
            RAISE EXCEPTION 'G5_EFFECTIVE_ACL_DRIFT: %, phase %',item.signature,phase;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
    IF phase IN (0,2) THEN
      SELECT count(*) INTO count_public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prosecdef
       AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
                  WHERE a.grantee=0 AND a.privilege_type='EXECUTE');
      IF count_public IS DISTINCT FROM (CASE WHEN phase=0 THEN 6 ELSE 0 END) THEN
        RAISE EXCEPTION 'G5_PUBLIC_DEFINER_COUNT_DRIFT';
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'G5_EXACT_SIX_ROUTINE_ACL_CANDIDATE_VERIFIED_IN_TRANSACTION';
END;
$g5$;

-- Never change this ending to COMMIT in an unreviewed or unapproved run.
ROLLBACK;
