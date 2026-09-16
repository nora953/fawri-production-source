import crypto from "node:crypto";

const HOUR_SECONDS = 60 * 60;

export type SubscriptionGuaranteeAttribution =
  | "fawri"
  | "third_party"
  | "customer"
  | "unknown";

export type SubscriptionGuaranteeIncidentKind =
  | "material_outage"
  | "activation_failure";

export type SubscriptionGuaranteeBillingState = "paid" | "unpaid" | "unknown";

export type SubscriptionGuaranteeLifecycleState =
  | "pending_activation"
  | "active"
  | "expired"
  | "replies_exhausted"
  | "suspended";

export type SubscriptionGuaranteeResultStatus =
  | "not_eligible"
  | "eligible_for_extension"
  | "eligible_for_manual_refund_review"
  | "eligible_for_extension_and_manual_refund_review"
  | "manual_review_required";

export type SubscriptionGuaranteeIncidentEvidenceRole =
  | "qualifying_extension"
  | "refund_review"
  | "manual_review"
  | "excluded_attribution";

export type SubscriptionGuaranteePolicySnapshot = {
  policyRef: string;
  version: number;
  scope: "monthly_subscription";
  qualifyingOutageSeconds: number;
  refundReviewOutageSeconds: number;
  activationFailureRefundReview: boolean;
  autoQualifyingAttribution: "fawri";
  effectiveAt: string;
  supersededAt: string | null;
};

export type SubscriptionGuaranteeSubscriptionSnapshot = {
  merchantId: string;
  subscriptionId: string;
  subscriptionVersion: number;
  entitlementReference: string;
  planName: "silver" | "gold" | "diamond" | "trial";
  lifecycleState: SubscriptionGuaranteeLifecycleState;
  startsAt: string;
  expiresAt: string;
  billingState: SubscriptionGuaranteeBillingState;
  billingReference: string | null;
};

export type SubscriptionGuaranteeIncidentSnapshot = {
  id: string;
  merchantId: string;
  incidentKind: SubscriptionGuaranteeIncidentKind;
  attribution: SubscriptionGuaranteeAttribution;
  startsAt: string;
  endsAt: string | null;
  authoritySource: "server_ops" | "automated_monitor";
  authorityReference: string | null;
  version: number;
};

export type SubscriptionGuaranteeAssessmentEvidence = {
  incidentId: string;
  incidentVersion: number;
  attribution: SubscriptionGuaranteeAttribution;
  authoritySource: "server_ops" | "automated_monitor";
  authorityReference: string | null;
  startsAt: string;
  endsAt: string | null;
  role: SubscriptionGuaranteeIncidentEvidenceRole;
  includedSeconds: number;
};

export type SubscriptionGuaranteeAssessment = {
  assessmentId: string;
  merchantId: string;
  subscriptionId: string;
  subscriptionVersion: number;
  entitlementReference: string;
  policyRef: string;
  policyVersion: number;
  result: SubscriptionGuaranteeResultStatus;
  billingState: SubscriptionGuaranteeBillingState;
  billingReference: string | null;
  eligibleExtensionSeconds: number;
  qualifyingOutageSeconds: number;
  maxContinuousOutageSeconds: number;
  refundReviewEligible: boolean;
  manualReviewRequired: boolean;
  reasonCode: string;
  evaluatedAt: string;
  evidence: SubscriptionGuaranteeAssessmentEvidence[];
};

export type SubscriptionGuaranteeEvaluationRequest = {
  merchantId: string;
  subscriptionId: string;
  evaluatedAt?: Date;
};

export interface SubscriptionGuaranteeSubscriptionAuthority {
  loadSubscription(
    merchantId: string,
    subscriptionId: string,
  ): Promise<SubscriptionGuaranteeSubscriptionSnapshot | null>;
}

export interface SubscriptionGuaranteePolicyAuthority {
  loadPolicyForDate(
    effectiveAt: Date,
  ): Promise<SubscriptionGuaranteePolicySnapshot | null>;
}

export interface SubscriptionGuaranteeIncidentAuthority {
  listIncidents(
    merchantId: string,
    startsAt: Date,
    expiresAt: Date,
  ): Promise<SubscriptionGuaranteeIncidentSnapshot[]>;
}

