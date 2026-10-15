UPDATE "cashier_operation_attribution" AS attribution
SET "location_id" = station."location_id"
FROM "merchant_cashier_stations" AS station
WHERE attribution."location_id" IS NULL
  AND station."merchant_id" = attribution."merchant_id"
  AND station."id" = attribution."station_id"
  AND station."location_id" IS NOT NULL;
