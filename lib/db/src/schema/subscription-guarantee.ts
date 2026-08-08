import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { merchants } from "./merchants";
import { subscriptions } from "./subscriptions";

export const subscriptionGuaranteePolicies = pgTable(
  "subscription_guarantee_policies",
  {
    policyRef: text("policy_ref").primaryKey(),
    version: integer("version").notNull(),
    scope: text("scope").notNull().default("monthly_subscription"),
    qualifyingOutageSeconds: integer("qualifying_outage_seconds")
      .notNull()
      .default(24 * 60 * 60),
    refundReviewOutageSeconds: integer("refund_review_outage_seconds")
      .notNull()
      .default(72 * 60 * 60),
    activationFailureRefundReview: boolean("activation_failure_refund_review")
      .notNull()
      .default(true),
    autoQualifyingAttribution: text("auto_qualifying_attribution")
      .notNull()
      .default("fawri"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    refVersionUnique: unique("subscription_guarantee_policy_ref_version_unique").on(
      table.policyRef,
      table.version,
    ),
    versionUnique: uniqueIndex("subscription_guarantee_policy_version_unique").on(
      table.version,
    ),
    effectiveIndex: index("subscription_guarantee_policy_effective_idx").on(
      table.effectiveAt,
      table.supersededAt,
    ),
    versionCheck: check(
      "subscription_guarantee_policy_version_check",
      sql`${table.version} > 0`,
    ),
    scopeCheck: check(
      "subscription_guarantee_policy_scope_check",
      sql`${table.scope} = 'monthly_subscription'`,
    ),
    thresholdsCheck: check(
      "subscription_guarantee_policy_thresholds_check",
      sql`${table.qualifyingOutageSeconds} > 0 AND ${table.refundReviewOutageSeconds} > ${table.qualifyingOutageSeconds}`,
    ),
    attributionCheck: check(
      "subscription_guarantee_policy_attribution_check",
      sql`${table.autoQualifyingAttribution} = 'fawri'`,
    ),
    effectiveRangeCheck: check(
      "subscription_guarantee_policy_effective_range_check",
      sql`${table.supersededAt} IS NULL OR ${table.supersededAt} > ${table.effectiveAt}`,
    ),
  }),
);

