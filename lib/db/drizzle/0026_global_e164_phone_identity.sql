ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_phone_shape_check";--> statement-breakpoint
UPDATE "accounts"
SET "phone" = '+964' || substring("phone" from 2),
    "updated_at" = GREATEST("updated_at", clock_timestamp())
WHERE "phone" ~ '^07[0-9]{9}$';--> statement-breakpoint
ALTER TABLE "accounts"
ADD CONSTRAINT "accounts_phone_shape_check"
CHECK ("accounts"."phone" IS NULL OR "accounts"."phone" ~ '^\\+[1-9][0-9]{7,14}$');
