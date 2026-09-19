import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { merchantLocations } from "./merchant-locations";
import { merchants } from "./merchants";

export const catalogIdentifierKindEnum = pgEnum("catalog_identifier_kind", [
  "sku",
  "barcode",
]);
export const catalogIdentifierOwnerEnum = pgEnum("catalog_identifier_owner", [
  "product",
  "variant",
]);
export const inventoryMutationTypeEnum = pgEnum("inventory_mutation_type", [
  "set",
  "adjust",
  "variant_reconcile",
]);

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    externalRef: text("external_ref"),
    normalizedExternalRef: text("normalized_external_ref"),
    code: text("code"),
    name: text("name").notNull(),
    sku: text("sku"),
    barcode: text("barcode"),
    category: text("category"),
    description: text("description"),
    originalPriceIqd: integer("original_price_iqd").notNull().default(0),
    currentPriceIqd: integer("current_price_iqd").notNull().default(0),
    compareAtPriceIqd: integer("compare_at_price_iqd"),
    quantity: integer("quantity").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
    weightG: integer("weight_g"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    variantStockMode: boolean("variant_stock_mode").notNull().default(false),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("available"),
    allowFawriReply: boolean("allow_fawri_reply").notNull().default(true),
    imageUrl: text("image_url"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    idMerchantUnique: unique("products_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantNameIndex: index("products_merchant_name_idx").on(
      table.merchantId,
      table.name,
    ),
    merchantExternalRefUnique: uniqueIndex(
      "products_merchant_external_ref_unique",
    )
      .on(table.merchantId, table.normalizedExternalRef)
      .where(sql`${table.normalizedExternalRef} IS NOT NULL`),
    merchantStatusIndex: index("products_merchant_status_idx").on(
      table.merchantId,
      table.status,
    ),
    priceCheck: check(
      "products_price_check",
      sql`${table.originalPriceIqd} >= 0 AND ${table.currentPriceIqd} >= 0 AND (${table.compareAtPriceIqd} IS NULL OR ${table.compareAtPriceIqd} >= ${table.currentPriceIqd})`,
    ),
    stockCheck: check(
      "products_stock_check",
      sql`${table.quantity} >= 0 AND ${table.lowStockThreshold} >= 0`,
    ),
    weightCheck: check(
      "products_weight_g_check",
      sql`${table.weightG} IS NULL OR ${table.weightG} BETWEEN 1 AND 100000000`,
    ),
    dimensionsCheck: check(
      "products_dimensions_mm_check",
      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,
    ),
    dimensionsAllOrNoneCheck: check(
      "products_dimensions_mm_all_or_none_check",
      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} IS NOT NULL AND ${table.widthMm} IS NOT NULL AND ${table.heightMm} IS NOT NULL AND ${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,
    ),
    versionCheck: check("products_version_check", sql`${table.version} > 0`),
    externalRefPairCheck: check(
      "products_external_ref_pair_check",
      sql`(${table.externalRef} IS NULL) = (${table.normalizedExternalRef} IS NULL)`,
    ),
    timestampOrderCheck: check(
      "products_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    externalRef: text("external_ref"),
    normalizedExternalRef: text("normalized_external_ref"),
    name: text("name").notNull().default(""),
    color: text("color"),
    size: text("size"),
    sku: text("sku"),
    barcode: text("barcode"),
    quantity: integer("quantity").notNull().default(0),
    priceAdjustmentIqd: integer("price_adjustment_iqd").notNull().default(0),
    priceOverrideIqd: integer("price_override_iqd"),
    weightG: integer("weight_g"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    optionSignature: text("option_signature").notNull(),
    version: integer("version").notNull().default(1),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    productTenantForeignKey: foreignKey({
      name: "product_variants_product_merchant_fk",
      columns: [table.productId, table.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }).onDelete("cascade"),
    idMerchantUnique: unique("product_variants_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    idProductMerchantUnique: unique("product_variants_id_product_merchant_unique").on(
      table.id,
      table.productId,
      table.merchantId,
    ),
    productSignatureUnique: uniqueIndex(
      "product_variants_product_signature_unique",
    ).on(table.merchantId, table.productId, table.optionSignature),
    merchantExternalRefUnique: uniqueIndex(
      "product_variants_merchant_external_ref_unique",
    )
      .on(table.merchantId, table.normalizedExternalRef)
      .where(sql`${table.normalizedExternalRef} IS NOT NULL`),
    productIndex: index("product_variants_product_idx").on(
      table.merchantId,
      table.productId,
    ),
    quantityCheck: check(
      "product_variants_quantity_check",
      sql`${table.quantity} >= 0`,
    ),
    priceCheck: check(
      "product_variants_price_check",
      sql`${table.priceOverrideIqd} IS NULL OR ${table.priceOverrideIqd} >= 0`,
    ),
    weightCheck: check(
      "product_variants_weight_g_check",
      sql`${table.weightG} IS NULL OR ${table.weightG} BETWEEN 1 AND 100000000`,
    ),
    dimensionsCheck: check(
      "product_variants_dimensions_mm_check",
      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,
    ),
    dimensionsAllOrNoneCheck: check(
      "product_variants_dimensions_mm_all_or_none_check",
      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} IS NOT NULL AND ${table.widthMm} IS NOT NULL AND ${table.heightMm} IS NOT NULL AND ${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,
    ),
    versionCheck: check(
      "product_variants_version_check",
      sql`${table.version} > 0`,
    ),
    signatureCheck: check(
      "product_variants_signature_check",
      sql`char_length(${table.optionSignature}) BETWEEN 16 AND 256`,
    ),
    externalRefPairCheck: check(
      "product_variants_external_ref_pair_check",
      sql`(${table.externalRef} IS NULL) = (${table.normalizedExternalRef} IS NULL)`,
    ),
    timestampOrderCheck: check(
      "product_variants_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const catalogVariantOptions = pgTable(
  "catalog_variant_options",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    variantId: text("variant_id").notNull(),
    optionName: text("option_name").notNull(),
    normalizedOptionName: text("normalized_option_name").notNull(),
    optionValue: text("option_value").notNull(),
    normalizedOptionValue: text("normalized_option_value").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
  },
  (table) => ({
    variantTenantForeignKey: foreignKey({
      name: "catalog_variant_options_variant_tenant_fk",
      columns: [table.variantId, table.productId, table.merchantId],
      foreignColumns: [
        productVariants.id,
        productVariants.productId,
        productVariants.merchantId,
      ],
    }).onDelete("cascade"),
    variantNameUnique: uniqueIndex("catalog_variant_options_variant_name_unique").on(
      table.merchantId,
      table.variantId,
      table.normalizedOptionName,
    ),
    ordinalCheck: check(
      "catalog_variant_options_ordinal_check",
      sql`${table.ordinal} >= 0`,
    ),
    normalizedCheck: check(
      "catalog_variant_options_normalized_check",
      sql`char_length(${table.normalizedOptionName}) > 0 AND char_length(${table.normalizedOptionValue}) > 0`,
    ),
  }),
);

export const catalogIdentifiers = pgTable(
  "catalog_identifiers",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    kind: catalogIdentifierKindEnum("kind").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    displayValue: text("display_value").notNull(),
    ownerType: catalogIdentifierOwnerEnum("owner_type").notNull(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    productTenantForeignKey: foreignKey({
      name: "catalog_identifiers_product_tenant_fk",
      columns: [table.productId, table.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }).onDelete("cascade"),
    variantTenantForeignKey: foreignKey({
      name: "catalog_identifiers_variant_tenant_fk",
      columns: [table.variantId, table.productId, table.merchantId],
      foreignColumns: [
        productVariants.id,
        productVariants.productId,
        productVariants.merchantId,
      ],
    }).onDelete("cascade"),
    merchantKindValueUnique: uniqueIndex(
      "catalog_identifiers_merchant_kind_value_unique",
    ).on(table.merchantId, table.kind, table.normalizedValue),
    ownerCheck: check(
      "catalog_identifiers_owner_check",
      sql`(${table.ownerType} = 'product' AND ${table.variantId} IS NULL) OR (${table.ownerType} = 'variant' AND ${table.variantId} IS NOT NULL)`,
    ),
    valueCheck: check(
      "catalog_identifiers_value_check",
      sql`char_length(${table.normalizedValue}) > 0 AND char_length(${table.displayValue}) > 0`,
    ),
  }),
);

export const catalogImageReferences = pgTable(
  "catalog_image_references",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    url: text("url"),
    storageKey: text("storage_key"),
    altText: text("alt_text"),
    ordinal: integer("ordinal").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    productTenantForeignKey: foreignKey({
      name: "catalog_image_refs_product_tenant_fk",
      columns: [table.productId, table.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }).onDelete("cascade"),
    variantTenantForeignKey: foreignKey({
      name: "catalog_image_refs_variant_tenant_fk",
      columns: [table.variantId, table.productId, table.merchantId],
      foreignColumns: [
        productVariants.id,
        productVariants.productId,
        productVariants.merchantId,
      ],
    }).onDelete("cascade"),
    referenceCheck: check(
      "catalog_image_refs_reference_check",
      sql`${table.url} IS NOT NULL OR ${table.storageKey} IS NOT NULL`,
    ),
    urlCheck: check(
      "catalog_image_refs_url_check",
      sql`${table.url} IS NULL OR (${table.url} ~ '^https?://' AND ${table.url} !~ '^data:' AND ${table.url} !~ '^blob:')`,
    ),
    storageKeyCheck: check(
      "catalog_image_refs_storage_key_check",
      sql`${table.storageKey} IS NULL OR (${table.storageKey} !~ '(^|/)\.\.(/|$)' AND char_length(${table.storageKey}) <= 1024)`,
    ),
    ordinalCheck: check(
      "catalog_image_refs_ordinal_check",
      sql`${table.ordinal} >= 0`,
    ),
  }),
);

export const catalogIdempotencyKeys = pgTable(
  "catalog_idempotency_keys",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    keyHash: text("key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    resultProductId: text("result_product_id"),
    resultVersion: integer("result_version"),
    resultCode: text("result_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    productTenantForeignKey: foreignKey({
      name: "catalog_idempotency_product_tenant_fk",
      columns: [table.resultProductId, table.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }).onDelete("set null"),
    merchantOperationKeyUnique: uniqueIndex(
      "catalog_idempotency_merchant_operation_key_unique",
    ).on(table.merchantId, table.operation, table.keyHash),
    hashCheck: check(
      "catalog_idempotency_hash_check",
      sql`char_length(${table.keyHash}) BETWEEN 32 AND 128 AND char_length(${table.requestHash}) BETWEEN 32 AND 128`,
    ),
    retentionCheck: check(
      "catalog_idempotency_retention_check",
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '30 days'`,
    ),
    resultVersionCheck: check(
      "catalog_idempotency_result_version_check",
      sql`${table.resultVersion} IS NULL OR ${table.resultVersion} > 0`,
    ),
  }),
);

export const inventoryMutations = pgTable(
  "inventory_mutations",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    locationId: text("location_id"),
    mutationType: inventoryMutationTypeEnum("mutation_type").notNull(),
    beforeQuantity: integer("before_quantity").notNull(),
    afterQuantity: integer("after_quantity").notNull(),
    expectedVersion: integer("expected_version").notNull(),
    resultingVersion: integer("resulting_version").notNull(),
    actorType: text("actor_type").notNull(),
    actorAccountId: text("actor_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    reasonCode: text("reason_code").notNull(),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    locationTenantForeignKey: foreignKey({
      name: "inventory_mutations_location_merchant_fk",
      columns: [table.locationId, table.merchantId],
      foreignColumns: [merchantLocations.id, merchantLocations.merchantId],
    }),
    productTenantForeignKey: foreignKey({
      name: "inventory_mutations_product_tenant_fk",
      columns: [table.productId, table.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }).onDelete("cascade"),
    variantTenantForeignKey: foreignKey({
      name: "inventory_mutations_variant_tenant_fk",
      columns: [table.variantId, table.productId, table.merchantId],
      foreignColumns: [
        productVariants.id,
        productVariants.productId,
        productVariants.merchantId,
      ],
    }).onDelete("cascade"),
    merchantIdempotencyUnique: uniqueIndex(
      "inventory_mutations_merchant_idempotency_unique",
    ).on(table.merchantId, table.idempotencyKeyHash),
    productCreatedIndex: index("inventory_mutations_product_created_idx").on(
      table.merchantId,
      table.productId,
      table.createdAt,
    ),
    locationProductCreatedIndex: index(
      "inventory_mutations_location_product_created_idx",
    ).on(table.merchantId, table.locationId, table.productId, table.createdAt),
    quantityCheck: check(
      "inventory_mutations_quantity_check",
      sql`${table.beforeQuantity} >= 0 AND ${table.afterQuantity} >= 0`,
    ),
    versionCheck: check(
      "inventory_mutations_version_check",
      sql`((${table.locationId} IS NULL AND ${table.expectedVersion} > 0) OR (${table.locationId} IS NOT NULL AND ${table.expectedVersion} >= 0)) AND ${table.resultingVersion} = ${table.expectedVersion} + 1`,
    ),
    hashCheck: check(
      "inventory_mutations_hash_check",
      sql`char_length(${table.idempotencyKeyHash}) BETWEEN 32 AND 128 AND char_length(${table.requestHash}) BETWEEN 32 AND 128`,
    ),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type CatalogVariantOption = typeof catalogVariantOptions.$inferSelect;
export type CatalogIdentifier = typeof catalogIdentifiers.$inferSelect;
export type CatalogImageReference = typeof catalogImageReferences.$inferSelect;
export type CatalogIdempotencyKey = typeof catalogIdempotencyKeys.$inferSelect;
export type InventoryMutation = typeof inventoryMutations.$inferSelect;
