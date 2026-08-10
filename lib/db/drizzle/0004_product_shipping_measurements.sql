ALTER TABLE "product_variants" ADD COLUMN "weight_g" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "length_mm" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "width_mm" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "height_mm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_g" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length_mm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width_mm" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height_mm" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_weight_g_check" CHECK ("product_variants"."weight_g" IS NULL OR "product_variants"."weight_g" BETWEEN 1 AND 100000000);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_dimensions_mm_check" CHECK (("product_variants"."length_mm" IS NULL AND "product_variants"."width_mm" IS NULL AND "product_variants"."height_mm" IS NULL) OR ("product_variants"."length_mm" BETWEEN 1 AND 100000 AND "product_variants"."width_mm" BETWEEN 1 AND 100000 AND "product_variants"."height_mm" BETWEEN 1 AND 100000));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_weight_g_check" CHECK ("products"."weight_g" IS NULL OR "products"."weight_g" BETWEEN 1 AND 100000000);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_dimensions_mm_check" CHECK (("products"."length_mm" IS NULL AND "products"."width_mm" IS NULL AND "products"."height_mm" IS NULL) OR ("products"."length_mm" BETWEEN 1 AND 100000 AND "products"."width_mm" BETWEEN 1 AND 100000 AND "products"."height_mm" BETWEEN 1 AND 100000));