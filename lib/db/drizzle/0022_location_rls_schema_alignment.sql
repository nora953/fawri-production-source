ALTER TABLE "merchant_locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "merchant_locations_tenant_boundary" ON "merchant_locations";
--> statement-breakpoint
CREATE POLICY "merchant_locations_tenant_boundary" ON "merchant_locations" AS PERMISSIVE FOR ALL TO public USING ((
  "merchant_locations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_locations"."merchant_id")
  )
)) WITH CHECK ((
  "merchant_locations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_locations"."merchant_id")
  )
));
--> statement-breakpoint
ALTER TABLE "location_inventory_levels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "location_inventory_levels_tenant_boundary" ON "location_inventory_levels";
--> statement-breakpoint
CREATE POLICY "location_inventory_levels_tenant_boundary" ON "location_inventory_levels" AS PERMISSIVE FOR ALL TO public USING ((
  "location_inventory_levels"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "location_inventory_levels"."merchant_id")
  )
)) WITH CHECK ((
  "location_inventory_levels"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "location_inventory_levels"."merchant_id")
  )
));
