-- Refuse inconsistent notice ancestry before changing privacy policies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.emergency_merchant_notices n JOIN public.emergency_access_requests r ON r.id=n.request_id WHERE n.merchant_id<>r.merchant_id)
  THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Emergency notice relationship preflight failed';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE public."emergency_authorizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "emergency_authorizations_authentication_boundary" ON public."emergency_authorizations" AS PERMISSIVE FOR ALL TO public USING ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) WITH CHECK ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))));
--> statement-breakpoint
ALTER TABLE public."emergency_access_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "emergency_access_requests_authentication_boundary" ON public."emergency_access_requests" AS PERMISSIVE FOR ALL TO public USING ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) WITH CHECK ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))));
--> statement-breakpoint
ALTER TABLE public."emergency_owner_alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "emergency_owner_alerts_authentication_boundary" ON public."emergency_owner_alerts" AS PERMISSIVE FOR ALL TO public USING ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) WITH CHECK ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))));
--> statement-breakpoint
ALTER TABLE public."emergency_merchant_notices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "emergency_merchant_notices_authentication_boundary" ON public."emergency_merchant_notices" AS PERMISSIVE FOR ALL TO public USING ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) WITH CHECK ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))) AND EXISTS (SELECT 1 FROM public.emergency_access_requests AS parent WHERE parent.id = "emergency_merchant_notices"."request_id" AND parent.merchant_id = "emergency_merchant_notices"."merchant_id"));
