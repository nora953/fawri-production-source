import { sql } from "drizzle-orm";
import { check, index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { adminProfiles } from "./merchants";
import { merchantLocationDeliveryAreas } from "./merchant-locations";
import {
  merchantDeliveryAreaRates,
  merchantSettings,
} from "./merchant-settings";
import {
  orders,
  orderPaymentDecisions,
  orderPaymentProviderEvents,
  orderTerminalDecisionLinks,
} from "./orders";
import { backgroundJobs, backgroundJobPayloads } from "./jobs";
import { merchantChannels } from "./channels";
import { channelInboundEvents, outboundDeliveries, replyRefunds, replyReservations } from "./channel-messaging";
import { catalogIdempotencyKeys, catalogIdentifiers, catalogImageReferences, catalogVariantOptions, inventoryMutations, products, productVariants } from "./catalog";
import { commercePromotions } from "./commerce-promotions";
import { replyLedger, subscriptionReplyBatches, subscriptions } from "./subscriptions";
import { saasBillingEvents, saasBillingOrders, saasBillingRefunds, saasEntitlementApplications } from "./saas-billing";
import { conversations, messages } from "./conversations";
import { knowledgeAuditEvents, knowledgeEmbeddings, learnedAnswers, savedAnswers, trainingRequests } from "./knowledge";

export const databaseAdminAccessAudits = pgTable(
  "database_admin_access_audits",
  {
    id: text("id").primaryKey(),
    adminAccountId: text("admin_account_id").notNull().references(() => adminProfiles.id, { onDelete: "restrict" }),
    merchantId: text("merchant_id"),
    reasonCode: text("reason_code").notNull(),
    requestHash: text("request_hash").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    adminStartedIndex: index("database_admin_access_admin_started_idx").on(table.adminAccountId, table.startedAt),
    merchantStartedIndex: index("database_admin_access_merchant_started_idx").on(table.merchantId, table.startedAt),
    requestHashCheck: check("database_admin_access_request_hash_check", sql`char_length(${table.requestHash}) BETWEEN 32 AND 128`),
    durationCheck: check("database_admin_access_duration_check", sql`${table.expiresAt} > ${table.startedAt} AND ${table.expiresAt} <= ${table.startedAt} + interval '30 minutes'`),
  }),
);

function tenantOrAuditedAdmin(merchantColumn: any) {
  return sql`(
    ${merchantColumn} = nullif(current_setting('fawri.tenant_id', true), '')
    OR EXISTS (
      SELECT 1 FROM database_admin_access_audits AS admin_audit
      WHERE admin_audit.id = nullif(current_setting('fawri.admin_audit_id', true), '')
        AND admin_audit.admin_account_id = nullif(current_setting('fawri.admin_account_id', true), '')
        AND admin_audit.started_at <= clock_timestamp()
        AND admin_audit.expires_at > clock_timestamp()
        AND (admin_audit.merchant_id IS NULL OR admin_audit.merchant_id = ${merchantColumn})
    )
  )`;
}

function tenantPolicy(name: string, table: any) {
  const boundary = tenantOrAuditedAdmin(table.merchantId);
  return pgPolicy(name, { as: "permissive", for: "all", to: "public", using: boundary, withCheck: boundary }).link(table);
}

