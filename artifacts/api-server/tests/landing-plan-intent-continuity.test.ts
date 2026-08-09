import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AuthAccountRepository, type RequestedPlan } from "../src/services/authAccountRepository";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const routeSource = fs.readFileSync(path.join(testsDir, "../src/routes/auth-public-routes.ts"), "utf8");
const payloadSource = fs.readFileSync(path.join(testsDir, "../src/routes/auth-route-common.ts"), "utf8");

function repository() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-plan-intent-"));
  return { repo: new AuthAccountRepository(path.join(dir, "merchants.json")), file: path.join(dir, "merchants.json") };
}

function signup(repo: AuthAccountRepository, phone: string, requestedPlan?: RequestedPlan | null) {
  return repo.upsertPendingMerchant({
    phone,
    passwordHash: "hash",
    ownerName: "Owner",
    storeName: "Store",
    activityType: "retail",
    language: "ar",
    requestedPlan,
  });
}

test("server signup validates requested_plan against the canonical plan set", () => {
  assert.match(routeSource, /requestedPlanInput !== "silver" && requestedPlanInput !== "gold" && requestedPlanInput !== "diamond"/);
  assert.match(routeSource, /INVALID_REQUESTED_PLAN/);
  assert.match(routeSource, /requestedPlan = requestedPlanInput/);
});

test("repository stores canonical plans and OTP verification preserves them", () => {
  for (const [index, plan] of (["silver", "gold", "diamond"] as const).entries()) {
    const { repo } = repository();
    const pending = signup(repo, `0700000000${index + 1}`, plan);
    assert.equal(pending.merchantProfile?.requestedPlan, plan);
    const verified = repo.markMerchantOtpVerified(pending.account.id);
    assert.equal(verified?.merchantProfile?.requestedPlan, plan);
    assert.equal(verified?.account.otpVerified, true);
  }
});

test("generic signup remains null, invalid repository input fails closed, and pending retries preserve intent", () => {
  const { repo, file } = repository();
  const generic = signup(repo, "07000000004");
  assert.equal(generic.merchantProfile?.requestedPlan, null);

  const invalid = signup(repo, "07000000005", "platinum" as RequestedPlan);
  assert.equal(invalid.merchantProfile?.requestedPlan, null);

  const first = signup(repo, "07000000006", "gold");
  const retry = signup(repo, "07000000006");
  assert.equal(retry.merchantProfile?.requestedPlan, "gold");
  assert.equal(retry.account.id, first.account.id);

  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal("subscriptions" in raw, false);
  assert.equal("payments" in raw, false);
  assert.equal("invoices" in raw, false);
  assert.equal("billing" in raw, false);
});

test("merchant payload keeps requested plan and signup has no subscription or payment side effect", () => {
  assert.match(payloadSource, /requested_plan: profile\.requestedPlan/);
  assert.match(payloadSource, /merchant_profile: account\.merchantProfile/);
  const signupRoute = routeSource.slice(
    routeSource.indexOf('router.post("/signup"'),
    routeSource.indexOf('router.post("/otp/resend"'),
  );
  assert.doesNotMatch(signupRoute, /subscription|payment|invoice|charge|entitlement/i);
});