export interface SubscriptionServiceGuaranteeAuthority
  extends SubscriptionGuaranteeSubscriptionAuthority,
    SubscriptionGuaranteePolicyAuthority,
    SubscriptionGuaranteeIncidentAuthority {}

export class ComposedSubscriptionServiceGuaranteeAuthority
  implements SubscriptionServiceGuaranteeAuthority
{
  constructor(
    private readonly subscriptions: SubscriptionGuaranteeSubscriptionAuthority,
    private readonly policies: SubscriptionGuaranteePolicyAuthority,
    private readonly incidents: SubscriptionGuaranteeIncidentAuthority,
  ) {}

  loadSubscription(merchantId: string, subscriptionId: string) {
    return this.subscriptions.loadSubscription(merchantId, subscriptionId);
  }

  loadPolicyForDate(effectiveAt: Date) {
    return this.policies.loadPolicyForDate(effectiveAt);
  }

  listIncidents(merchantId: string, startsAt: Date, expiresAt: Date) {
    return this.incidents.listIncidents(merchantId, startsAt, expiresAt);
  }
}

export class SubscriptionServiceGuaranteeAuthorityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SubscriptionServiceGuaranteeAuthorityError";
    this.code = code;
  }
}

type Interval = {
  startMs: number;
  endMs: number;
  incidentIds: string[];
};

type SqlResult<Row> = { rows: Row[] };

export interface SubscriptionGuaranteeSqlExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<SqlResult<Row>>;
}

export interface SubscriptionGuaranteeSqlClient extends SubscriptionGuaranteeSqlExecutor {
  transaction<T>(
    operation: (executor: SubscriptionGuaranteeSqlExecutor) => Promise<T>,
  ): Promise<T>;
}

function authorityError(code: string, message: string): never {
  throw new SubscriptionServiceGuaranteeAuthorityError(code, message);
}

function nonEmpty(value: unknown, max = 200): string {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
      "subscription guarantee authority is invalid",
    );
  }
  return text;
}

function timestamp(value: unknown): number {
  const parsed =
    value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
      "subscription guarantee authority is invalid",
    );
  }
  return parsed;
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
      "subscription guarantee authority is invalid",
    );
  }
  return parsed;
}

function rowString(row: Record<string, unknown>, key: string, max = 200): string {
  return nonEmpty(row[key], max);
}

function rowDate(row: Record<string, unknown>, key: string): string {
  return new Date(timestamp(row[key])).toISOString();
}

function entitlementReferenceFor(input: {
  merchantId: string;
  subscriptionId: string;
  version: number;
  planName: string;
  startsAt: string;
  expiresAt: string;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        input.merchantId,
        input.subscriptionId,
        input.version,
        input.planName,
        input.startsAt,
        input.expiresAt,
      ]),
    )
    .digest("hex");
  return `subscription-lifecycle-sha256:${digest}`;
}

export function createSubscriptionServiceGuaranteeV1Policy(input: {
  effectiveAt: string | Date;
  supersededAt?: string | Date | null;
}): SubscriptionGuaranteePolicySnapshot {
  const effectiveAt = new Date(timestamp(input.effectiveAt)).toISOString();
  const supersededAt = input.supersededAt
    ? new Date(timestamp(input.supersededAt)).toISOString()
    : null;
  if (supersededAt && timestamp(supersededAt) <= timestamp(effectiveAt)) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_POLICY_INVALID",
      "subscription guarantee policy is invalid",
    );
  }
  return Object.freeze({
    policyRef: "fawri-subscription-service-guarantee:v1",
    version: 1,
    scope: "monthly_subscription",
    qualifyingOutageSeconds: 24 * HOUR_SECONDS,
    refundReviewOutageSeconds: 72 * HOUR_SECONDS,
    activationFailureRefundReview: true,
    autoQualifyingAttribution: "fawri",
    effectiveAt,
    supersededAt,
  });
}