export const merchantSettingsTenantPolicy = tenantPolicy("merchant_settings_tenant_boundary", merchantSettings);
export const merchantDeliveryAreaRatesTenantPolicy = tenantPolicy(
  "merchant_delivery_area_rates_tenant_boundary",
  merchantDeliveryAreaRates,
);
export const merchantLocationDeliveryAreasTenantPolicy = tenantPolicy(
  "merchant_location_delivery_areas_tenant_boundary",
  merchantLocationDeliveryAreas,
);
export const ordersTenantPolicy = tenantPolicy("orders_tenant_boundary", orders);
export const orderPaymentDecisionsTenantPolicy = tenantPolicy("order_payment_decisions_tenant_boundary", orderPaymentDecisions);
export const orderPaymentProviderEventsTenantPolicy = tenantPolicy(
  "order_payment_provider_events_tenant_boundary",
  orderPaymentProviderEvents,
);
export const orderTerminalDecisionLinksTenantPolicy = tenantPolicy("order_terminal_decision_links_tenant_boundary", orderTerminalDecisionLinks);
export const backgroundJobsTenantPolicy = tenantPolicy("background_jobs_tenant_boundary", backgroundJobs);
export const backgroundJobPayloadsTenantPolicy = tenantPolicy("background_job_payloads_tenant_boundary", backgroundJobPayloads);
export const merchantChannelsTenantPolicy = tenantPolicy("merchant_channels_tenant_boundary", merchantChannels);
export const channelInboundEventsTenantPolicy = tenantPolicy("channel_inbound_events_tenant_boundary", channelInboundEvents);
export const replyReservationsTenantPolicy = tenantPolicy("reply_reservations_tenant_boundary", replyReservations);
export const replyRefundsTenantPolicy = tenantPolicy("reply_refunds_tenant_boundary", replyRefunds);
export const outboundDeliveriesTenantPolicy = tenantPolicy("outbound_deliveries_tenant_boundary", outboundDeliveries);
export const productsTenantPolicy = tenantPolicy("products_tenant_boundary", products);
export const productVariantsTenantPolicy = tenantPolicy("product_variants_tenant_boundary", productVariants);
export const catalogVariantOptionsTenantPolicy = tenantPolicy("catalog_variant_options_tenant_boundary", catalogVariantOptions);
export const catalogIdentifiersTenantPolicy = tenantPolicy("catalog_identifiers_tenant_boundary", catalogIdentifiers);
export const catalogImageReferencesTenantPolicy = tenantPolicy("catalog_image_references_tenant_boundary", catalogImageReferences);
export const catalogIdempotencyKeysTenantPolicy = tenantPolicy("catalog_idempotency_keys_tenant_boundary", catalogIdempotencyKeys);
export const inventoryMutationsTenantPolicy = tenantPolicy("inventory_mutations_tenant_boundary", inventoryMutations);
export const commercePromotionsTenantPolicy = tenantPolicy(
  "commerce_promotions_tenant_boundary",
  commercePromotions,
);
export const subscriptionsTenantPolicy = tenantPolicy("subscriptions_tenant_boundary", subscriptions);
export const subscriptionReplyBatchesTenantPolicy = tenantPolicy("subscription_reply_batches_tenant_boundary", subscriptionReplyBatches);
export const replyLedgerTenantPolicy = tenantPolicy("reply_ledger_tenant_boundary", replyLedger);
export const saasBillingOrdersTenantPolicy = tenantPolicy("saas_billing_orders_tenant_boundary", saasBillingOrders);
export const saasBillingEventsTenantPolicy = tenantPolicy("saas_billing_events_tenant_boundary", saasBillingEvents);
export const saasEntitlementApplicationsTenantPolicy = tenantPolicy("saas_entitlement_applications_tenant_boundary", saasEntitlementApplications);
export const saasBillingRefundsTenantPolicy = tenantPolicy("saas_billing_refunds_tenant_boundary", saasBillingRefunds);
export const conversationsTenantPolicy = tenantPolicy("conversations_tenant_boundary", conversations);
export const messagesTenantPolicy = tenantPolicy("messages_tenant_boundary", messages);
export const savedAnswersTenantPolicy = tenantPolicy("saved_answers_tenant_boundary", savedAnswers);
export const trainingRequestsTenantPolicy = tenantPolicy("training_requests_tenant_boundary", trainingRequests);
export const learnedAnswersTenantPolicy = tenantPolicy("learned_answers_tenant_boundary", learnedAnswers);
export const knowledgeAuditEventsTenantPolicy = tenantPolicy("knowledge_audit_events_tenant_boundary", knowledgeAuditEvents);
export const knowledgeEmbeddingsTenantPolicy = tenantPolicy("knowledge_embeddings_tenant_boundary", knowledgeEmbeddings);
