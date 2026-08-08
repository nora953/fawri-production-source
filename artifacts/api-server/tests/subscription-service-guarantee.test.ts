// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import {
  createSubscriptionServiceGuaranteeV1Policy,
  DisabledSubscriptionGuaranteeIncidentAuthority,
  evaluateSubscriptionServiceGuarantee,
  PostgresSubscriptionGuaranteeSubscriptionAuthority,
  recordSubscriptionServiceGuaranteeAssessmentAudit,
  SubscriptionServiceGuaranteeAuthorityError,
  VersionedSubscriptionGuaranteePolicyAuthority,
} from "../src/services/subscriptionServiceGuarantee.js";

const HOUR = 60 * 60;

function policy(overrides = {}) {
  return {
    ...createSubscriptionServiceGuaranteeV1Policy({
      effectiveAt: "2026-08-01T00:00:00.000Z",
    }),
    ...overrides,
  };
}

function subscription(overrides = {}) {
  return {
    merchantId: "merchant-a",
    subscriptionId: "subscription-a",
    subscriptionVersion: 7,
    entitlementReference: "subscription-lifecycle-sha256:test-cycle-a",
    planName: "silver",
    lifecycleState: "active",
    startsAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
    billingState: "paid",
    billingReference: "trusted-billing-cycle-a",
    ...overrides,
  };
}

function incident(id, startHour, durationHours, overrides = {}) {
  const startsAt = new Date(Date.UTC(2026, 7, 2, startHour)).toISOString();
  const endsAt = new Date(
    Date.parse(startsAt) + durationHours * HOUR * 1000,
  ).toISOString();
  return {
    id,
    merchantId: "merchant-a",
    incidentKind: "material_outage",
    attribution: "fawri",
    startsAt,
    endsAt,
    authoritySource: "server_ops",
    authorityReference: `ops:${id}`,
    version: 1,
    ...overrides,
  };
}

class FakeAuthority {
  constructor(options = {}) {
    this.subscription = options.subscription || subscription();
    this.policies = options.policies || [policy()];
    this.incidents = options.incidents || [];
    this.calls = [];
  }

  async loadSubscription(merchantId, subscriptionId) {
    this.calls.push(["subscription", merchantId, subscriptionId]);
    return this.subscription;
  }

  async loadPolicyForDate(effectiveAt) {
    this.calls.push(["policy", effectiveAt.toISOString()]);
    const at = effectiveAt.getTime();
    const matches = this.policies.filter((item) => {
      const start = Date.parse(item.effectiveAt);
      const end = item.supersededAt
        ? Date.parse(item.supersededAt)
        : Number.POSITIVE_INFINITY;
      return start <= at && at < end;
    });
    if (matches.length > 1) {
      throw new SubscriptionServiceGuaranteeAuthorityError(
        "SUBSCRIPTION_GUARANTEE_POLICY_AMBIGUOUS",
        "ambiguous test policy",
      );
    }
    return matches[0] || null;
  }

  async listIncidents(merchantId, startsAt, expiresAt) {
    this.calls.push([
      "incidents",
      merchantId,
      startsAt.toISOString(),
      expiresAt.toISOString(),
    ]);
    return this.incidents;
  }
}

async function evaluate(authority, extraRequest = {}) {
  return evaluateSubscriptionServiceGuarantee(authority, {
    merchantId: "merchant-a",
    subscriptionId: "subscription-a",
    evaluatedAt: new Date("2026-08-10T00:00:00.000Z"),
    ...extraRequest,
  });
}