export class VersionedSubscriptionGuaranteePolicyAuthority
  implements SubscriptionGuaranteePolicyAuthority
{
  private readonly policies: readonly SubscriptionGuaranteePolicySnapshot[];

  constructor(policies: readonly SubscriptionGuaranteePolicySnapshot[]) {
    for (const policy of policies) validatePolicy(policy);
    this.policies = Object.freeze([...policies]);
  }

  async loadPolicyForDate(
    effectiveAt: Date,
  ): Promise<SubscriptionGuaranteePolicySnapshot | null> {
    const at = timestamp(effectiveAt);
    const matches = this.policies.filter((policy) => {
      const start = timestamp(policy.effectiveAt);
      const end = policy.supersededAt
        ? timestamp(policy.supersededAt)
        : Number.POSITIVE_INFINITY;
      return start <= at && at < end;
    });
    if (matches.length > 1) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_POLICY_AMBIGUOUS",
        "subscription guarantee policy is ambiguous",
      );
    }
    return matches[0] || null;
  }
}

export class DisabledSubscriptionGuaranteeIncidentAuthority
  implements SubscriptionGuaranteeIncidentAuthority
{
  async listIncidents(): Promise<SubscriptionGuaranteeIncidentSnapshot[]> {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_INCIDENT_AUTHORITY_UNAVAILABLE",
      "subscription guarantee incident authority is unavailable",
    );
  }
}

export class PostgresSubscriptionGuaranteeSubscriptionAuthority
  implements SubscriptionGuaranteeSubscriptionAuthority
{
  constructor(private readonly sql?: SubscriptionGuaranteeSqlExecutor) {}

  private async executor(): Promise<SubscriptionGuaranteeSqlExecutor> {
    if (this.sql) return this.sql;
    const { pool } = await import("@workspace/db");
    return {
      async query<Row extends Record<string, unknown>>(
        statement: string,
        values: readonly unknown[] = [],
      ): Promise<SqlResult<Row>> {
        const result = await pool.query(statement, Array.from(values));
        return { rows: result.rows as Row[] };
      },
    };
  }

  async loadSubscription(
    merchantId: string,
    subscriptionId: string,
  ): Promise<SubscriptionGuaranteeSubscriptionSnapshot | null> {
    const requestedMerchantId = nonEmpty(merchantId, 160);
    const requestedSubscriptionId = nonEmpty(subscriptionId, 160);
    const sql = await this.executor();
    const result = await sql.query(
      `SELECT subscription.id, subscription.merchant_id, subscription.plan_name,
              subscription.status, subscription.price_iqd, subscription.starts_at,
              subscription.expires_at, subscription.version,
              billing_order.id AS billing_order_id
       FROM subscriptions AS subscription
       LEFT JOIN saas_entitlement_applications AS application
         ON application.subscription_id = subscription.id
        AND application.merchant_id = subscription.merchant_id
        AND application.applied_at = subscription.starts_at
       LEFT JOIN saas_billing_orders AS billing_order
         ON billing_order.id = application.order_id
        AND billing_order.merchant_id = application.merchant_id
        AND billing_order.status IN ('paid', 'refunded')
       WHERE subscription.merchant_id = $1 AND subscription.id = $2
       LIMIT 2`,
      [requestedMerchantId, requestedSubscriptionId],
    );
    if (result.rows.length > 1) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_SUBSCRIPTION_AMBIGUOUS",
        "subscription guarantee subscription is ambiguous",
      );
    }
    const row = result.rows[0];
    if (!row) return null;
    if (rowString(row, "merchant_id", 160) !== requestedMerchantId) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION",
        "subscription guarantee tenant boundary violation",
      );
    }

    const resolvedSubscriptionId = rowString(row, "id", 160);
    if (resolvedSubscriptionId !== requestedSubscriptionId) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION",
        "subscription guarantee tenant boundary violation",
      );
    }
    const planName = rowString(
      row,
      "plan_name",
      40,
    ) as SubscriptionGuaranteeSubscriptionSnapshot["planName"];
    const lifecycleState = rowString(
      row,
      "status",
      40,
    ) as SubscriptionGuaranteeLifecycleState;
    if (!["silver", "gold", "diamond", "trial"].includes(planName)) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
        "subscription guarantee authority is invalid",
      );
    }
    if (
      ![
        "pending_activation",
        "active",
        "expired",
        "replies_exhausted",
        "suspended",
      ].includes(lifecycleState)
    ) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
        "subscription guarantee authority is invalid",
      );
    }
    const priceIqd = Number(row.price_iqd);
    if (!Number.isSafeInteger(priceIqd) || priceIqd < 0) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
        "subscription guarantee authority is invalid",
      );
    }
    const subscriptionVersion = positiveInteger(row.version);
    const startsAt = rowDate(row, "starts_at");
    const expiresAt = rowDate(row, "expires_at");
    if (timestamp(expiresAt) <= timestamp(startsAt)) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
        "subscription guarantee authority is invalid",
      );
    }

    const billingOrderId = row.billing_order_id
      ? rowString(row, "billing_order_id", 180)
      : null;
    const billingState: SubscriptionGuaranteeBillingState =
      planName === "trial" || priceIqd === 0
        ? "unpaid"
        : billingOrderId
          ? "paid"
          : "unknown";

    return {
      merchantId: requestedMerchantId,
      subscriptionId: resolvedSubscriptionId,
      subscriptionVersion,
      entitlementReference: entitlementReferenceFor({
        merchantId: requestedMerchantId,
        subscriptionId: resolvedSubscriptionId,
        version: subscriptionVersion,
        planName,
        startsAt,
        expiresAt,
      }),
      planName,
      lifecycleState,
      startsAt,
      expiresAt,
      billingState,
      billingReference: billingOrderId ? `saas-billing-order:${billingOrderId}` : null,
    };
  }
}

