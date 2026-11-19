import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const candidate = readFileSync(
  new URL("../../../lib/db/first-commercial/held/v1_google_oidc_merchant_identity.sql", import.meta.url),
  "utf8",
);

// Source contracts only; do NOT claim this executed on PostgreSQL 18.
test("held Google identity migration is explicitly gated and never auto-applied", () => {
  assert.match(candidate, /HELD \/ SOURCE CANDIDATE ONLY/);
  assert.match(candidate, /NEVER run against Neon production/);
  assert.match(candidate, /BEGIN;/);
  assert.match(candidate, /COMMIT;/);
  assert.match(candidate, /GOOGLE_IDENTITY_PREIMAGE_NOT_ACCEPTED/);
  assert.match(candidate, /session_user <> 'fawri_owner'/);
  assert.match(candidate, /current_user <> session_user/);
  assert.match(candidate, /server_version_num/);
});

test("Google issuer and subject stay paired, merchant-only and globally unique", () => {
  assert.match(candidate, /ADD CONSTRAINT accounts_google_identity_pair_check/);
  assert.match(candidate, /google_issuer IS NULL AND google_subject IS NULL/);
  assert.match(candidate, /kind = 'merchant'::public\.account_kind/);
  assert.match(candidate, /google_issuer IS NOT NULL/);
  assert.match(candidate, /google_issuer = 'https:\/\/accounts\.google\.com'/);
  assert.match(candidate, /google_subject ~ '\^\[A-Za-z0-9_-\]\{1,128\}\$'/);
  assert.match(candidate, /CREATE UNIQUE INDEX accounts_google_identity_unique_idx/);
  assert.match(candidate, /ON public\.accounts \(google_issuer, google_subject\)/);
  assert.doesNotMatch(candidate, /UNIQUE\s*\(\s*email\s*\)/i);
});

test("active admin still requires phone; Google merchant cannot spoof phone verification or trial", () => {
  assert.match(candidate, /DROP CONSTRAINT accounts_active_phone_required_check/);
  assert.match(candidate, /ADD CONSTRAINT accounts_active_phone_required_check/);
  assert.match(candidate, /state = 'closed'::public\.account_state/);
  assert.match(candidate, /OR phone IS NOT NULL/);
  assert.match(candidate, /OR \(\s*kind = 'merchant'::public\.account_kind/);
  assert.doesNotMatch(candidate, /SET phone_verified = true/);
  assert.doesNotMatch(candidate, /INSERT INTO\s+(public\.)?merchants/i);
  assert.doesNotMatch(candidate, /trial_started_at\s*=/i);
});

test("linked identity cannot be reassigned and auth/tenant privileges remain separated", () => {
  assert.match(candidate, /GOOGLE_IDENTITY_SUBJECT_IMMUTABLE/);
  assert.match(candidate, /NEW\.state = 'closed'::public\.account_state/);
  assert.match(candidate, /CREATE TRIGGER accounts_google_identity_immutable_guard/);
  assert.match(candidate, /REVOKE ALL ON FUNCTION public\.fawri_google_identity_immutable\(\) FROM PUBLIC/);
  assert.match(candidate, /has_table_privilege\('fawri_restricted_runtime','public\.accounts','SELECT'\)/);
  assert.match(candidate, /has_table_privilege\('fawri_operator_issuer','public\.accounts','SELECT'\)/);
  assert.match(candidate, /GOOGLE_IDENTITY_POSTIMAGE_NOT_ACCEPTED/);
});
