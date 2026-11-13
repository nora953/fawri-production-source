ALTER TABLE public."merchant_cashier_discount_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "merchant_cashier_discount_settings_tenant_boundary" ON public."merchant_cashier_discount_settings" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("merchant_cashier_discount_settings"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("merchant_cashier_discount_settings"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."merchant_cashier_staff_discount_policies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "merchant_cashier_staff_discount_policies_tenant_boundary" ON public."merchant_cashier_staff_discount_policies" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("merchant_cashier_staff_discount_policies"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("merchant_cashier_staff_discount_policies"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."merchant_cashier_discount_override_approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "merchant_cashier_discount_override_approvals_tenant_boundary" ON public."merchant_cashier_discount_override_approvals" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("merchant_cashier_discount_override_approvals"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("merchant_cashier_discount_override_approvals"."merchant_id"));
--> statement-breakpoint
ALTER TABLE public."cashier_operation_attribution" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cashier_operation_attribution_tenant_boundary" ON public."cashier_operation_attribution" AS PERMISSIVE FOR ALL TO public USING (public.fawri_tenant_or_audited_admin("cashier_operation_attribution"."merchant_id")) WITH CHECK (public.fawri_tenant_or_audited_admin("cashier_operation_attribution"."merchant_id"));
