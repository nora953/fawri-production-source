// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSubscriptionServiceGuarantee,
  PostgresSubscriptionServiceGuaranteeAuthority,
  SubscriptionServiceGuaranteeAuthorityError,
} from "../src/services/subscriptionServiceGuarantee.js";

const HOUR = 60 * 60;

function policy(overrides = {}) {
  return {
    policyRef: "subscription-service-guarantee:v1",
    version: 1,
    scope: "monthly_subscription",
    qualifyingOutageSeconds: 24 * HOUR,
    refundReviewOutageSeconds: 72 * HOUR,
    activationFailureRefundReview: true,
    autoQualifyingAttribution: "fawri",
    effectiveAt: "2026-08-01T00:00:00.000Z",
    supersededAt: null,
    ...overrides,
  };
}

function subscription(overrides = {}) {
  return {
    merchantId: "merchant-a",
    subscriptionId: "subscription-a",
    planName: "silver",
    lifecycleState: "active",
    startsAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-09-01T00:00:00.000Z",
    billingState: "paid",
    billingReference: "billing-cycle-a",
    ...overrides,
  };
}

function incident(id, startHour, durationHours, overrides = {}) {
  const startsAt = new Date(Date.UTC(2026, 7, 2, startHour)).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + durationHours * HOUR * 1000).toISOString();
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
    return this.policies
      .filter((item) => {
        const start = Date.parse(item.effectiveAt);
        const end = item.supersededAt ? Date.parse(item.supersededAt) : Number.POSITIVE_INFINITY;
        return start <= at && at < end;
      })
      .sort((left, right) => right.version - left.version)[0] || null;
  }

  async listIncidents(merchantId, startsAt, expiresAt) {
    this.calls.push(["incidents", merchantId, startsAt.toISOString(), expiresAt.toISOString()]);
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

test("outage shorter than 24 hours does not qualify for service credit", async () => {
  const result = await evaluate(new FakeAuthority({ incidents: [incident("i-23h", 0, 23)] }));
  assert.equal(result.result, "not_eligible");
  assert.equal(result.eligibleExtensionSeconds, 0);
  assert.equal(result.refundReviewEligible, false);
});

test("Fawri outage over 24 continuous hours qualifies for exact extension duration", async () => {
  const result = await evaluate(new FakeAuthority({ incidents: [incident("i-25h", 0, 25)] }));
  assert.equal(result.result, "eligible_for_extension");
  assert.equal(result.eligibleExtensionSeconds, 25 * HOUR);
  assert.equal(result.reasonCode, "FAWRI_OUTAGE_OVER_24H");
});

test("Fawri outage over 72 continuous hours is eligible only for manual refund review", async () => {
  const result = await evaluate(new FakeAuthority({ incidents: [incident("i-73h", 0, 73)] }));
  assert.equal(result.result, "eligible_for_extension_and_manual_refund_review");
  assert.equal(result.refundReviewEligible, true);
  assert.equal(result.reasonCode, "FAWRI_OUTAGE_OVER_72H");
  assert.equal("refunded" in result, false);
});

test("Fawri activation failure can qualify for manual refund review without money movement", async () => {
  const activationFailure = incident("activation-failure", 0, 2, {
    incidentKind: "activation_failure",
  });
  const result = await evaluate(new FakeAuthority({
    subscription: subscription({ lifecycleState: "pending_activation" }),
    incidents: [activationFailure],
  }));
  assert.equal(result.result, "eligible_for_manual_refund_review");
  assert.equal(result.refundReviewEligible, true);
  assert.equal(result.eligibleExtensionSeconds, 0);
  assert.equal(result.reasonCode, "FAWRI_ACTIVATION_FAILURE");
});

test("third-party outage never automatically qualifies for Fawri credit", async () => {
  const result = await evaluate(new FakeAuthority({
    incidents: [incident("meta-outage", 0, 80, { attribution: "third_party" })],
  }));
  assert.equal(result.result, "not_eligible");
  assert.equal(result.eligibleExtensionSeconds, 0);
  assert.equal(result.refundReviewEligible, false);
  assert.equal(result.evidence[0].role, "excluded_attribution");
});

test("unknown outage attribution fails closed to manual review", async () => {
  const result = await evaluate(new FakeAuthority({
    incidents: [incident("unknown-outage", 0, 30, { attribution: "unknown" })],
  }));
  assert.equal(result.result, "manual_review_required");
  assert.equal(result.manualReviewRequired, true);
  assert.equal(result.reasonCode, "OUTAGE_ATTRIBUTION_UNKNOWN");
  assert.equal(result.eligibleExtensionSeconds, 0);
});

test("overlapping Fawri incidents are unioned and never double-counted", async () => {
  const first = incident("incident-a", 0, 30);
  const second = incident("incident-b", 20, 20);
  const result = await evaluate(new FakeAuthority({ incidents: [first, second] }));
  assert.equal(result.result, "eligible_for_extension");
  assert.equal(result.eligibleExtensionSeconds, 40 * HOUR);
  assert.equal(result.maxContinuousOutageSeconds, 40 * HOUR);
});

test("inactive or unpaid subscriptions receive no guarantee benefit", async () => {
  for (const current of [
    subscription({ lifecycleState: "suspended", billingState: "paid" }),
    subscription({ lifecycleState: "active", billingState: "unpaid", billingReference: null }),
  ]) {
    const result = await evaluate(new FakeAuthority({
      subscription: current,
      incidents: [incident("long-outage", 0, 80)],
    }));
    assert.equal(result.result, "not_eligible");
    assert.equal(result.eligibleExtensionSeconds, 0);
    assert.equal(result.refundReviewEligible, false);
  }
});

test("historical policy version is selected from subscription-cycle start and preserved", async () => {
  const authority = new FakeAuthority({
    policies: [
      policy({
        policyRef: "subscription-service-guarantee:v1",
        version: 1,
        effectiveAt: "2026-08-01T00:00:00.000Z",
        supersededAt: "2026-09-01T00:00:00.000Z",
      }),
      policy({
        policyRef: "subscription-service-guarantee:v2",
        version: 2,
        effectiveAt: "2026-09-01T00:00:00.000Z",
        supersededAt: null,
        qualifyingOutageSeconds: 30 * HOUR,
      }),
    ],
    incidents: [incident("august-outage", 0, 25)],
  });

  const result = await evaluate(authority);
  assert.equal(result.policyRef, "subscription-service-guarantee:v1");
  assert.equal(result.policyVersion, 1);
  assert.equal(result.result, "eligible_for_extension");
});

test("tenant isolation rejects cross-merchant incident evidence", async () => {
  const authority = new FakeAuthority({
    incidents: [incident("cross-tenant", 0, 30, { merchantId: "merchant-b" })],
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
      incidents: [incident("real-authority", 0, 80, { attribution: "third_party" })],
    });
    const result = await evaluate(authority, {
      incidents: [incident("client-injected", 0, 200)],
      attribution: "fawri",
      outageHours: 200,
    });
    assert.equal(result.result, "not_eligible");
    assert.equal(authority.calls.filter((call) => call[0] === "incidents").length, 1);
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

test("missing SaaS payment authority keeps otherwise qualifying claims in manual review", async () => {
  const result = await evaluate(new FakeAuthority({
    subscription: subscription({ billingState: "unknown", billingReference: null }),
    incidents: [incident("fawri-outage", 0, 30)],
  }));
  assert.equal(result.result, "manual_review_required");
  assert.equal(result.reasonCode, "BILLING_AUTHORITY_UNAVAILABLE");
  assert.equal(result.refundReviewEligible, false);
});

test("PostgreSQL subscription lifecycle is not misrepresented as payment authority", async () => {
  const queries = [];
  const sql = {
    async query(statement, values) {
      queries.push({ statement, values });
      if (statement.includes("FROM subscriptions")) {
        return {
          rows: [{
            id: "subscription-a",
            merchant_id: "merchant-a",
            plan_name: "silver",
            status: "active",
            price_iqd: 25000,
            starts_at: "2026-08-01T00:00:00.000Z",
            expires_at: "2026-09-01T00:00:00.000Z",
          }],
        };
      }
      return { rows: [] };
    },
  };
  const authority = new PostgresSubscriptionServiceGuaranteeAuthority(sql);
  const loaded = await authority.loadSubscription("merchant-a", "subscription-a");
  assert.equal(loaded.billingState, "unknown");
  assert.equal(loaded.billingReference, null);
  assert.match(queries[0].statement, /WHERE merchant_id = \$1 AND id = \$2/);
});
