CREATE OR REPLACE FUNCTION fawri_normalize_catalog_variant_signature(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN char_length(value) BETWEEN 16 AND 256 THEN value
    WHEN char_length(value) < 16 THEN value || '|h=' || md5(value)
    ELSE left(value, 220) || '|h=' || md5(value)
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fawri_catalog_variant_signature_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.option_signature := fawri_normalize_catalog_variant_signature(NEW.option_signature);
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS product_variants_option_signature_guard ON product_variants;
--> statement-breakpoint
CREATE TRIGGER product_variants_option_signature_guard
BEFORE INSERT OR UPDATE OF option_signature ON product_variants
FOR EACH ROW
EXECUTE FUNCTION fawri_catalog_variant_signature_guard();