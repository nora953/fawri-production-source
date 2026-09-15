CREATE TABLE "merchant_cashier_staff" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "display_name" text NOT NULL,
  "role" text DEFAULT 'cashier' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "pin_hash" text NOT NULL,
  "pin_version" integer DEFAULT 1 NOT NULL,
  "failed_pin_attempts" integer DEFAULT 0 NOT NULL,
  "pin_locked_until" timestamp with time zone,
  "pin_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_cashier_staff_id_merchant_unique" UNIQUE("id", "merchant_id"),
  CONSTRAINT "merchant_cashier_staff_role_check" CHECK ("role" IN ('cashier', 'manager')),
  CONSTRAINT "merchant_cashier_staff_status_check" CHECK ("status" IN ('active', 'disabled', 'revoked')),
  CONSTRAINT "merchant_cashier_staff_pin_hash_check" CHECK (char_length("pin_hash") BETWEEN 32 AND 256),
  CONSTRAINT "merchant_cashier_staff_counters_check" CHECK ("pin_version" > 0 AND "version" > 0 AND "failed_pin_attempts" >= 0 AND "failed_pin_attempts" <= 20),
  CONSTRAINT "merchant_cashier_staff_revoked_state_check" CHECK (("status" = 'revoked' AND "revoked_at" IS NOT NULL) OR ("status" <> 'revoked' AND "revoked_at" IS NULL)),
  CONSTRAINT "merchant_cashier_staff_timestamp_check" CHECK ("updated_at" >= "created_at" AND "pin_changed_at" >= "created_at")
);
--> statement-breakpoint
ALTER TABLE "merchant_cashier_staff" ADD CONSTRAINT "merchant_cashier_staff_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_staff_merchant_status_idx" ON "merchant_cashier_staff" USING btree ("merchant_id", "status");
--> statement-breakpoint

CREATE TABLE "merchant_cashier_staff_permissions" (
  "merchant_id" text NOT NULL,
  "staff_id" text NOT NULL,
  "permission" text NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_cashier_staff_permissions_staff_id_permission_pk" PRIMARY KEY("staff_id", "permission"),
  CONSTRAINT "merchant_cashier_staff_permissions_permission_check" CHECK ("permission" IN ('sale.create','sale.view_own','sale.view_all','sale.return','sale.void','inventory.adjust','reports.sales','reports.profit','catalog.cost','shifts.manage','staff.manage','stations.manage'))
);
--> statement-breakpoint
ALTER TABLE "merchant_cashier_staff_permissions" ADD CONSTRAINT "merchant_cashier_staff_permissions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_cashier_staff_permissions" ADD CONSTRAINT "merchant_cashier_staff_permissions_staff_merchant_fk" FOREIGN KEY ("staff_id","merchant_id") REFERENCES "public"."merchant_cashier_staff"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_staff_permissions_merchant_idx" ON "merchant_cashier_staff_permissions" USING btree ("merchant_id", "staff_id");
--> statement-breakpoint

