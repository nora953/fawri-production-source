CREATE TABLE "merchant_location_delivery_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"location_id" text NOT NULL,
	"delivery_area_rate_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_location_delivery_areas_timestamp_check" CHECK ("merchant_location_delivery_areas"."updated_at" >= "merchant_location_delivery_areas"."created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_location_delivery_areas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "merchant_location_delivery_areas" ADD CONSTRAINT "merchant_location_delivery_areas_merchant_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_location_delivery_areas" ADD CONSTRAINT "merchant_location_delivery_areas_location_merchant_fk" FOREIGN KEY ("location_id","merchant_id") REFERENCES "public"."merchant_locations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_delivery_area_rates" ADD CONSTRAINT "merchant_delivery_area_rates_id_merchant_unique" UNIQUE("id","merchant_id");--> statement-breakpoint
ALTER TABLE "merchant_location_delivery_areas" ADD CONSTRAINT "merchant_location_delivery_areas_area_merchant_fk" FOREIGN KEY ("delivery_area_rate_id","merchant_id") REFERENCES "public"."merchant_delivery_area_rates"("id","merchant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_location_delivery_areas_merchant_location_area_unique" ON "merchant_location_delivery_areas" USING btree ("merchant_id","location_id","delivery_area_rate_id");--> statement-breakpoint
CREATE INDEX "merchant_location_delivery_areas_merchant_area_idx" ON "merchant_location_delivery_areas" USING btree ("merchant_id","delivery_area_rate_id");--> statement-breakpoint
CREATE INDEX "merchant_location_delivery_areas_merchant_location_idx" ON "merchant_location_delivery_areas" USING btree ("merchant_id","location_id");--> statement-breakpoint
CREATE POLICY "merchant_location_delivery_areas_tenant_boundary" ON "merchant_location_delivery_areas" AS PERMISSIVE FOR ALL TO public USING ((
    "merchant_location_delivery_areas"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_location_delivery_areas"."merchant_id")
    )
  )) WITH CHECK ((
    "merchant_location_delivery_areas"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = "merchant_location_delivery_areas"."merchant_id")
    )
  ));