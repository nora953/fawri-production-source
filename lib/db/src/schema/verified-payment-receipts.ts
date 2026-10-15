import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Gateway-confirmed identity evidence can exist before any local tenant/order.
// No tenant is inferred and no raw payload, credentials or signature is stored.
export const verifiedProviderPaymentReceipts = pgTable("verified_provider_payment_receipts", {
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  paymentRef: text("payment_ref").notNull(),
  requestRef: text("request_ref").notNull(),
  eventType: text("event_type").notNull(),
  amountIqd: integer("amount_iqd").notNull(),
  payloadHash: text("payload_hash").notNull(),
  firstReceivedAt: timestamp("first_received_at", {withTimezone:true}).notNull(),
}, table => ({
  identity: primaryKey({columns:[table.provider,table.providerEventId]}),
  providerCheck: check("verified_payment_receipt_provider_check",sql`${table.provider} = 'superqi_sandbox'`),
  identityCheck: check("verified_payment_receipt_identity_check",sql`char_length(${table.providerEventId}) BETWEEN 1 AND 300 AND char_length(${table.paymentRef}) BETWEEN 1 AND 300 AND char_length(${table.requestRef}) BETWEEN 1 AND 300`),
  typeCheck: check("verified_payment_receipt_type_check",sql`${table.eventType} IN ('payment_succeeded','payment_failed','payment_cancelled')`),
  amountCheck: check("verified_payment_receipt_amount_check",sql`${table.amountIqd} > 0`),
  hashCheck: check("verified_payment_receipt_hash_check",sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
})).enableRLS();
