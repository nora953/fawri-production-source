import crypto from "node:crypto";

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
  role: SubscriptionGuaranteeIncidentEvidenceRole;
  includedSeconds: number;
};

export type SubscriptionGuaranteeAssessment = {
  assessmentId: string;
  merchantId: string;
  subscriptionId: string;
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

export interface SubscriptionServiceGuaranteeAuthority {
  loadSubscription(
    merchantId: string,
    subscriptionId: string,
  ): Promise<SubscriptionGuaranteeSubscriptionSnapshot | null>;
  loadPolicyForDate(
    effectiveAt: Date,
  ): Promise<SubscriptionGuaranteePolicySnapshot | null>;
  listIncidents(
    merchantId: string,
    startsAt: Date,
    expiresAt: Date,
  ): Promise<SubscriptionGuaranteeIncidentSnapshot[]>;
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

function authorityError(code: string, message: string): never {
  throw new SubscriptionServiceGuaranteeAuthorityError(code, message);
}

function nonEmpty(value: unknown, max = 200): string {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) {
    authorityError("SUBSCRIPTION_GUARANTEE_STATE_INVALID", "subscription guarantee authority is invalid");
  }
  return text;
}

function timestamp(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    authorityError("SUBSCRIPTION_GUARANTEE_STATE_INVALID", "subscription guarantee authority is invalid");
  }
  return parsed;
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    authorityError("SUBSCRIPTION_GUARANTEE_STATE_INVALID", "subscription guarantee authority is invalid");
  }
  return parsed;
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