function clipIncident(
  incident: SubscriptionGuaranteeIncidentSnapshot,
  subscriptionStartMs: number,
  subscriptionEndMs: number,
): Interval | null {
  const startMs = Math.max(timestamp(incident.startsAt), subscriptionStartMs);
  if (!incident.endsAt) return null;
  const endMs = Math.min(timestamp(incident.endsAt), subscriptionEndMs);
  if (endMs <= startMs) return null;
  return { startMs, endMs, incidentIds: [incident.id] };
}

function intervalsOverlap(left: Interval, right: Interval): boolean {
  return left.startMs < right.endMs && right.startMs < left.endMs;
}

function mergeContinuousIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort(
    (left, right) => left.startMs - right.startMs || left.endMs - right.endMs,
  );
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.startMs > previous.endMs) {
      merged.push({ ...interval, incidentIds: [...interval.incidentIds] });
      continue;
    }
    previous.endMs = Math.max(previous.endMs, interval.endMs);
    previous.incidentIds = Array.from(
      new Set([...previous.incidentIds, ...interval.incidentIds]),
    );
  }

  return merged;
}

function seconds(interval: Interval): number {
  return Math.floor((interval.endMs - interval.startMs) / 1000);
}

function validatePolicy(policy: SubscriptionGuaranteePolicySnapshot): void {
  nonEmpty(policy.policyRef, 160);
  positiveInteger(policy.version);
  if (
    policy.scope !== "monthly_subscription" ||
    policy.autoQualifyingAttribution !== "fawri" ||
    !policy.activationFailureRefundReview
  ) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_POLICY_INVALID",
      "subscription guarantee policy is invalid",
    );
  }
  const qualifying = positiveInteger(policy.qualifyingOutageSeconds);
  const refund = positiveInteger(policy.refundReviewOutageSeconds);
  if (refund <= qualifying) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_POLICY_INVALID",
      "subscription guarantee policy is invalid",
    );
  }
  const effectiveAt = timestamp(policy.effectiveAt);
  if (policy.supersededAt && timestamp(policy.supersededAt) <= effectiveAt) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_POLICY_INVALID",
      "subscription guarantee policy is invalid",
    );
  }
}