CREATE TABLE "merchant_cashier_stations" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "name" text NOT NULL,
  "branch_key" text DEFAULT 'main' NOT NULL,
  "branch_label" text,
  "status" text DEFAULT 'active' NOT NULL,
  "paired_device_id" text,
  "offline_inventory_authority" boolean DEFAULT false NOT NULL,
  "credential_version" integer DEFAULT 1 NOT NULL,
  "paired_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_cashier_stations_id_merchant_unique" UNIQUE("id", "merchant_id"),
  CONSTRAINT "merchant_cashier_stations_status_check" CHECK ("status" IN ('active', 'disabled', 'revoked')),
  CONSTRAINT "merchant_cashier_stations_identity_check" CHECK (char_length("name") BETWEEN 1 AND 120 AND char_length("branch_key") BETWEEN 1 AND 120 AND ("paired_device_id" IS NULL OR char_length("paired_device_id") BETWEEN 1 AND 200)),
  CONSTRAINT "merchant_cashier_stations_credential_version_check" CHECK ("credential_version" > 0),
  CONSTRAINT "merchant_cashier_stations_pairing_state_check" CHECK (("paired_device_id" IS NULL AND "paired_at" IS NULL) OR ("paired_device_id" IS NOT NULL AND "paired_at" IS NOT NULL)),
  CONSTRAINT "merchant_cashier_stations_revoked_state_check" CHECK (("status" = 'revoked' AND "revoked_at" IS NOT NULL) OR ("status" <> 'revoked' AND "revoked_at" IS NULL)),
  CONSTRAINT "merchant_cashier_stations_timestamp_check" CHECK ("updated_at" >= "created_at" AND ("last_seen_at" IS NULL OR "last_seen_at" >= "created_at"))
);
--> statement-breakpoint
ALTER TABLE "merchant_cashier_stations" ADD CONSTRAINT "merchant_cashier_stations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "merchant_cashier_stations_merchant_status_idx" ON "merchant_cashier_stations" USING btree ("merchant_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cashier_stations_device_unique" ON "merchant_cashier_stations" USING btree ("merchant_id", "paired_device_id") WHERE "paired_device_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_cashier_stations_offline_branch_unique" ON "merchant_cashier_stations" USING btree ("merchant_id", "branch_key") WHERE "offline_inventory_authority" = TRUE AND "status" = 'active';
--> statement-breakpoint

