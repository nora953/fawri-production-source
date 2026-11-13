ALTER TABLE public."merchant_cashier_staff" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "merchant_cashier_staff_tenant_boundary" ON public."merchant_cashier_staff" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("merchant_cashier_staff"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("merchant_cashier_staff"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."merchant_cashier_staff_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "merchant_cashier_staff_permissions_tenant_boundary" ON public."merchant_cashier_staff_permissions" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("merchant_cashier_staff_permissions"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("merchant_cashier_staff_permissions"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."merchant_cashier_stations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "merchant_cashier_stations_tenant_boundary" ON public."merchant_cashier_stations" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("merchant_cashier_stations"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("merchant_cashier_stations"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."cashier_station_pairing_challenges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cashier_station_pairing_challenges_tenant_boundary" ON public."cashier_station_pairing_challenges" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("cashier_station_pairing_challenges"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_station_pairing_challenges"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."cashier_station_credentials" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cashier_station_credentials_tenant_boundary" ON public."cashier_station_credentials" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("cashier_station_credentials"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_station_credentials"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."cashier_shifts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cashier_shifts_tenant_boundary" ON public."cashier_shifts" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("cashier_shifts"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_shifts"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."cashier_operator_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cashier_operator_sessions_tenant_boundary" ON public."cashier_operator_sessions" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("cashier_operator_sessions"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_operator_sessions"."merchant_id"));
