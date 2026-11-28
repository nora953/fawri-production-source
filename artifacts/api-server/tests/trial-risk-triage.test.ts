import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  triagePendingGoogleMerchantTrialRisk,
  type TrustedTrialRiskSnapshot,
} from "../src/services/trialRiskTriage";

const lowRisk: TrustedTrialRiskSnapshot = Object.freeze({
  googleSubjectAuthenticated: true,
  merchantAccountActive: true,
  trialHistory: "unused",
  evidenceCollision: "none",
  antiAutomation: "passed",
  independentBusinessProof: "verified_domain",
  businessProofUniqueness: "unique",
  signupVelocity: "normal",
  linkedAccountRisk: "none",
  networkDeviceSignal: "normal",
  approvedWhatsAppAuthenticationAvailable: false,
});

test("independently verified unique business can enter no-phone review, never a trial", () => {
  for (const independentBusinessProof of ["verified_domain", "verified_registration"] as const) {
    const outcome = triagePendingGoogleMerchantTrialRisk({ ...lowRisk, independentBusinessProof });
    assert.deepEqual(outcome, {
      action: "review_without_phone",
      reason: "LOW_RISK_VERIFIED_BUSINESS",
      trialActivated: false,
      subscriptionActivated: false,
    });
    assert.equal(Object.isFrozen(outcome), true);
  }
});

test("Google verification alone does not establish eligible independent business", () => {
  assert.equal(triagePendingGoogleMerchantTrialRisk({
    ...lowRisk, independentBusinessProof: "none",
    approvedWhatsAppAuthenticationAvailable: true,
  }).action, "manual_review");
  assert.equal(triagePendingGoogleMerchantTrialRisk({
    ...lowRisk, independentBusinessProof: "none",
  }).action, "manual_review");
});

test("prior free trial cannot be reset by registering a new Google account", () => {
  const outcome = triagePendingGoogleMerchantTrialRisk({ ...lowRisk, trialHistory: "used" });
  assert.equal(outcome.action, "already_used");
  assert.equal(outcome.trialActivated, false);
});

test("missing signed identity and disabled merchant fail to manual review", () => {
  for (const value of [
    { ...lowRisk, googleSubjectAuthenticated: false },
    { ...lowRisk, merchantAccountActive: false },
    null,
    {},
  ]) {
    assert.equal(triagePendingGoogleMerchantTrialRisk(
      value as TrustedTrialRiskSnapshot,
    ).action, "manual_review");
  }
});

test("unknown authoritative history and risk signals never admit low-risk review", () => {
  for (const field of [
    "trialHistory", "evidenceCollision", "independentBusinessProof",
    "businessProofUniqueness", "signupVelocity", "linkedAccountRisk",
    "networkDeviceSignal",
  ] as const) {
    assert.equal(triagePendingGoogleMerchantTrialRisk({
      ...lowRisk, [field]: "unknown",
    }).action, "manual_review", field);
  }
});

test("duplicate business evidence needs human review and appeal, not automatic denial", () => {
  for (const value of [
    { ...lowRisk, evidenceCollision: "conflict" as const },
    { ...lowRisk, businessProofUniqueness: "conflict" as const },
  ]) {
    const outcome = triagePendingGoogleMerchantTrialRisk(value);
    assert.equal(outcome.action, "manual_review");
    assert.equal(outcome.reason, "EVIDENCE_CONFLICT");
  }
});

test("failed or absent server-side anti-bot verification cannot allow low risk", () => {
  for (const antiAutomation of ["failed", "unknown"] as const) {
    assert.equal(triagePendingGoogleMerchantTrialRisk({
      ...lowRisk, antiAutomation,
    }).action, "manual_review");
  }
});

test("elevated trusted risk always requires manual review, independent of OTP availability", () => {
  for (const elevated of [
    { signupVelocity: "elevated" as const },
    { linkedAccountRisk: "elevated" as const },
  ]) {
    assert.equal(triagePendingGoogleMerchantTrialRisk({
      ...lowRisk, ...elevated, approvedWhatsAppAuthenticationAvailable: true,
    }).action, "manual_review");
    assert.equal(triagePendingGoogleMerchantTrialRisk({
      ...lowRisk, ...elevated, approvedWhatsAppAuthenticationAvailable: false,
    }).action, "manual_review");
  }
});

test("IP/device anomaly by itself does not deny or force WhatsApp", () => {
  const result = triagePendingGoogleMerchantTrialRisk({
    ...lowRisk, networkDeviceSignal: "anomalous",
    approvedWhatsAppAuthenticationAvailable: true,
  });
  assert.equal(result.action, "manual_review");
});

test("triage source is unmounted and cannot change entitlements or send tokens", () => {
  const source = readFileSync(new URL("../src/services/trialRiskTriage.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/routes/auth-google-merchant-routes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /trialRiskTriage/);
  assert.doesNotMatch(source, /UPDATE public\.merchants|INSERT INTO public\.subscriptions|issueSession\(|fetch\(|sendMessage\(/);
  assert.match(source, /trialActivated: false/);
  assert.match(source, /subscriptionActivated: false/);
});