function validateSubscription(
  subscription: SubscriptionGuaranteeSubscriptionSnapshot,
  merchantId: string,
  subscriptionId: string,
): { startMs: number; endMs: number } {
  if (
    nonEmpty(subscription.merchantId, 160) !== merchantId ||
    nonEmpty(subscription.subscriptionId, 160) !== subscriptionId
  ) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION",
      "subscription guarantee tenant boundary violation",
    );
  }
  positiveInteger(subscription.subscriptionVersion);
  nonEmpty(subscription.entitlementReference, 200);
  if (!["silver", "gold", "diamond", "trial"].includes(subscription.planName)) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
      "subscription guarantee authority is invalid",
    );
  }
  if (
    ![
      "pending_activation",
      "active",
      "expired",
      "replies_exhausted",
      "suspended",
    ].includes(subscription.lifecycleState)
  ) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
      "subscription guarantee authority is invalid",
    );
  }
  if (!["paid", "unpaid", "unknown"].includes(subscription.billingState)) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
      "subscription guarantee authority is invalid",
    );
  }
  const startMs = timestamp(subscription.startsAt);
  const endMs = timestamp(subscription.expiresAt);
  if (endMs <= startMs) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
      "subscription guarantee authority is invalid",
    );
  }
  return { startMs, endMs };
}

function baseAssessment(params: {
  subscription: SubscriptionGuaranteeSubscriptionSnapshot;
  policy: SubscriptionGuaranteePolicySnapshot;
  evaluatedAt: Date;
}): SubscriptionGuaranteeAssessment {
  return {
    assessmentId: `subscription-guarantee-assessment-${crypto.randomUUID()}`,
    merchantId: params.subscription.merchantId,
    subscriptionId: params.subscription.subscriptionId,
    subscriptionVersion: params.subscription.subscriptionVersion,
    entitlementReference: params.subscription.entitlementReference,
    policyRef: params.policy.policyRef,
    policyVersion: params.policy.version,
    result: "not_eligible",
    billingState: params.subscription.billingState,
    billingReference: params.subscription.billingReference,
    eligibleExtensionSeconds: 0,
    qualifyingOutageSeconds: 0,
    maxContinuousOutageSeconds: 0,
    refundReviewEligible: false,
    manualReviewRequired: false,
    reasonCode: "NO_QUALIFYING_FAWRI_OUTAGE",
    evaluatedAt: params.evaluatedAt.toISOString(),
    evidence: [],
  };
}

function evidenceFromIncident(
  incident: SubscriptionGuaranteeIncidentSnapshot,
  role: SubscriptionGuaranteeIncidentEvidenceRole,
  includedSeconds: number,
): SubscriptionGuaranteeAssessmentEvidence {
  return {
    incidentId: incident.id,
    incidentVersion: incident.version,
    attribution: incident.attribution,
    authoritySource: incident.authoritySource,
    authorityReference: incident.authorityReference,
    startsAt: incident.startsAt,
    endsAt: incident.endsAt,
    role,
    includedSeconds,
  };
}

function incidentEvidenceRole(
  incident: SubscriptionGuaranteeIncidentSnapshot,
  extensionIncidentIds: Set<string>,
  refundIncidentIds: Set<string>,
): SubscriptionGuaranteeIncidentEvidenceRole {
  if (incident.attribution !== "fawri") return "excluded_attribution";
  if (refundIncidentIds.has(incident.id)) return "refund_review";
  if (extensionIncidentIds.has(incident.id)) return "qualifying_extension";
  return "excluded_attribution";
}

