import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
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
    externalAccountId: text("external_account_id"),
    externalAccountName: text("external_account_name"),
    pageId: text("page_id"),
    pageName: text("page_name"),
    instagramAccountId: text("instagram_account_id"),
    instagramUsername: text("instagram_username"),
    tokenCiphertext: text("token_ciphertext"),
    tokenKeyVersion: text("token_key_version"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    webhookSubscribedAt: timestamp("webhook_subscribed_at", {
      withTimezone: true,
    }),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
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
    idMerchantUnique: uniqueIndex("merchant_channels_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantPlatformUnique: uniqueIndex(
      "merchant_channels_merchant_platform_unique",
    ).on(table.merchantId, table.platform, table.externalAccountId),
    pageUnique: uniqueIndex("merchant_channels_page_unique").on(table.pageId),
    merchantStatusIndex: index("merchant_channels_merchant_status_idx").on(
      table.merchantId,
      table.status,
    ),
    tokenExpiryIndex: index("merchant_channels_token_expiry_idx").on(
      table.tokenExpiresAt,
    ),
    tokenPairCheck: check(
      "merchant_channels_token_pair_check",
      sql`(${table.tokenCiphertext} IS NULL) = (${table.tokenKeyVersion} IS NULL)`,
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
