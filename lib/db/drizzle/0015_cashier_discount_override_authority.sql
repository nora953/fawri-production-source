ALTER TABLE "merchant_cashier_staff_permissions" DROP CONSTRAINT "merchant_cashier_staff_permissions_permission_check";
--> statement-breakpoint
ALTER TABLE "merchant_cashier_staff_permissions" ADD CONSTRAINT "merchant_cashier_staff_permissions_permission_check" CHECK ("permission" IN ('sale.create','sale.view_own','sale.view_all','sale.return','sale.void','sale.discount','sale.discount_override','inventory.adjust','reports.sales','reports.profit','catalog.cost','shifts.manage','staff.manage','stations.manage'));
--> statement-breakpoint

CREATE TABLE "merchant_cashier_staff_discount_policies" (
  "merchant_id" text NOT NULL,
  "staff_id" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "max_percentage_bps" integer DEFAULT 0 NOT NULL,
  "max_amount_minor" bigint,
  "can_approve_override" boolean DEFAULT false NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_cashier_staff_discount_policies_pk" PRIMARY KEY("merchant_id","staff_id"),
  CONSTRAINT "cashier_discount_percentage_range" CHECK ("max_percentage_bps" >= 0 AND "max_percentage_bps" <= 10000),
  CONSTRAINT "cashier_discount_amount_nonnegative" CHECK ("max_amount_minor" IS NULL OR "max_amount_minor" >= 0),
  CONSTRAINT "cashier_discount_policy_version_positive" CHECK ("version" > 0),
  CONSTRAINT "cashier_discount_policy_timestamp_check" CHECK ("updated_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_cashier_staff_discount_policies" ADD CONSTRAINT "cashier_discount_policy_merchant_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_staff_discount_policies" ADD CONSTRAINT "cashier_discount_policy_staff_merchant_fk" FOREIGN KEY ("staff_id","merchant_id") REFERENCES "public"."merchant_cashier_staff"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_staff_discount_policies_merchant_idx" ON "merchant_cashier_staff_discount_policies" USING btree ("merchant_id","staff_id");
--> statement-breakpoint

CREATE TABLE "merchant_cashier_discount_override_approvals" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "station_id" text NOT NULL,
  "operator_staff_id" text NOT NULL,
  "approver_staff_id" text NOT NULL,
  "operation_id" text NOT NULL,
  "manual_discount_minor" bigint NOT NULL,
  "manual_discount_reason" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_cashier_discount_override_merchant_operation_unique" UNIQUE("merchant_id","operation_id"),
  CONSTRAINT "cashier_discount_override_amount_positive" CHECK ("manual_discount_minor" > 0),
  CONSTRAINT "cashier_discount_override_reason_nonempty" CHECK (char_length(btrim("manual_discount_reason")) BETWEEN 1 AND 200),
  CONSTRAINT "cashier_discount_override_not_self_approved" CHECK ("operator_staff_id" <> "approver_staff_id"),
  CONSTRAINT "cashier_discount_override_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "cashier_discount_override_consumed_time_check" CHECK ("consumed_at" IS NULL OR "consumed_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_cashier_discount_override_approvals" ADD CONSTRAINT "cashier_discount_override_merchant_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_discount_override_approvals" ADD CONSTRAINT "cashier_discount_override_station_merchant_fk" FOREIGN KEY ("station_id","merchant_id") REFERENCES "public"."merchant_cashier_stations"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_discount_override_approvals" ADD CONSTRAINT "cashier_discount_override_operator_merchant_fk" FOREIGN KEY ("operator_staff_id","merchant_id") REFERENCES "public"."merchant_cashier_staff"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_discount_override_approvals" ADD CONSTRAINT "cashier_discount_override_approver_merchant_fk" FOREIGN KEY ("approver_staff_id","merchant_id") REFERENCES "public"."merchant_cashier_staff"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_discount_override_approvals_lookup_idx" ON "merchant_cashier_discount_override_approvals" USING btree ("merchant_id","operation_id","id");
--> statement-breakpoint
CREATE INDEX "merchant_cashier_discount_override_approvals_approver_idx" ON "merchant_cashier_discount_override_approvals" USING btree ("merchant_id","approver_staff_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "merchant_cashier_discount_override_approvals_expiry_idx" ON "merchant_cashier_discount_override_approvals" USING btree ("merchant_id","expires_at") WHERE "consumed_at" IS NULL;
