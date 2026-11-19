import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reserveVerifiedPhoneForTrialReview } from "../src/services/trialEvidenceReservationAuthority";

test("trial evidence reservation fails closed and cannot grant an initial free trial", async t => {
  const key = "FAWRI_TRIAL_EVIDENCE_LEDGER_ENABLED";
  const previous = process.env[key];
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  delete process.env[key];
  await assert.rejects(reserveVerifiedPhoneForTrialReview("merchant-12345"), /TRIAL_EVIDENCE_LEDGER_NOT_READY/);
});

test("trial evidence requires DB-verified phone and prior no-trial state", () => {
  const src = readFileSync(new URL("../src/services/trialEvidenceReservationAuthority.ts", import.meta.url), "utf8");
  assert.match(src, /row\.phone_verified/);
  assert.match(src, /isE164Phone\(row\.phone\)/);
  assert.match(src, /row\.trial_started_at/);
  assert.match(src, /TRIAL_ALREADY_USED/);
  assert.match(src, /TRIAL_TRUSTED_PHONE_VERIFICATION_REQUIRED/);
  assert.match(src, /withAuthenticationTransaction\(async client =>/);
  assert.match(src, /FOR UPDATE OF a,m/);
  assert.match(src, /ON CONFLICT \(evidence_hash\) DO NOTHING RETURNING claim_id/);
  assert.match(src, /TRIAL_EVIDENCE_ALREADY_CLAIMED/);
  assert.match(src, /trialActivated: false/);
  assert.doesNotMatch(src, /UPDATE public\.merchants SET trial_status/);
  assert.doesNotMatch(src, /INSERT INTO public\.subscriptions/);
  assert.doesNotMatch(src, /issueSession\(/);
});

test("held evidence tables deny direct access by tenants, operators and public", () => {
  const sql = readFileSync(new URL("../../../lib/db/first-commercial/held/v1_trial_evidence_ledger.sql", import.meta.url), "utf8");
  assert.match(sql, /HELD \/ REVIEW REQUIRED/);
  assert.match(sql, /session_user <> 'fawri_owner'/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.match(sql, /evidence_hash text NOT NULL UNIQUE/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.merchant_trial_evidence FROM PUBLIC/);
  assert.match(sql, /GRANT SELECT,INSERT ON public\.merchant_trial_evidence TO fawri_auth_issuer/);
  assert.match(sql, /merchant_trial_claim_approval_check/);
});
