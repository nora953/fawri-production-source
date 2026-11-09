/**
 * FT-01 / commercial-launch BLOCKER 0052 — disposable-only SECURITY INVOKER
 * retirement candidate (role-targeted RLS). DO NOT write into canonical lib/db/drizzle/0052.
 *
 * Source-only design study: the canonical migration is pinned and unchanged;
 * testing an alternative on a fresh local PG18 non-superuser database proves
 * feasibility but NEVER grants hosted migration or release authority.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const EXPECTED_CANONICAL_0052_SHA256 =
  'aaf7ee97fbdef0c1b4600e905216117ee8ff89f31ccd67d783ab61a9c4bd9b8e';
const MARKER = '-- Lifecycle bridge with dedicated non-login, column-limited owner below.';

// IMPORTANT: authorization occurs BEFORE visibility-based early return:
// a SECURITY INVOKER can see zero rows under RLS, which must never allow
// an untrusted merchant deletion to silently bypass retirement.
const HELD_INVOCATION_PATH = String.raw`
-- FT-01 HELD SECURITY INVOKER DESIGN, ONLY inside disposable local migration clone.
-- The authenticated deletion LOGIN must inherit the reviewed fawri_auth_issuer
-- NOLOGIN group via INHERIT TRUE/SET FALSE, and receive explicit SELECT plus
-- UPDATE(state,device_id,version) column grants in a separate reviewed grant
-- plan; this migration gives NO application LOGIN privileges by itself.
CREATE FUNCTION public.fawri_sequence_merchant_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP <> 'UPDATE' OR TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'merchants'
 OR NEW.retention_status IS DISTINCT FROM 'deleted' OR NEW.id IS DISTINCT FROM OLD.id
 OR NOT has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')
 -- An auth marker by itself must NEVER permit a deleted merchant with live
 -- streams when the authenticated LOGIN loses its role-targeted RLS group.
 OR NOT pg_has_role(session_user,'fawri_auth_issuer','USAGE')
 OR pg_has_role(session_user,'fawri_auth_issuer','SET')
 OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user
   AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR
       r.rolcreaterole OR r.rolcreatedb OR r.rolreplication))
 THEN RAISE EXCEPTION 'trusted deletion authority required' USING ERRCODE='42501'; END IF;
 IF NEW.status<>'suspended' THEN
  RAISE EXCEPTION 'deleted merchant must be suspended' USING ERRCODE='23514';
 END IF;
 -- No early return before authorization, even when RLS hides stream rows.
 UPDATE public.cashier_device_streams
 SET state='retired',device_id=NULL,version=version+1
 WHERE merchant_id=NEW.id AND state<>'retired';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fawri_sequence_merchant_deleted() FROM PUBLIC;
CREATE TRIGGER cashier_device_streams_merchant_deleted
AFTER UPDATE OF retention_status ON public.merchants
FOR EACH ROW WHEN (NEW.retention_status='deleted' AND OLD.retention_status IS DISTINCT FROM NEW.retention_status)
EXECUTE FUNCTION public.fawri_sequence_merchant_deleted();
-- The issuer capability alone does not bypass RLS, and no live pool gets
-- CREATE/DELETE/INSERT or checkpoint mutation from this candidate.
CREATE POLICY cashier_device_streams_auth_deleted_read
 ON public.cashier_device_streams FOR SELECT TO fawri_auth_issuer
 USING (
   has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')
   AND EXISTS(SELECT 1 FROM public.merchants m
     WHERE m.id=merchant_id AND m.retention_status='deleted')
 );
CREATE POLICY cashier_device_streams_auth_deleted_retirement
 ON public.cashier_device_streams FOR UPDATE TO fawri_auth_issuer
 USING (
   state<>'retired'
   AND has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')
   AND EXISTS(SELECT 1 FROM public.merchants m
     WHERE m.id=merchant_id AND m.retention_status='deleted')
 )
 WITH CHECK (
   state='retired' AND device_id IS NULL
   AND has_function_privilege(session_user,'public.fawri_authentication_runtime()','EXECUTE')
   AND EXISTS(SELECT 1 FROM public.merchants m
     WHERE m.id=merchant_id AND m.retention_status='deleted')
 );
`;


export const INVOKER_MERCHANT_DELETION_BODY = (() => {
  const match = HELD_INVOCATION_PATH.match(
    /CREATE FUNCTION public\.fawri_sequence_merchant_deleted\(\) RETURNS trigger\s+LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS \$\$([\s\S]*?)\$\$;/,
  );
  assert.ok(match?.[1], 'FT01_HELD_INVOCATION_FUNCTION_BODY_MISSING');
  return match[1];
})();
export const INVOKER_MERCHANT_DELETION_SHA256 = createHash('sha256')
  .update(INVOKER_MERCHANT_DELETION_BODY).digest('hex');

export function disposableInvokerVariant(original) {
  assert.equal(typeof original,'string');
  assert.equal(createHash('sha256').update(original).digest('hex'),
    EXPECTED_CANONICAL_0052_SHA256,'FT01_CANONICAL_0052_CHANGED');
  assert.equal(original.split(MARKER).length,2,'FT01_UNIQUE_RETIREMENT_ANCHOR');
  const variant=original.slice(0, original.indexOf(MARKER)) + HELD_INVOCATION_PATH;
  assert.doesNotMatch(variant, /ALTER FUNCTION public\.fawri_sequence_merchant_deleted\(\) OWNER TO/);
  assert.doesNotMatch(variant, /CREATE ROLE fawri_cashier_retirement_owner/);
  assert.match(variant, /SECURITY INVOKER/);
  return variant;
}
