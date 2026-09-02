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
    whatsappBusinessAccountId: text("whatsapp_business_account_id"),
    whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
    whatsappDisplayPhoneNumber: text("whatsapp_display_phone_number"),
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
    whatsappPhoneNumberUnique: uniqueIndex(
      "merchant_channels_whatsapp_phone_number_unique",
    )
      .on(table.whatsappPhoneNumberId)
      .where(sql`${table.whatsappPhoneNumberId} IS NOT NULL`),
    whatsappWabaIndex: index("merchant_channels_whatsapp_waba_idx")
      .on(table.whatsappBusinessAccountId)
      .where(sql`${table.whatsappBusinessAccountId} IS NOT NULL`),
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
    whatsappIdentityPairCheck: check(
      "merchant_channels_whatsapp_identity_pair_check",
      sql`(${table.whatsappBusinessAccountId} IS NULL AND ${table.whatsappPhoneNumberId} IS NULL AND ${table.whatsappDisplayPhoneNumber} IS NULL) OR (${table.whatsappBusinessAccountId} IS NOT NULL AND ${table.whatsappPhoneNumberId} IS NOT NULL)`,
    ),
    whatsappIdentityFormatCheck: check(
      "merchant_channels_whatsapp_identity_format_check",
      sql`(${table.whatsappBusinessAccountId} IS NULL OR ${table.whatsappBusinessAccountId} ~ '^[0-9]{1,40}$') AND (${table.whatsappPhoneNumberId} IS NULL OR ${table.whatsappPhoneNumberId} ~ '^[0-9]{1,40}$')`,
    ),
    whatsappIdentityScopeCheck: check(
      "merchant_channels_whatsapp_identity_scope_check",
      sql`${table.platform} = 'whatsapp' OR (${table.whatsappBusinessAccountId} IS NULL AND ${table.whatsappPhoneNumberId} IS NULL AND ${table.whatsappDisplayPhoneNumber} IS NULL)`,
    ),
    whatsappChannelShapeCheck: check(
      "merchant_channels_whatsapp_channel_shape_check",
      sql`${table.platform} <> 'whatsapp' OR (${table.externalAccountId} IS NULL AND ${table.externalAccountName} IS NULL AND ${table.pageId} IS NULL AND ${table.pageName} IS NULL AND ${table.instagramAccountId} IS NULL AND ${table.instagramUsername} IS NULL)`,
    ),
    whatsappDormantOnlyCheck: check(
      "merchant_channels_whatsapp_dormant_only_check",
      sql`${table.platform} <> 'whatsapp' OR (${table.status} = 'pending' AND ${table.credentialCiphertext} IS NULL AND ${table.credentialNonce} IS NULL AND ${table.credentialAuthTag} IS NULL AND ${table.credentialKeyId} IS NULL AND ${table.credentialAlgorithm} IS NULL AND ${table.credentialExpiresAt} IS NULL AND ${table.webhookSubscribedAt} IS NULL AND ${table.lastWebhookAt} IS NULL AND ${table.connectedAt} IS NULL)`,
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
