ALTER TABLE "cashier_operation_attribution" ADD COLUMN "location_id" text;
--> statement-breakpoint
UPDATE "cashier_operation_attribution" AS attribution
SET "location_id" = station."location_id"
FROM "merchant_cashier_stations" AS station
WHERE station."merchant_id" = attribution."merchant_id"
  AND station."id" = attribution."station_id"
  AND attribution."location_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "cashier_operation_attribution"
ALTER COLUMN "location_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cashier_operation_attribution"
ADD CONSTRAINT "cashier_operation_attribution_location_merchant_fk"
FOREIGN KEY ("location_id","merchant_id")
REFERENCES "public"."merchant_locations"("id","merchant_id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cashier_operation_attribution_location_occurred_idx"
ON "cashier_operation_attribution" USING btree ("merchant_id","location_id","occurred_at");
--> statement-breakpoint
CREATE TABLE "location_inventory_mutations" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "location_id" text NOT NULL,
  "product_id" text NOT NULL,
  "variant_id" text,
  "mutation_type" text NOT NULL,
  "before_on_hand_quantity" integer NOT NULL,
  "after_on_hand_quantity" integer NOT NULL,
  "before_reserved_quantity" integer NOT NULL,
  "after_reserved_quantity" integer NOT NULL,
  "expected_version" integer NOT NULL,
  "resulting_version" integer NOT NULL,
  "actor_type" text NOT NULL,
  "actor_account_id" text,
  "operation_id" text,
  "reason_code" text NOT NULL,
  "idempotency_key_hash" text NOT NULL,
  "request_hash" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "location_inventory_mutations_type_check" CHECK ("mutation_type" IN ('set','adjust')),
  CONSTRAINT "location_inventory_mutations_quantity_check" CHECK ("before_on_hand_quantity" >= 0 AND "after_on_hand_quantity" >= 0 AND "before_reserved_quantity" >= 0 AND "after_reserved_quantity" >= 0 AND "before_reserved_quantity" <= "before_on_hand_quantity" AND "after_reserved_quantity" <= "after_on_hand_quantity"),
  CONSTRAINT "location_inventory_mutations_version_check" CHECK ("expected_version" > 0 AND "resulting_version" = "expected_version" + 1),
  CONSTRAINT "location_inventory_mutations_actor_type_check" CHECK ("actor_type" IN ('cashier_operator','merchant','system')),
  CONSTRAINT "location_inventory_mutations_hash_check" CHECK (char_length("idempotency_key_hash") BETWEEN 32 AND 128 AND char_length("request_hash") BETWEEN 32 AND 128),
  CONSTRAINT "location_inventory_mutations_operation_check" CHECK ("operation_id" IS NULL OR char_length("operation_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "location_inventory_mutations"
ADD CONSTRAINT "location_inventory_mutations_merchant_id_merchants_id_fk"
FOREIGN KEY ("merchant_id")
REFERENCES "public"."merchants"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_mutations"
ADD CONSTRAINT "location_inventory_mutations_location_merchant_fk"
FOREIGN KEY ("location_id","merchant_id")
REFERENCES "public"."merchant_locations"("id","merchant_id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_mutations"
ADD CONSTRAINT "location_inventory_mutations_product_merchant_fk"
FOREIGN KEY ("product_id","merchant_id")
REFERENCES "public"."products"("id","merchant_id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_mutations"
ADD CONSTRAINT "location_inventory_mutations_variant_product_merchant_fk"
FOREIGN KEY ("variant_id","product_id","merchant_id")
REFERENCES "public"."product_variants"("id","product_id","merchant_id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_inventory_mutations"
ADD CONSTRAINT "location_inventory_mutations_actor_account_id_accounts_id_fk"
FOREIGN KEY ("actor_account_id")
REFERENCES "public"."accounts"("id")
ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "location_inventory_mutations_merchant_idempotency_unique"
ON "location_inventory_mutations" USING btree ("merchant_id","idempotency_key_hash");
--> statement-breakpoint
CREATE INDEX "location_inventory_mutations_location_product_occurred_idx"
ON "location_inventory_mutations" USING btree ("merchant_id","location_id","product_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "location_inventory_mutations_operation_idx"
ON "location_inventory_mutations" USING btree ("merchant_id","operation_id");
--> statement-breakpoint
ALTER TABLE "location_inventory_mutations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "location_inventory_mutations_tenant_boundary"
ON "location_inventory_mutations"
AS PERMISSIVE FOR ALL TO public
USING ((
  "location_inventory_mutations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (
        admin_audit.merchant_id IS NULL
        OR admin_audit.merchant_id = "location_inventory_mutations"."merchant_id"
      )
  )
))
WITH CHECK ((
  "location_inventory_mutations"."merchant_id" = nullif(current_setting('fawri.tenant_id', true), '')
  OR EXISTS (
    SELECT 1 FROM database_admin_access_audits AS admin_audit
    WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
      AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
      AND admin_audit.started_at <= clock_timestamp()
      AND admin_audit.expires_at > clock_timestamp()
      AND (
        admin_audit.merchant_id IS NULL
        OR admin_audit.merchant_id = "location_inventory_mutations"."merchant_id"
      )
  )
));