test("v1 policy locks monthly scope and strict 24h/72h thresholds", () => {
  const value = createSubscriptionServiceGuaranteeV1Policy({
    effectiveAt: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(value.policyRef, "fawri-subscription-service-guarantee:v1");
  assert.equal(value.version, 1);
  assert.equal(value.scope, "monthly_subscription");
  assert.equal(value.qualifyingOutageSeconds, 24 * HOUR);
  assert.equal(value.refundReviewOutageSeconds, 72 * HOUR);
  assert.equal(value.autoQualifyingAttribution, "fawri");
});

test("outage shorter than or exactly 24 hours does not qualify for service credit", async () => {
  for (const hours of [23, 24]) {
    const result = await evaluate(
      new FakeAuthority({ incidents: [incident(`i-${hours}h`, 0, hours)] }),
    );
    assert.equal(result.result, "not_eligible");
    assert.equal(result.eligibleExtensionSeconds, 0);
    assert.equal(result.refundReviewEligible, false);
  }
});

test("Fawri outage over 24 continuous hours qualifies for exact extension duration", async () => {
  const result = await evaluate(
    new FakeAuthority({ incidents: [incident("i-25h", 0, 25)] }),
  );
  assert.equal(result.result, "eligible_for_extension");
  assert.equal(result.eligibleExtensionSeconds, 25 * HOUR);
  assert.equal(result.reasonCode, "FAWRI_OUTAGE_OVER_24H");
});

test("exactly 72 hours is not refund-review eligible, but over 72 is", async () => {
  const exact = await evaluate(
    new FakeAuthority({ incidents: [incident("i-72h", 0, 72)] }),
  );
  assert.equal(exact.result, "eligible_for_extension");
  assert.equal(exact.refundReviewEligible, false);

  const over = await evaluate(
    new FakeAuthority({ incidents: [incident("i-73h", 0, 73)] }),
  );
  assert.equal(over.result, "eligible_for_extension_and_manual_refund_review");
  assert.equal(over.refundReviewEligible, true);
  assert.equal(over.reasonCode, "FAWRI_OUTAGE_OVER_72H");
  assert.equal("refunded" in over, false);
});

test("Fawri activation failure can qualify for manual refund review without money movement", async () => {
  const activationFailure = incident("activation-failure", 0, 2, {
    incidentKind: "activation_failure",
  });
  const result = await evaluate(
    new FakeAuthority({
      subscription: subscription({ lifecycleState: "pending_activation" }),
      incidents: [activationFailure],
    }),
  );
  assert.equal(result.result, "eligible_for_manual_refund_review");
  assert.equal(result.refundReviewEligible, true);
  assert.equal(result.eligibleExtensionSeconds, 0);
  assert.equal(result.reasonCode, "FAWRI_ACTIVATION_FAILURE");
  assert.equal("refundProviderResult" in result, false);
});

test("third-party outage never automatically qualifies for Fawri credit", async () => {
  const result = await evaluate(
    new FakeAuthority({
      incidents: [
        incident("meta-outage", 0, 80, { attribution: "third_party" }),
      ],
    }),
  );
  assert.equal(result.result, "not_eligible");
  assert.equal(result.eligibleExtensionSeconds, 0);
  assert.equal(result.refundReviewEligible, false);
  assert.equal(result.evidence[0].role, "excluded_attribution");
});

test("unknown outage attribution fails closed to manual review", async () => {
  const result = await evaluate(
    new FakeAuthority({
      incidents: [
        incident("unknown-outage", 0, 30, { attribution: "unknown" }),
      ],
    }),
  );
  assert.equal(result.result, "manual_review_required");
  assert.equal(result.manualReviewRequired, true);
  assert.equal(result.reasonCode, "OUTAGE_ATTRIBUTION_UNKNOWN");
  assert.equal(result.eligibleExtensionSeconds, 0);
});

test("open/unfinalized outage evidence fails closed", async () => {
  const result = await evaluate(
    new FakeAuthority({
      incidents: [incident("open-outage", 0, 30, { endsAt: null })],
    }),
  );
  assert.equal(result.result, "manual_review_required");
  assert.equal(result.reasonCode, "OUTAGE_NOT_FINALIZED");
});

test("overlapping Fawri incidents are unioned and never double-counted", async () => {
  const first = incident("incident-a", 0, 30);
  const second = incident("incident-b", 20, 20);
  const result = await evaluate(new FakeAuthority({ incidents: [first, second] }));
  assert.equal(result.result, "eligible_for_extension");
  assert.equal(result.eligibleExtensionSeconds, 40 * HOUR);
  assert.equal(result.maxContinuousOutageSeconds, 40 * HOUR);
});

test("duplicate incident identity fails closed instead of double-counting", async () => {
  await assert.rejects(
    () =>
      evaluate(
        new FakeAuthority({
          incidents: [incident("duplicate", 0, 30), incident("duplicate", 10, 30)],
        }),
      ),
    (error) =>
      error instanceof SubscriptionServiceGuaranteeAuthorityError &&
      error.code === "SUBSCRIPTION_GUARANTEE_INCIDENT_AMBIGUOUS",
  );
});

test("inactive or unpaid subscriptions receive no guarantee benefit", async () => {
  for (const current of [
    subscription({ lifecycleState: "suspended", billingState: "paid" }),
    subscription({
      lifecycleState: "active",
      billingState: "unpaid",
      billingReference: null,
    }),
  ]) {
    const result = await evaluate(
      new FakeAuthority({
        subscription: current,
        incidents: [incident("long-outage", 0, 80)],
      }),
    );
    assert.equal(result.result, "not_eligible");
    assert.equal(result.eligibleExtensionSeconds, 0);
    assert.equal(result.refundReviewEligible, false);
  }
});

test("historical policy and entitlement references are preserved in assessment", async () => {
  const historicalPolicies = [
    policy({
      policyRef: "fawri-subscription-service-guarantee:v1",
      version: 1,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      supersededAt: "2026-09-01T00:00:00.000Z",
    }),
    policy({
      policyRef: "fawri-subscription-service-guarantee:v2",
      version: 2,
      effectiveAt: "2026-09-01T00:00:00.000Z",
      supersededAt: null,
      qualifyingOutageSeconds: 30 * HOUR,
    }),
  ];
  const policyAuthority = new VersionedSubscriptionGuaranteePolicyAuthority(
    historicalPolicies,
  );
  assert.equal(
    (await policyAuthority.loadPolicyForDate(new Date("2026-08-15T00:00:00Z")))
      ?.version,
    1,
  );

  const authority = new FakeAuthority({
    policies: historicalPolicies,
    incidents: [incident("august-outage", 0, 25)],
  });
  const result = await evaluate(authority);
  assert.equal(result.policyRef, "fawri-subscription-service-guarantee:v1");
  assert.equal(result.policyVersion, 1);
  assert.equal(result.subscriptionVersion, 7);
  assert.equal(
    result.entitlementReference,
    "subscription-lifecycle-sha256:test-cycle-a",
  );
  assert.equal(result.result, "eligible_for_extension");
});

test("tenant isolation rejects cross-merchant incident evidence", async () => {
  const authority = new FakeAuthority({
    incidents: [
      incident("cross-tenant", 0, 30, { merchantId: "merchant-b" }),
    ],
  });
  await assert.rejects(
    () => evaluate(authority),
    (error) =>
      error instanceof SubscriptionServiceGuaranteeAuthorityError &&
      error.code === "SUBSCRIPTION_GUARANTEE_TENANT_VIOLATION",
  );
});

test("client-supplied outage fields and browser localStorage cannot become authority", async () => {
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        return JSON.stringify({ attribution: "fawri", durationHours: 1000 });
      },
    },
  });

  try {
    const authority = new FakeAuthority({
      incidents: [
        incident("real-authority", 0, 80, { attribution: "third_party" }),
      ],
    });
    const result = await evaluate(authority, {
      incidents: [incident("client-injected", 0, 200)],
      attribution: "fawri",
      outageHours: 200,
      billingState: "paid",
    });
    assert.equal(result.result, "not_eligible");
    assert.equal(
      authority.calls.filter((call) => call[0] === "incidents").length,
      1,
    );
  } finally {
    if (previous === undefined) {
      delete globalThis.localStorage;
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: previous,
      });
    }
  }
});

