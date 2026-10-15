CREATE TABLE "cashier_operation_attribution" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "operation_id" text NOT NULL,
  "sale_id" text NOT NULL,
  "operation_kind" text NOT NULL,
  "station_id" text NOT NULL,
  "staff_id" text NOT NULL,
  "shift_id" text NOT NULL,
  "device_id" text NOT NULL,
  "station_credential_id" text NOT NULL,
  "operator_session_id" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_operation_attribution_merchant_operation_unique" UNIQUE("merchant_id", "operation_id"),
  CONSTRAINT "cashier_operation_attribution_kind_check" CHECK ("operation_kind" IN ('sale', 'return', 'void')),
  CONSTRAINT "cashier_operation_attribution_identity_check" CHECK (char_length("operation_id") BETWEEN 1 AND 200 AND char_length("sale_id") BETWEEN 1 AND 200 AND char_length("device_id") BETWEEN 1 AND 200 AND char_length("station_credential_id") BETWEEN 1 AND 200 AND char_length("operator_session_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "cashier_operation_attribution" ADD CONSTRAINT "cashier_operation_attribution_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_operation_attribution" ADD CONSTRAINT "cashier_operation_attribution_shift_identity_fk" FOREIGN KEY ("shift_id","merchant_id","station_id","staff_id") REFERENCES "public"."cashier_shifts"("id","merchant_id","station_id","staff_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cashier_operation_attribution_staff_occurred_idx" ON "cashier_operation_attribution" USING btree ("merchant_id", "staff_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "cashier_operation_attribution_station_occurred_idx" ON "cashier_operation_attribution" USING btree ("merchant_id", "station_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "cashier_operation_attribution_sale_idx" ON "cashier_operation_attribution" USING btree ("merchant_id", "sale_id", "occurred_at");