export const subscriptionGuaranteeIncidents = pgTable(
  "subscription_guarantee_incidents",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    incidentKind: text("incident_kind").notNull(),
    attribution: text("attribution").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    authoritySource: text("authority_source").notNull(),
    authorityReference: text("authority_reference"),
    version: integer("version").notNull().default(1),
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
    idMerchantUnique: unique("subscription_guarantee_incident_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    merchantTimeIndex: index("subscription_guarantee_incident_merchant_time_idx").on(
      table.merchantId,
      table.startsAt,
      table.endsAt,
    ),
    kindCheck: check(
      "subscription_guarantee_incident_kind_check",
      sql`${table.incidentKind} IN ('material_outage', 'activation_failure')`,
    ),
    attributionCheck: check(
      "subscription_guarantee_incident_attribution_check",
      sql`${table.attribution} IN ('fawri', 'third_party', 'customer', 'unknown')`,
    ),
    authoritySourceCheck: check(
      "subscription_guarantee_incident_authority_source_check",
      sql`${table.authoritySource} IN ('server_ops', 'automated_monitor')`,
    ),
    timeRangeCheck: check(
      "subscription_guarantee_incident_time_range_check",
      sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    versionCheck: check(
      "subscription_guarantee_incident_version_check",
      sql`${table.version} > 0`,
    ),
    updatedCheck: check(
      "subscription_guarantee_incident_updated_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  }),
);

export const subscriptionGuaranteeAssessments = pgTable(
  "subscription_guarantee_assessments",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    policyRef: text("policy_ref").notNull(),
    policyVersion: integer("policy_version").notNull(),
    result: text("result").notNull(),
    billingState: text("billing_state").notNull(),
    billingReference: text("billing_reference"),
    eligibleExtensionSeconds: integer("eligible_extension_seconds")
      .notNull()
      .default(0),
    qualifyingOutageSeconds: integer("qualifying_outage_seconds")
      .notNull()
      .default(0),
    maxContinuousOutageSeconds: integer("max_continuous_outage_seconds")
      .notNull()
      .default(0),
    refundReviewEligible: boolean("refund_review_eligible")
      .notNull()
      .default(false),
    manualReviewRequired: boolean("manual_review_required")
      .notNull()
      .default(false),
    reasonCode: text("reason_code").notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idMerchantUnique: unique("subscription_guarantee_assessment_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    subscriptionTenantForeignKey: foreignKey({
      name: "subscription_guarantee_assessment_subscription_merchant_fk",
      columns: [table.subscriptionId, table.merchantId],
      foreignColumns: [subscriptions.id, subscriptions.merchantId],
    }).onDelete("cascade"),
    policyVersionForeignKey: foreignKey({
      name: "subscription_guarantee_assessment_policy_version_fk",
      columns: [table.policyRef, table.policyVersion],
      foreignColumns: [
        subscriptionGuaranteePolicies.policyRef,
        subscriptionGuaranteePolicies.version,
      ],
    }).onDelete("restrict"),
    merchantCreatedIndex: index("subscription_guarantee_assessment_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
    subscriptionCreatedIndex: index(
      "subscription_guarantee_assessment_subscription_created_idx",
    ).on(table.subscriptionId, table.createdAt),
    resultCheck: check(
      "subscription_guarantee_assessment_result_check",
      sql`${table.result} IN ('not_eligible', 'eligible_for_extension', 'eligible_for_manual_refund_review', 'eligible_for_extension_and_manual_refund_review', 'manual_review_required')`,
    ),
    billingStateCheck: check(
      "subscription_guarantee_assessment_billing_state_check",
      sql`${table.billingState} IN ('paid', 'unpaid', 'unknown')`,
    ),
    nonnegativeCheck: check(
      "subscription_guarantee_assessment_nonnegative_check",
      sql`${table.eligibleExtensionSeconds} >= 0 AND ${table.qualifyingOutageSeconds} >= 0 AND ${table.maxContinuousOutageSeconds} >= 0`,
    ),
    policyVersionCheck: check(
      "subscription_guarantee_assessment_policy_version_check",
      sql`${table.policyVersion} > 0`,
    ),
  }),
);

export const subscriptionGuaranteeAssessmentIncidents = pgTable(
  "subscription_guarantee_assessment_incidents",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id").notNull(),
    incidentId: text("incident_id").notNull(),
    merchantId: text("merchant_id").notNull(),
    role: text("role").notNull(),
    includedSeconds: integer("included_seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    assessmentTenantForeignKey: foreignKey({
      name: "subscription_guarantee_assessment_incident_assessment_tenant_fk",
      columns: [table.assessmentId, table.merchantId],
      foreignColumns: [
        subscriptionGuaranteeAssessments.id,
        subscriptionGuaranteeAssessments.merchantId,
      ],
    }).onDelete("cascade"),
    incidentTenantForeignKey: foreignKey({
      name: "subscription_guarantee_assessment_incident_incident_tenant_fk",
      columns: [table.incidentId, table.merchantId],
      foreignColumns: [
        subscriptionGuaranteeIncidents.id,
        subscriptionGuaranteeIncidents.merchantId,
      ],
    }).onDelete("restrict"),
    assessmentIncidentUnique: uniqueIndex(
      "subscription_guarantee_assessment_incident_unique",
    ).on(table.assessmentId, table.incidentId),
    roleCheck: check(
      "subscription_guarantee_assessment_incident_role_check",
      sql`${table.role} IN ('qualifying_extension', 'refund_review', 'manual_review', 'excluded_attribution')`,
    ),
    includedSecondsCheck: check(
      "subscription_guarantee_assessment_incident_seconds_check",
      sql`${table.includedSeconds} >= 0`,
    ),
  }),
);

export type SubscriptionGuaranteePolicy =
  typeof subscriptionGuaranteePolicies.$inferSelect;
export type SubscriptionGuaranteeIncident =
  typeof subscriptionGuaranteeIncidents.$inferSelect;
export type SubscriptionGuaranteeAssessment =
  typeof subscriptionGuaranteeAssessments.$inferSelect;
export type SubscriptionGuaranteeAssessmentIncident =
  typeof subscriptionGuaranteeAssessmentIncidents.$inferSelect;