test("missing SaaS payment authority blocks automatic extension for a 24h+ claim", async () => {
  const result = await evaluate(
    new FakeAuthority({
      subscription: subscription({
        billingState: "unknown",
        billingReference: null,
      }),
      incidents: [incident("fawri-outage", 0, 30)],
    }),
  );
  assert.equal(result.result, "manual_review_required");
  assert.equal(result.reasonCode, "BILLING_AUTHORITY_UNAVAILABLE");
  assert.equal(result.eligibleExtensionSeconds, 0);
  assert.equal(result.qualifyingOutageSeconds, 30 * HOUR);
  assert.equal(result.refundReviewEligible, false);
});

test("missing SaaS payment authority preserves 72h+ manual refund-review eligibility without refund or extension", async () => {
  const result = await evaluate(
    new FakeAuthority({
      subscription: subscription({
        billingState: "unknown",
        billingReference: null,
      }),
      incidents: [incident("fawri-refund-review-outage", 0, 73)],
    }),
  );
  assert.equal(result.result, "eligible_for_manual_refund_review");
  assert.equal(result.refundReviewEligible, true);
  assert.equal(result.manualReviewRequired, true);
  assert.equal(result.eligibleExtensionSeconds, 0);
  assert.equal(result.qualifyingOutageSeconds, 73 * HOUR);
  assert.equal(
    result.reasonCode,
    "FAWRI_OUTAGE_OVER_72H_BILLING_REVIEW_REQUIRED",
  );
  assert.equal("refunded" in result, false);
  assert.equal("refundProviderResult" in result, false);
});

