-- FT-01 HELD: restricted cashier retirement grants for FIRST-COMMERCIAL review ONLY.
-- Not a migration and NOT approved for hosted execution by this file.
GRANT USAGE ON SCHEMA public TO fawri_auth_issuer, fawri_restricted_runtime;
GRANT USAGE ON SCHEMA fawri_security TO fawri_auth_issuer, fawri_restricted_runtime;
GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO fawri_auth_issuer, fawri_restricted_runtime;
GRANT SELECT, UPDATE(retention_status, status) ON public.merchants TO fawri_auth_issuer, fawri_restricted_runtime;
GRANT SELECT ON public.cashier_device_streams TO fawri_auth_issuer, fawri_restricted_runtime;
GRANT UPDATE(state, device_id, version) ON public.cashier_device_streams TO fawri_auth_issuer;
GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO fawri_auth_issuer;
GRANT fawri_cashier_retirement_writer TO fawri_auth_issuer WITH SET FALSE, INHERIT TRUE;
