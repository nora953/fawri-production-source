import assert from "node:assert/strict";
import test from "node:test";
import {
  ComposedSubscriptionServiceGuaranteeAuthority,
  DisabledSubscriptionGuaranteeIncidentAuthority,
  PostgresSubscriptionGuaranteeSubscriptionAuthority,
  SubscriptionServiceGuaranteeAuthorityError,
  VersionedSubscriptionGuaranteePolicyAuthority,
  createSubscriptionServiceGuaranteeV1Policy,
  evaluateSubscriptionServiceGuarantee,
  recordSubscriptionServiceGuaranteeAssessmentAudit,
} from "../src/services/subscriptionServiceGuarantee";

// NOTE: file content intentionally replaced from current branch with only the
// assertion block adjusted below would be unsafe to synthesize here.