export async function evaluateSubscriptionServiceGuarantee(
  authority: SubscriptionServiceGuaranteeAuthority,
  request: SubscriptionGuaranteeEvaluationRequest,
): Promise<SubscriptionGuaranteeAssessment> {
  const merchantId = nonEmpty(request.merchantId, 160);
  const subscriptionId = nonEmpty(request.subscriptionId, 160);
  const evaluatedAt = request.evaluatedAt || new Date();
  timestamp(evaluatedAt);

  const subscription = await authority.loadSubscription(merchantId, subscriptionId);
  if (!subscription) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_SUBSCRIPTION_MISSING",
      "subscription guarantee subscription is unavailable",
    );
  }
  const { startMs, endMs } = validateSubscription(
    subscription,
    merchantId,
    subscriptionId,
  );

  const policy = await authority.loadPolicyForDate(new Date(startMs));
  if (!policy) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_POLICY_MISSING",
      "subscription guarantee policy is unavailable",
    );
  }
  validatePolicy(policy);
  const policyEffectiveAt = timestamp(policy.effectiveAt);
  const policySupersededAt = policy.supersededAt
    ? timestamp(policy.supersededAt)
    : null;
  if (
    policyEffectiveAt > startMs ||
    (policySupersededAt !== null && policySupersededAt <= startMs)
  ) {
    authorityError(
      "SUBSCRIPTION_GUARANTEE_POLICY_MISMATCH",
      "historical subscription guarantee policy is unavailable",
    );
  }

  const assessment = baseAssessment({ subscription, policy, evaluatedAt });

  if (subscription.planName === "trial" || subscription.billingState === "unpaid") {
    assessment.reasonCode = "SUBSCRIPTION_NOT_PAID";
    return assessment;
  }
  if (["expired", "replies_exhausted", "suspended"].includes(subscription.lifecycleState)) {
    assessment.reasonCode = "SUBSCRIPTION_NOT_ACTIVE";
    return assessment;
  }

  const incidents = await authority.listIncidents(
    merchantId,
    new Date(startMs),
    new Date(endMs),
  );

  const clipped = new Map<string, Interval>();
  const incidentById = new Map<string, SubscriptionGuaranteeIncidentSnapshot>();
  let hasUnknownAttribution = false;
  let hasOpenIncident = false;
  const fawriIntervals: Interval[] = [];
  const excludedIntervals: Interval[] = [];
  const activationFailureIds = new Set<string>();

  for (const incident of incidents) {
    if (nonEmpty(incident.merchantId, 160) !== merchantId) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION",
        "subscription guarantee tenant boundary violation",
      );
    }
    const incidentId = nonEmpty(incident.id, 200);
    if (incidentById.has(incidentId)) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_INCIDENT_AMBIGUOUS",
        "subscription guarantee incident evidence is ambiguous",
      );
    }
    incidentById.set(incidentId, incident);
    positiveInteger(incident.version);
    if (!["server_ops", "automated_monitor"].includes(incident.authoritySource)) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_PROVENANCE_INVALID",
        "subscription guarantee incident provenance is invalid",
      );
    }
    if (!["fawri", "third_party", "customer", "unknown"].includes(incident.attribution)) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
        "subscription guarantee authority is invalid",
      );
    }
    if (!["material_outage", "activation_failure"].includes(incident.incidentKind)) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
        "subscription guarantee authority is invalid",
      );
    }
    timestamp(incident.startsAt);
    if (!incident.endsAt) {
      hasOpenIncident = true;
      if (incident.attribution === "unknown") hasUnknownAttribution = true;
      continue;
    }
    if (timestamp(incident.endsAt) <= timestamp(incident.startsAt)) {
      authorityError(
        "SUBSCRIPTION_GUARANTEE_STATE_INVALID",
        "subscription guarantee authority is invalid",
      );
    }
    const interval = clipIncident(incident, startMs, endMs);
    if (!interval) continue;
    clipped.set(incidentId, interval);

    if (incident.attribution === "unknown") hasUnknownAttribution = true;
    if (incident.attribution === "fawri") {
      fawriIntervals.push(interval);
      if (incident.incidentKind === "activation_failure") {
        activationFailureIds.add(incidentId);
      }
    } else {
      excludedIntervals.push(interval);
    }
  }

  const conflictingAttribution = fawriIntervals.some((fawri) =>
    excludedIntervals.some((other) => intervalsOverlap(fawri, other)),
  );

  if (hasUnknownAttribution || hasOpenIncident || conflictingAttribution) {
    assessment.result = "manual_review_required";
    assessment.manualReviewRequired = true;
    assessment.reasonCode = hasUnknownAttribution
      ? "OUTAGE_ATTRIBUTION_UNKNOWN"
      : hasOpenIncident
        ? "OUTAGE_NOT_FINALIZED"
        : "OUTAGE_ATTRIBUTION_CONFLICT";
    assessment.evidence = incidents.map((incident) => {
      const interval = clipped.get(incident.id);
      return evidenceFromIncident(
        incident,
        incident.attribution === "unknown" ? "manual_review" : "excluded_attribution",
        interval ? seconds(interval) : 0,
      );
    });
    return assessment;
  }

  const mergedFawri = mergeContinuousIntervals(fawriIntervals);
  const qualifyingIntervals = mergedFawri.filter(
    (interval) => seconds(interval) > policy.qualifyingOutageSeconds,
  );
  const refundIntervals = mergedFawri.filter(
    (interval) => seconds(interval) > policy.refundReviewOutageSeconds,
  );
  const extensionIncidentIds = new Set(
    qualifyingIntervals.flatMap((item) => item.incidentIds),
  );
  const refundIncidentIds = new Set(
    refundIntervals.flatMap((item) => item.incidentIds),
  );
  const eligibleExtensionSeconds = qualifyingIntervals.reduce(
    (total, interval) => total + seconds(interval),
    0,
  );
  const maxContinuousOutageSeconds = mergedFawri.reduce(
    (maximum, interval) => Math.max(maximum, seconds(interval)),
    0,
  );

  const activationFailureEligible =
    policy.activationFailureRefundReview &&
    subscription.lifecycleState === "pending_activation" &&
    activationFailureIds.size > 0;
  const refundReviewEligible = refundIntervals.length > 0 || activationFailureEligible;
  const extensionEligible =
    subscription.lifecycleState === "active" && eligibleExtensionSeconds > 0;

  assessment.qualifyingOutageSeconds = extensionEligible
    ? eligibleExtensionSeconds
    : 0;
  assessment.maxContinuousOutageSeconds = maxContinuousOutageSeconds;

  if (subscription.billingState !== "paid") {
    if (refundReviewEligible) {
      assessment.result = "eligible_for_manual_refund_review";
      assessment.refundReviewEligible = true;
      assessment.manualReviewRequired = true;
      assessment.reasonCode = activationFailureEligible
        ? "FAWRI_ACTIVATION_FAILURE_BILLING_REVIEW_REQUIRED"
        : "FAWRI_OUTAGE_OVER_72H_BILLING_REVIEW_REQUIRED";
    } else if (extensionEligible) {
      assessment.result = "manual_review_required";
      assessment.manualReviewRequired = true;
      assessment.reasonCode = "BILLING_AUTHORITY_UNAVAILABLE";
    }
  } else {
    assessment.eligibleExtensionSeconds = extensionEligible
      ? eligibleExtensionSeconds
      : 0;
    if (extensionEligible && refundReviewEligible) {
      assessment.result = "eligible_for_extension_and_manual_refund_review";
      assessment.refundReviewEligible = true;
      assessment.reasonCode = activationFailureEligible
        ? "FAWRI_ACTIVATION_FAILURE_AND_EXTENSION_ELIGIBLE"
        : "FAWRI_OUTAGE_OVER_72H";
    } else if (refundReviewEligible) {
      assessment.result = "eligible_for_manual_refund_review";
      assessment.refundReviewEligible = true;
      assessment.reasonCode = activationFailureEligible
        ? "FAWRI_ACTIVATION_FAILURE"
        : "FAWRI_OUTAGE_OVER_72H";
    } else if (extensionEligible) {
      assessment.result = "eligible_for_extension";
      assessment.reasonCode = "FAWRI_OUTAGE_OVER_24H";
    }
  }

  assessment.evidence = incidents.map((incident) => {
    const interval = clipped.get(incident.id);
    return evidenceFromIncident(
      incident,
      incidentEvidenceRole(incident, extensionIncidentIds, refundIncidentIds),
      interval ? seconds(interval) : 0,
    );
  });

  return assessment;
}

