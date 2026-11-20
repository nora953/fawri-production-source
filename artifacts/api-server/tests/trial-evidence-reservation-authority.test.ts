import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reserveVerifiedPhoneForTrialReview } from "../src/services/trialEvidenceReservationAuthority";
import { whatsappTrialProofSourceReady, recordAcceptedSignupWhatsAppTemplate } from "../src/services/postgresMerchantAuthSecurityAuthority";

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
  // A legacy verified flag alone is never accepted as WhatsApp provenance.
  assert.match(src, /row\.trial_wa_proof_hash !== evidenceHash/);
  assert.match(src, /row\.trial_wa_proof_verified_at < row\.phone_verified_at/);
  assert.match(src, /row\.trial_wa_proof_challenge_id/);
  assert.match(src, /TRIAL_WHATSAPP_AUTH_PROVENANCE_REQUIRED/);
  assert.match(src, /a\.trial_wa_proof_hash/);
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

test("held WhatsApp-only proof source never backfills legacy verification flags", () => {
  const sql = readFileSync(new URL("../../../lib/db/first-commercial/held/v1_trial_whatsapp_proof_source.sql", import.meta.url), "utf8");
  assert.match(sql, /HELD \/ REVIEW REQUIRED/);
  assert.match(sql, /NOT IN DRIZZLE LEDGER/);
  assert.match(sql, /session_user <> 'fawri_owner'/);
  assert.match(sql, /ADD COLUMN trial_wa_proof_hash text/);
  assert.match(sql, /ADD COLUMN trial_wa_proof_verified_at timestamptz/);
  assert.match(sql, /ADD COLUMN trial_wa_proof_challenge_id text/);
  assert.match(sql, /trial_wa_proof_challenge_id IS NOT NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX accounts_trial_wa_proof_challenge_unique/);
  assert.doesNotMatch(sql, /UPDATE public\.accounts\s+SET/);
  assert.doesNotMatch(sql, /DEFAULT\s+true/i);
});

test("WhatsApp-only trial proof cannot be enabled by legacy authentication flags", async t => {
  const key = "FAWRI_WHATSAPP_TRIAL_PROOF_SOURCE_ENABLED";
  const before = process.env[key];
  t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  delete process.env[key];
  assert.equal(whatsappTrialProofSourceReady(), false);
  await assert.rejects(
    recordAcceptedSignupWhatsAppTemplate({
      challengeId: "11111111-1111-4111-8111-111111111111",
      target: "+15550000001",
      providerReceipt: {
        messageId: "wamid.synthetic-test",
        templateName: "test",
        templateLanguage: "en_US",
      },
    }), /TRIAL_WHATSAPP_PROOF_NOT_READY/,
  );
});

test("trusted signup proof requires an accepted provider receipt AND atomic redemption", () => {
  const src = readFileSync(new URL("../src/services/postgresMerchantAuthSecurityAuthority.ts", import.meta.url), "utf8");
  const issuer = readFileSync(new URL("../src/routes/auth-route-common.ts", import.meta.url), "utf8");
  assert.match(src, /recordAcceptedSignupWhatsAppTemplate/);
  assert.match(src, /wa_auth_message_id_hash/);
  assert.match(src, /whatsappTrialDigest\("trial-wa-provider-message:v1"/);
  assert.match(src, /row\.purpose !== "signup"/);
  assert.match(src, /challenge\.account_id/);
  assert.match(src, /challenge\.wa_auth_accepted_at/);
  assert.match(src, /trial_wa_proof_challenge_id=\$5/);
  assert.match(src, /trial_wa_proof_hash=\$4/);
  assert.match(src, /withAuthenticationTransaction\(async \(client\) =>/);
  assert.match(issuer, /deliverAuthOtpWithProviderReceipt/);
  assert.match(issuer, /recordAcceptedSignupWhatsAppTemplate/);
  assert.match(issuer, /revokeMerchantOtpChallengeAuthoritative\(issued\.challengeId\)/);
});

test("held OTP receipt SQL blocks partial and duplicate provider acceptance without legacy backfill", () => {
  const sql = readFileSync(new URL("../../../lib/db/first-commercial/held/v1_trial_whatsapp_otp_receipt_source.sql", import.meta.url), "utf8");
  assert.match(sql, /HELD \/ REVIEW REQUIRED/);
  assert.match(sql, /NOT IN DRIZZLE LEDGER/);
  assert.match(sql, /ADD COLUMN wa_auth_message_id_hash text/);
  assert.match(sql, /ADD COLUMN wa_auth_accepted_at timestamptz/);
  assert.match(sql, /auth_otp_wa_receipt_complete/);
  assert.match(sql, /CREATE UNIQUE INDEX auth_otp_wa_message_id_unique/);
  assert.doesNotMatch(sql, /UPDATE public\.auth_otp_challenges\s+SET/);
});
