-- P0: private administrative management data belongs to the trusted auth LOGIN.
ALTER TABLE public."merchant_admin_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "merchant_admin_notes_authentication_boundary" ON public."merchant_admin_notes";
--> statement-breakpoint
CREATE POLICY "merchant_admin_notes_authentication_boundary" ON public."merchant_admin_notes" AS PERMISSIVE FOR ALL TO public USING ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) WITH CHECK ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))));
--> statement-breakpoint
ALTER TABLE public."merchant_channel_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "merchant_channel_overrides_authentication_boundary" ON public."merchant_channel_overrides";
--> statement-breakpoint
CREATE POLICY "merchant_channel_overrides_authentication_boundary" ON public."merchant_channel_overrides" AS PERMISSIVE FOR ALL TO public USING ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) WITH CHECK ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))));
--> statement-breakpoint
ALTER TABLE public."merchant_deletion_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "merchant_deletion_requests_authentication_boundary" ON public."merchant_deletion_requests";
--> statement-breakpoint
CREATE POLICY "merchant_deletion_requests_authentication_boundary" ON public."merchant_deletion_requests" AS PERMISSIVE FOR ALL TO public USING ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole)))) WITH CHECK ((has_function_privilege(session_user, 'public.fawri_authentication_runtime()', 'EXECUTE') AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = session_user AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole))));
--> statement-breakpoint
