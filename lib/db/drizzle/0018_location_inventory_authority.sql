ALTER TABLE "inventory_mutations" DROP CONSTRAINT "inventory_mutations_version_check";
--> statement-breakpoint
ALTER TABLE "inventory_mutations" ADD CONSTRAINT "inventory_mutations_version_check" CHECK (
  (
    "location_id" IS NULL
    AND "expected_version" > 0
    AND "resulting_version" = "expected_version" + 1
  )
  OR
  (
    "location_id" IS NOT NULL
    AND "expected_version" >= 0
    AND "resulting_version" = "expected_version" + 1
  )
);