test("missing production incident authority fails closed", async () => {
  const incidentAuthority = new DisabledSubscriptionGuaranteeIncidentAuthority();
  await assert.rejects(
    () =>
      incidentAuthority.listIncidents(
        "merchant-a",
        new Date("2026-08-01T00:00:00Z"),
        new Date("2026-09-01T00:00:00Z"),
      ),
    (error) =>
      error instanceof SubscriptionServiceGuaranteeAuthorityError &&
      error.code === "SUBSCRIPTION_GUARANTEE_INCIDENT_AUTHORITY_UNAVAILABLE",
  );
});

test("PostgreSQL subscription lifecycle is tenant-bound and never misrepresented as payment authority", async () => {
  const queries = [];
  const sql = {
    async query(statement, values) {
      queries.push({ statement, values });
      return {
        rows: [
          {
            id: "subscription-a",
            merchant_id: "merchant-a",
            plan_name: "silver",
            status: "active",
            price_iqd: 25000,
            starts_at: "2026-08-01T00:00:00.000Z",
            expires_at: "2026-09-01T00:00:00.000Z",
            version: 9,
          },
        ],
      };
    },
  };
  const authority = new PostgresSubscriptionGuaranteeSubscriptionAuthority(sql);
  const loaded = await authority.loadSubscription(
    "merchant-a",
    "subscription-a",
  );
  assert.equal(loaded.billingState, "unknown");
  assert.equal(loaded.billingReference, null);
  assert.equal(loaded.subscriptionVersion, 9);
  assert.match(
    loaded.entitlementReference,
    /^subscription-lifecycle-sha256:[0-9a-f]{64}$/,
  );
  assert.match(queries[0].statement, /WHERE merchant_id = \$1 AND id = \$2/);
  assert.deepEqual(queries[0].values, ["merchant-a", "subscription-a"]);
});

test("assessment audit uses existing server audit authority and records immutable evidence refs only", async () => {
  const result = await evaluate(
    new FakeAuthority({ incidents: [incident("audited-outage", 0, 25)] }),
  );
  const queries = [];
  const sql = {
    async query(statement, values = []) {
      queries.push({ statement, values: [...values] });
      return { rows: [] };
    },
    async transaction(operation) {
      return operation(this);
    },
  };

  await recordSubscriptionServiceGuaranteeAssessmentAudit(result, sql);
  assert.equal(queries.length, 2);
  assert.match(queries[0].statement, /INSERT INTO audit_events/);
  assert.match(queries[0].statement, /subscription_guarantee_assessed/);
  assert.equal(queries[0].values[1], "merchant-a");
  assert.match(queries[0].values[4], /subscription-lifecycle-sha256/);
  assert.doesNotMatch(queries[0].values[4], /customerText|localStorage|refunded/);
  assert.match(queries[1].statement, /subscription_guarantee_incident_evidence/);
  assert.equal(queries[1].values[2], "audited-outage");
  assert.match(queries[1].values[4], /"incidentVersion":1/);
  assert.match(queries[1].values[4], /"authorityReference":"ops:audited-outage"/);
});
