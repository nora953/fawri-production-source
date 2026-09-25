import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { channelPlatformEnum, channelStatusEnum } from "./enums";
import { merchants } from "./merchants";

export const merchantChannels = pgTable(
  "merchant_channels",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    platform: channelPlatformEnum("platform").notNull(),
    status: channelStatusEnum("status").notNull().default("pending"),
    version: integer("version").notNull().default(1),
    externalAccountId: text("external_account_id"),
    externalAccountName: text("external_account_name"),
    pageId: text("page_id"),
    pageName: text("page_name"),
    instagramAccountId: text("instagram_account_id"),
    instagramUsername: text("instagram_username"),
    credentialCiphertext: text("credential_ciphertext"),
    credentialNonce: text("credential_nonce"),
    credentialAuthTag: text("credential_auth_tag"),
    credentialKeyId: text("credential_key_id"),
    credentialAlgorithm: text("credential_algorithm"),
    credentialExpiresAt: timestamp("credential_expires_at", {
      withTimezone: true,
    }),
    webhookSubscribedAt: timestamp("webhook_subscribed_at", {
      withTimezone: true,
    }),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
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
    idMerchantUnique: unique("merchant_channels_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantPlatformUnique: uniqueIndex(
      "merchant_channels_merchant_platform_external_unique",
    )
      .on(table.merchantId, table.platform, table.externalAccountId)
      .where(sql`${table.externalAccountId} IS NOT NULL`),
    pageUnique: uniqueIndex("merchant_channels_page_unique")
      .on(table.pageId)
      .where(sql`${table.pageId} IS NOT NULL`),
    merchantStatusIndex: index("merchant_channels_merchant_status_idx").on(
      table.merchantId,
      table.status,
    ),
    credentialExpiryIndex: index("merchant_channels_credential_expiry_idx").on(
      table.credentialExpiresAt,
    ),
    versionCheck: check(
      "merchant_channels_version_check",
      sql`${table.version} > 0`,
    ),
    credentialEnvelopeCheck: check(
      "merchant_channels_credential_envelope_check",
      sql`(${table.credentialCiphertext} IS NULL AND ${table.credentialNonce} IS NULL AND ${table.credentialAuthTag} IS NULL AND ${table.credentialKeyId} IS NULL AND ${table.credentialAlgorithm} IS NULL) OR (${table.credentialCiphertext} IS NOT NULL AND ${table.credentialNonce} IS NOT NULL AND ${table.credentialAuthTag} IS NOT NULL AND ${table.credentialKeyId} IS NOT NULL AND ${table.credentialAlgorithm} = 'aes-256-gcm')`,
    ),
    timestampOrderCheck: check(
      "merchant_channels_timestamp_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    disconnectedTimestampCheck: check(
      "merchant_channels_disconnected_timestamp_check",
      sql`${table.disconnectedAt} IS NULL OR ${table.connectedAt} IS NULL OR ${table.disconnectedAt} >= ${table.connectedAt}`,
    ),
  }),
);

export type MerchantChannel = typeof merchantChannels.$inferSelect;
export type NewMerchantChannel = typeof merchantChannels.$inferInsert;