class DefaultSubscriptionGuaranteeSqlClient
  implements SubscriptionGuaranteeSqlClient
{
  async query<Row extends Record<string, unknown>>(
    statement: string,
    values: readonly unknown[] = [],
  ): Promise<SqlResult<Row>> {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(statement, Array.from(values));
    return { rows: result.rows as Row[] };
  }

  async transaction<T>(
    operation: (executor: SubscriptionGuaranteeSqlExecutor) => Promise<T>,
  ): Promise<T> {
    const { pool } = await import("@workspace/db");
    const connection = await pool.connect();
    const executor: SubscriptionGuaranteeSqlExecutor = {
      async query<Row extends Record<string, unknown>>(
        statement: string,
        values: readonly unknown[] = [],
      ): Promise<SqlResult<Row>> {
        const result = await connection.query(statement, Array.from(values));
        return { rows: result.rows as Row[] };
      },
    };
    try {
      await connection.query("BEGIN");
      const result = await operation(executor);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await connection.query("ROLLBACK");
      } catch {
        // Preserve the original fail-closed audit persistence error.
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}

function auditMetadata(
  assessment: SubscriptionGuaranteeAssessment,
): Record<string, string | number | boolean | null> {
  return {
    result: assessment.result,
    billingState: assessment.billingState,
    billingReference: assessment.billingReference,
    policyRef: assessment.policyRef,
    policyVersion: assessment.policyVersion,
    subscriptionVersion: assessment.subscriptionVersion,
    entitlementReference: assessment.entitlementReference,
    eligibleExtensionSeconds: assessment.eligibleExtensionSeconds,
    qualifyingOutageSeconds: assessment.qualifyingOutageSeconds,
    maxContinuousOutageSeconds: assessment.maxContinuousOutageSeconds,
    refundReviewEligible: assessment.refundReviewEligible,
    manualReviewRequired: assessment.manualReviewRequired,
    evaluatedAt: assessment.evaluatedAt,
  };
}

export async function recordSubscriptionServiceGuaranteeAssessmentAudit(
  assessment: SubscriptionGuaranteeAssessment,
  sqlClient: SubscriptionGuaranteeSqlClient = new DefaultSubscriptionGuaranteeSqlClient(),
): Promise<void> {
  nonEmpty(assessment.merchantId, 160);
  nonEmpty(assessment.subscriptionId, 160);
  nonEmpty(assessment.assessmentId, 200);
  nonEmpty(assessment.entitlementReference, 200);
  nonEmpty(assessment.policyRef, 160);
  positiveInteger(assessment.policyVersion);
  positiveInteger(assessment.subscriptionVersion);

  await sqlClient.transaction(async (executor) => {
    await executor.query(
      `INSERT INTO audit_events
       (id, actor_kind, actor_account_id, merchant_id, action_type,
        entity_type, entity_id, reason_code, details, metadata,
        ip_address, user_agent, request_id, previous_hash, event_hash, created_at)
       VALUES ($1, 'system', NULL, $2, 'subscription_guarantee_assessed',
               'subscription_service_guarantee_assessment', $3, $4, NULL,
               $5::jsonb, NULL, NULL, NULL, NULL, NULL, NOW())`,
      [
        `audit-${crypto.randomUUID()}`,
        assessment.merchantId,
        assessment.assessmentId,
        assessment.reasonCode,
        JSON.stringify(auditMetadata(assessment)),
      ],
    );

    for (const evidence of assessment.evidence) {
      await executor.query(
        `INSERT INTO audit_events
         (id, actor_kind, actor_account_id, merchant_id, action_type,
          entity_type, entity_id, reason_code, details, metadata,
          ip_address, user_agent, request_id, previous_hash, event_hash, created_at)
         VALUES ($1, 'system', NULL, $2, 'subscription_guarantee_incident_evidence',
                 'subscription_service_guarantee_incident', $3, $4, NULL,
                 $5::jsonb, NULL, NULL, NULL, NULL, NULL, NOW())`,
        [
          `audit-${crypto.randomUUID()}`,
          assessment.merchantId,
          evidence.incidentId,
          evidence.role,
          JSON.stringify({
            assessmentId: assessment.assessmentId,
            incidentVersion: evidence.incidentVersion,
            attribution: evidence.attribution,
            authoritySource: evidence.authoritySource,
            authorityReference: evidence.authorityReference,
            startsAt: evidence.startsAt,
            endsAt: evidence.endsAt,
            role: evidence.role,
            includedSeconds: evidence.includedSeconds,
          }),
        ],
      );
    }
  });
}