function baseAssessment(params: {
  subscription: SubscriptionGuaranteeSubscriptionSnapshot;
  policy: SubscriptionGuaranteePolicySnapshot;
  evaluatedAt: Date;
}): SubscriptionGuaranteeAssessment {
  return {
    assessmentId: `subscription-guarantee-assessment-${crypto.randomUUID()}`,
    merchantId: params.subscription.merchantId,
    subscriptionId: params.subscription.subscriptionId,
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

function validatePolicy(policy: SubscriptionGuaranteePolicySnapshot): void {
  nonEmpty(policy.policyRef, 160);
  positiveInteger(policy.version);
  if (
    policy.scope !== "monthly_subscription" ||
    policy.autoQualifyingAttribution !== "fawri" ||
    !policy.activationFailureRefundReview
  ) {
    authorityError("SUBSCRIPTION_GUARANTEE_POLICY_INVALID", "subscription guarantee policy is invalid");
  }
  const qualifying = positiveInteger(policy.qualifyingOutageSeconds);
  const refund = positiveInteger(policy.refundReviewOutageSeconds);
  if (refund <= qualifying) {
    authorityError("SUBSCRIPTION_GUARANTEE_POLICY_INVALID", "subscription guarantee policy is invalid");
  }
  const effectiveAt = timestamp(policy.effectiveAt);
  if (policy.supersededAt && timestamp(policy.supersededAt) <= effectiveAt) {
    authorityError("SUBSCRIPTION_GUARANTEE_POLICY_INVALID", "subscription guarantee policy is invalid");
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
    authorityError("SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION", "subscription guarantee tenant boundary violation");
  }
  if (!["silver", "gold", "diamond", "trial"].includes(subscription.planName)) {
    authorityError("SUBSCRIPTION_GUARANTEE_STATE_INVALID", "subscription guarantee authority is invalid");
  }
  if (!["paid", "unpaid", "unknown"].includes(subscription.billingState)) {
    authorityError("SUBSCRIPTION_GUARANTEE_STATE_INVALID", "subscription guarantee authority is invalid");
  }
  const startMs = timestamp(subscription.startsAt);
  const endMs = timestamp(subscription.expiresAt);
  if (endMs <= startMs) {
    authorityError("SUBSCRIPTION_GUARANTEE_STATE_INVALID", "subscription guarantee authority is invalid");
  }
  return { startMs, endMs };
}

function incidentEvidenceRole(
  incident: SubscriptionGuaranteeIncidentSnapshot,
  extensionIncidentIds: Set<string>,
  refundIncidentIds: Set<string>,
  manualReview: boolean,
): SubscriptionGuaranteeIncidentEvidenceRole {
  if (manualReview && incident.attribution === "unknown") return "manual_review";
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
    authorityError("SUBSCRIPTION_GUARANTEE_SUBSCRIPTION_MISSING", "subscription guarantee subscription is unavailable");
  }
  const { startMs, endMs } = validateSubscription(subscription, merchantId, subscriptionId);

  const policy = await authority.loadPolicyForDate(new Date(startMs));
  if (!policy) {
    authorityError("SUBSCRIPTION_GUARANTEE_POLICY_MISSING", "subscription guarantee policy is unavailable");
  }
  validatePolicy(policy);
  const policyEffectiveAt = timestamp(policy.effectiveAt);
  const policySupersededAt = policy.supersededAt ? timestamp(policy.supersededAt) : null;
  if (policyEffectiveAt > startMs || (policySupersededAt !== null && policySupersededAt <= startMs)) {
    authorityError("SUBSCRIPTION_GUARANTEE_POLICY_MISMATCH", "historical subscription guarantee policy is unavailable");
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
  let hasUnknownAttribution = false;
  let hasOpenIncident = false;
  const fawriIntervals: Interval[] = [];
  const excludedIntervals: Interval[] = [];
  const activationFailureIds = new Set<string>();

  for (const incident of incidents) {
    if (nonEmpty(incident.merchantId, 160) !== merchantId) {
      authorityError("SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION", "subscription guarantee tenant boundary violation");
    }
    nonEmpty(incident.id, 200);
    positiveInteger(incident.version);
    if (!["server_ops", "automated_monitor"].includes(incident.authoritySource)) {
      authorityError("SUBSCRIPTION_GUARANTEE_PROVENANCE_INVALID", "subscription guarantee incident provenance is invalid");
    }
    if (!["fawri", "third_party", "customer", "unknown"].includes(incident.attribution)) {
      authorityError("SUBSCRIPTION_GUARANTEE_STATE_INVALID", "subscription guarantee authority is invalid");
    }
    if (!incident.endsAt) {
      hasOpenIncident = true;
      if (incident.attribution === "unknown") hasUnknownAttribution = true;
      continue;
    }
    const interval = clipIncident(incident, startMs, endMs);
    if (!interval) continue;
    clipped.set(incident.id, interval);

    if (incident.attribution === "unknown") hasUnknownAttribution = true;
    if (incident.attribution === "fawri") {
      fawriIntervals.push(interval);
      if (incident.incidentKind === "activation_failure") {
        activationFailureIds.add(incident.id);
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
    assessment.evidence = incidents.map((incident) => ({
      incidentId: incident.id,
      role: incident.attribution === "unknown" ? "manual_review" : "excluded_attribution",
      includedSeconds: clipped.has(incident.id) ? seconds(clipped.get(incident.id)!) : 0,
    }));
    return assessment;
  }

  const mergedFawri = mergeContinuousIntervals(fawriIntervals);
  const qualifyingIntervals = mergedFawri.filter(
    (interval) => seconds(interval) > policy.qualifyingOutageSeconds,
  );
  const refundIntervals = mergedFawri.filter(
    (interval) => seconds(interval) > policy.refundReviewOutageSeconds,
  );
  const extensionIncidentIds = new Set(qualifyingIntervals.flatMap((item) => item.incidentIds));
  const refundIncidentIds = new Set(refundIntervals.flatMap((item) => item.incidentIds));
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

  assessment.eligibleExtensionSeconds = extensionEligible ? eligibleExtensionSeconds : 0;
  assessment.qualifyingOutageSeconds = extensionEligible ? eligibleExtensionSeconds : 0;
  assessment.maxContinuousOutageSeconds = maxContinuousOutageSeconds;

  if (subscription.billingState !== "paid") {
    if (extensionEligible || refundReviewEligible) {
      assessment.result = "manual_review_required";
      assessment.manualReviewRequired = true;
      assessment.reasonCode = "BILLING_AUTHORITY_UNAVAILABLE";
    } else {
      assessment.reasonCode = "NO_QUALIFYING_FAWRI_OUTAGE";
    }
  } else if (extensionEligible && refundReviewEligible) {
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

  assessment.evidence = incidents.map((incident) => {
    const interval = clipped.get(incident.id);
    return {
      incidentId: incident.id,
      role: incidentEvidenceRole(
        incident,
        extensionIncidentIds,
        refundIncidentIds,
        assessment.manualReviewRequired,
      ),
      includedSeconds: interval ? seconds(interval) : 0,
    };
  });

  return assessment;
}

type SqlResult<Row> = { rows: Row[] };

export interface SubscriptionGuaranteeSqlExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<SqlResult<Row>>;
}

function rowString(row: Record<string, unknown>, key: string, max = 200): string {
  return nonEmpty(row[key], max);
}

function rowDate(row: Record<string, unknown>, key: string): string {
  return new Date(timestamp(row[key])).toISOString();
}

export class PostgresSubscriptionServiceGuaranteeAuthority
  implements SubscriptionServiceGuaranteeAuthority
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
    const sql = await this.executor();
    const result = await sql.query(`
SELECT id, merchant_id, plan_name, status, price_iqd, starts_at, expires_at
FROM subscriptions
WHERE merchant_id = $1 AND id = $2
LIMIT 2`, [merchantId, subscriptionId]);
    if (result.rows.length > 1) {
      authorityError("SUBSCRIPTION_GUARANTEE_SUBSCRIPTION_AMBIGUOUS", "subscription guarantee subscription is ambiguous");
    }
    const row = result.rows[0];
    if (!row) return null;
    if (rowString(row, "merchant_id", 160) !== merchantId) {
      authorityError("SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION", "subscription guarantee tenant boundary violation");
    }
    const planName = rowString(row, "plan_name", 40) as SubscriptionGuaranteeSubscriptionSnapshot["planName"];
    const lifecycleState = rowString(row, "status", 40) as SubscriptionGuaranteeLifecycleState;
    const priceIqd = Number(row.price_iqd);
    if (!Number.isSafeInteger(priceIqd) || priceIqd < 0) {
      authorityError("SUBSCRIPTION_GUARANTEE_STATE_INVALID", "subscription guarantee authority is invalid");
    }

    // The current repository has a subscription lifecycle but no authoritative
    // SaaS payment-transaction/refund ledger. A positive configured price is not
    // proof that money was paid, so paid plans remain billing=unknown here.
    const billingState: SubscriptionGuaranteeBillingState =
      planName === "trial" || priceIqd === 0 ? "unpaid" : "unknown";

    return {
      merchantId,
      subscriptionId: rowString(row, "id", 160),
      planName,
      lifecycleState,
      startsAt: rowDate(row, "starts_at"),
      expiresAt: rowDate(row, "expires_at"),
      billingState,
      billingReference: null,
    };
  }

  async loadPolicyForDate(
    effectiveAt: Date,
  ): Promise<SubscriptionGuaranteePolicySnapshot | null> {
    const sql = await this.executor();
    const result = await sql.query(`
SELECT policy_ref, version, scope, qualifying_outage_seconds,
       refund_review_outage_seconds, activation_failure_refund_review,
       auto_qualifying_attribution, effective_at, superseded_at
FROM subscription_guarantee_policies
WHERE effective_at <= $1
  AND (superseded_at IS NULL OR superseded_at > $1)
ORDER BY version DESC
LIMIT 2`, [effectiveAt]);
    if (result.rows.length > 1) {
      authorityError("SUBSCRIPTION_GUARANTEE_POLICY_AMBIGUOUS", "subscription guarantee policy is ambiguous");
    }
    const row = result.rows[0];
    if (!row) return null;
    return {
      policyRef: rowString(row, "policy_ref", 160),
      version: positiveInteger(row.version),
      scope: rowString(row, "scope", 60) as "monthly_subscription",
      qualifyingOutageSeconds: positiveInteger(row.qualifying_outage_seconds),
      refundReviewOutageSeconds: positiveInteger(row.refund_review_outage_seconds),
      activationFailureRefundReview: row.activation_failure_refund_review === true,
      autoQualifyingAttribution: rowString(row, "auto_qualifying_attribution", 40) as "fawri",
      effectiveAt: rowDate(row, "effective_at"),
      supersededAt: row.superseded_at ? rowDate(row, "superseded_at") : null,
    };
  }

  async listIncidents(
    merchantId: string,
    startsAt: Date,
    expiresAt: Date,
  ): Promise<SubscriptionGuaranteeIncidentSnapshot[]> {
    const sql = await this.executor();
    const result = await sql.query(`
SELECT id, merchant_id, incident_kind, attribution, starts_at, ends_at,
       authority_source, authority_reference, version
FROM subscription_guarantee_incidents
WHERE merchant_id = $1
  AND starts_at < $3
  AND (ends_at IS NULL OR ends_at > $2)
ORDER BY starts_at ASC, id ASC`, [merchantId, startsAt, expiresAt]);

    return result.rows.map((row) => {
      if (rowString(row, "merchant_id", 160) !== merchantId) {
        authorityError("SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION", "subscription guarantee tenant boundary violation");
      }
      return {
        id: rowString(row, "id", 200),
        merchantId,
        incidentKind: rowString(row, "incident_kind", 40) as SubscriptionGuaranteeIncidentKind,
        attribution: rowString(row, "attribution", 40) as SubscriptionGuaranteeAttribution,
        startsAt: rowDate(row, "starts_at"),
        endsAt: row.ends_at ? rowDate(row, "ends_at") : null,
        authoritySource: rowString(row, "authority_source", 40) as "server_ops" | "automated_monitor",
        authorityReference: row.authority_reference
          ? String(row.authority_reference).slice(0, 500)
          : null,
        version: positiveInteger(row.version),
      };
    });
  }
}

export async function recordSubscriptionServiceGuaranteeAssessment(
  assessment: SubscriptionGuaranteeAssessment,
): Promise<void> {
  const { pool } = await import("@workspace/db");
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      `INSERT INTO subscription_guarantee_assessments (
        id, merchant_id, subscription_id, policy_ref, policy_version,
        result, billing_state, billing_reference, eligible_extension_seconds,
        qualifying_outage_seconds, max_continuous_outage_seconds,
        refund_review_eligible, manual_review_required, reason_code,
        evaluated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )`,
      [
        assessment.assessmentId,
        assessment.merchantId,
        assessment.subscriptionId,
        assessment.policyRef,
        assessment.policyVersion,
        assessment.result,
        assessment.billingState,
        assessment.billingReference,
        assessment.eligibleExtensionSeconds,
        assessment.qualifyingOutageSeconds,
        assessment.maxContinuousOutageSeconds,
        assessment.refundReviewEligible,
        assessment.manualReviewRequired,
        assessment.reasonCode,
        assessment.evaluatedAt,
      ],
    );

    for (const evidence of assessment.evidence) {
      await connection.query(
        `INSERT INTO subscription_guarantee_assessment_incidents (
          id, assessment_id, incident_id, merchant_id, role, included_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `subscription-guarantee-evidence-${crypto.randomUUID()}`,
          assessment.assessmentId,
          evidence.incidentId,
          assessment.merchantId,
          evidence.role,
          evidence.includedSeconds,
        ],
      );
    }

    await connection.query("COMMIT");
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      // Preserve the original fail-closed persistence error.
    }
    throw error;
  } finally {
    connection.release();
  }
}