CREATE TABLE "cashier_station_pairing_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "station_id" text NOT NULL,
  "code_hash" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "used_by_device_id" text,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "cashier_station_pairing_challenges_status_check" CHECK ("status" IN ('active','used','revoked','expired')),
  CONSTRAINT "cashier_station_pairing_challenges_code_hash_check" CHECK (char_length("code_hash") = 64),
  CONSTRAINT "cashier_station_pairing_challenges_time_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "cashier_station_pairing_challenges_terminal_state_check" CHECK (("status" = 'active' AND "used_at" IS NULL AND "used_by_device_id" IS NULL AND "revoked_at" IS NULL) OR ("status" = 'used' AND "used_at" IS NOT NULL AND "used_by_device_id" IS NOT NULL AND "revoked_at" IS NULL) OR ("status" = 'revoked' AND "used_at" IS NULL AND "used_by_device_id" IS NULL AND "revoked_at" IS NOT NULL) OR ("status" = 'expired' AND "used_at" IS NULL AND "used_by_device_id" IS NULL AND "revoked_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "cashier_station_pairing_challenges" ADD CONSTRAINT "cashier_station_pairing_challenges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_station_pairing_challenges" ADD CONSTRAINT "cashier_station_pairing_challenges_station_merchant_fk" FOREIGN KEY ("station_id","merchant_id") REFERENCES "public"."merchant_cashier_stations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_station_pairing_challenges_live_station_unique" ON "cashier_station_pairing_challenges" USING btree ("merchant_id", "station_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_station_pairing_challenges_code_hash_unique" ON "cashier_station_pairing_challenges" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "cashier_station_pairing_challenges_expiry_idx" ON "cashier_station_pairing_challenges" USING btree ("status", "expires_at");
--> statement-breakpoint

CREATE TABLE "cashier_station_credentials" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "station_id" text NOT NULL,
  "device_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "version" integer NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "cashier_station_credentials_status_check" CHECK ("status" IN ('active','revoked','expired')),
  CONSTRAINT "cashier_station_credentials_token_hash_check" CHECK (char_length("token_hash") = 64),
  CONSTRAINT "cashier_station_credentials_identity_check" CHECK (char_length("device_id") BETWEEN 1 AND 200 AND "version" > 0),
  CONSTRAINT "cashier_station_credentials_time_check" CHECK ("expires_at" > "issued_at" AND ("last_used_at" IS NULL OR "last_used_at" >= "issued_at")),
  CONSTRAINT "cashier_station_credentials_terminal_state_check" CHECK (("status" = 'active' AND "revoked_at" IS NULL) OR ("status" = 'revoked' AND "revoked_at" IS NOT NULL) OR ("status" = 'expired' AND "revoked_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "cashier_station_credentials" ADD CONSTRAINT "cashier_station_credentials_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_station_credentials" ADD CONSTRAINT "cashier_station_credentials_station_merchant_fk" FOREIGN KEY ("station_id","merchant_id") REFERENCES "public"."merchant_cashier_stations"("id","merchant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_station_credentials_token_hash_unique" ON "cashier_station_credentials" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_station_credentials_live_station_unique" ON "cashier_station_credentials" USING btree ("merchant_id", "station_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX "cashier_station_credentials_device_idx" ON "cashier_station_credentials" USING btree ("merchant_id", "device_id", "status");
--> statement-breakpoint

CREATE TABLE "cashier_shifts" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "station_id" text NOT NULL,
  "staff_id" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  "close_reason" text,
  CONSTRAINT "cashier_shifts_identity_unique" UNIQUE("id", "merchant_id", "station_id", "staff_id"),
  CONSTRAINT "cashier_shifts_status_check" CHECK ("status" IN ('open','closed')),
  CONSTRAINT "cashier_shifts_lifecycle_check" CHECK (("status" = 'open' AND "ended_at" IS NULL AND "close_reason" IS NULL) OR ("status" = 'closed' AND "ended_at" IS NOT NULL AND "ended_at" >= "started_at" AND "close_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_station_merchant_fk" FOREIGN KEY ("station_id","merchant_id") REFERENCES "public"."merchant_cashier_stations"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_staff_merchant_fk" FOREIGN KEY ("staff_id","merchant_id") REFERENCES "public"."merchant_cashier_staff"("id","merchant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_shifts_open_station_unique" ON "cashier_shifts" USING btree ("merchant_id", "station_id") WHERE "status" = 'open';
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_shifts_open_staff_unique" ON "cashier_shifts" USING btree ("merchant_id", "staff_id") WHERE "status" = 'open';
--> statement-breakpoint
CREATE INDEX "cashier_shifts_staff_started_idx" ON "cashier_shifts" USING btree ("merchant_id", "staff_id", "started_at");
--> statement-breakpoint

CREATE TABLE "cashier_operator_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "merchant_id" text NOT NULL,
  "station_id" text NOT NULL,
  "staff_id" text NOT NULL,
  "shift_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "staff_version" integer NOT NULL,
  "permission_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "cashier_operator_sessions_status_check" CHECK ("status" IN ('active','revoked','expired')),
  CONSTRAINT "cashier_operator_sessions_token_hash_check" CHECK (char_length("token_hash") = 64),
  CONSTRAINT "cashier_operator_sessions_authorization_check" CHECK ("staff_version" > 0 AND jsonb_typeof("permission_snapshot") = 'array'),
  CONSTRAINT "cashier_operator_sessions_time_check" CHECK ("last_seen_at" >= "issued_at" AND "expires_at" > "issued_at"),
  CONSTRAINT "cashier_operator_sessions_terminal_state_check" CHECK (("status" = 'active' AND "revoked_at" IS NULL) OR ("status" = 'revoked' AND "revoked_at" IS NOT NULL) OR ("status" = 'expired' AND "revoked_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "cashier_operator_sessions" ADD CONSTRAINT "cashier_operator_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cashier_operator_sessions" ADD CONSTRAINT "cashier_operator_sessions_shift_identity_fk" FOREIGN KEY ("shift_id","merchant_id","station_id","staff_id") REFERENCES "public"."cashier_shifts"("id","merchant_id","station_id","staff_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_operator_sessions_token_hash_unique" ON "cashier_operator_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_operator_sessions_live_station_unique" ON "cashier_operator_sessions" USING btree ("merchant_id", "station_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX "cashier_operator_sessions_staff_idx" ON "cashier_operator_sessions" USING btree ("merchant_id", "staff_id", "status");
