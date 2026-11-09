/**
 * FT-01 launch blocker 0052: source-only first-commercial INVOKER variant.
 * Pure: NO PostgreSQL, hosted provider, filesystem writes, restore or deploy.
 * Never reclassify historical staging as a first-commercial data source.
 *
 * The canonical 0052 source + Drizzle journal/stage/snapshot stay UNCHANGED.
 * This is the specifically reviewed variant that already passed disposable
 * non-superuser PostgreSQL18. Promotion requires a separate, explicit release
 * decision, a new source/journal manifest and verified target recovery.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFt01CleanBootstrapSourcePlan,
} from "./ft01-clean-bootstrap-source-plan.mjs";
import {
  disposableInvokerVariant,
  EXPECTED_CANONICAL_0052_SHA256,
  INVOKER_MERCHANT_DELETION_SHA256,
} from "../../lib/db/scripts/lib/ft01-0052-nonsuperuser-invoker-candidate.mjs";
import {
  hasPinnedFt01InvokerFingerprints,
} from "../../lib/db/scripts/lib/ft01-held-invoker-storage-readiness.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_PATH = "lib/db/drizzle/0052_cashier_stream_receipt_storage.sql";
const SOURCE_TAG = "0052_cashier_stream_receipt_storage";
const ROLE_RESERVATION_PATH = "docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-FOUR-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql";
const REVIEWED_CASHIER_GRANTS_PATH = "lib/db/first-commercial/held/0052_cashier_retirement_issuer_grants.sql";
export const FT01_EXPECTED_RESTRICTED_CASHIER_GRANTS_SQL = [
  "-- FT-01 HELD: restricted cashier retirement grants for FIRST-COMMERCIAL review ONLY.",
  "-- Not a migration and NOT approved for hosted execution by this file.",
  "GRANT USAGE ON SCHEMA public TO fawri_auth_issuer, fawri_restricted_runtime;",
  "GRANT USAGE ON SCHEMA fawri_security TO fawri_auth_issuer, fawri_restricted_runtime;",
  "GRANT EXECUTE ON FUNCTION fawri_security.allows_merchant(text) TO fawri_auth_issuer, fawri_restricted_runtime;",
  "GRANT SELECT, UPDATE(retention_status, status) ON public.merchants TO fawri_auth_issuer, fawri_restricted_runtime;",
  "GRANT SELECT ON public.cashier_device_streams TO fawri_auth_issuer, fawri_restricted_runtime;",
  "GRANT UPDATE(state, device_id, version) ON public.cashier_device_streams TO fawri_auth_issuer;",
  "GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO fawri_auth_issuer;",
  "GRANT fawri_cashier_retirement_writer TO fawri_auth_issuer WITH SET FALSE, INHERIT TRUE;",
].join("\n") + "\n";
const REVIEWED_INVOCER_SQL_PATH = "lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql";

const sha256 = source => createHash("sha256").update(source, "utf8").digest("hex");

export function buildFt01FirstCommercialInvokerReviewPlan({
  root = projectRoot,
  readFile = relative => fs.readFileSync(path.join(root, relative), "utf8"),
} = {}) {
  // This independently rechecks the WHOLE canonical journal + stage provenance
  // and requires the first-commercial FRESH-SCHEMA source-only policy.
  const historical = buildFt01CleanBootstrapSourcePlan({root, readFile});
  assert.equal(historical.target.database_name, "fawri");
  assert.equal(historical.target.postgres_major, 18);
  assert.equal(historical.source_mode, "fresh_schema_migrations_only");
  assert.equal(historical.data_import_allowed, false);
  assert.equal(historical.inventoried_migrations.length, 53);
  assert.equal(historical.held_migration.tag, SOURCE_TAG);
  assert.equal(historical.held_migration.sha256, EXPECTED_CANONICAL_0052_SHA256);
  assert.equal(historical.approved_to_execute, false);
  assert.ok(hasPinnedFt01InvokerFingerprints(), "FT01_INVOKER_POLICY_FINGERPRINTS_NOT_PINNED");

  const reservationSql = readFile(ROLE_RESERVATION_PATH);
  for (const role of ["fawri_restricted_runtime","fawri_auth_issuer",
    "fawri_operator_issuer","fawri_cashier_retirement_writer"]) {
    assert.ok(reservationSql.includes("CREATE ROLE " + role + "\n"),
      "FT01_FIRST_COMMERCIAL_ROLE_RESERVATION_INCOMPLETE");
  }
  assert.match(reservationSql,/IF role_count <> 4 THEN/);
  assert.match(reservationSql,/FT01_FOUR_NOLOGIN_ROLE_POSTIMAGE_UNSAFE/);
  // THIS separate, committed SQL file is the reviewed launch candidate,
  // not a dynamically rewritten copy of canonical 0052 at deploy time.
  // Preserve the canonical journal/stage; never silently substitute this
  // candidate in the existing production migration directory.
  const retirementGrants = readFile(REVIEWED_CASHIER_GRANTS_PATH);
  assert.equal(retirementGrants, FT01_EXPECTED_RESTRICTED_CASHIER_GRANTS_SQL,
    "FT01_HELD_RESTRICTED_GRANT_SOURCE_DRIFT");
  const variant = readFile(REVIEWED_INVOCER_SQL_PATH);
  const expectedVariant = disposableInvokerVariant(readFile(SOURCE_PATH));
  assert.equal(variant, expectedVariant, "FT01_HELD_COMMITTED_0052_SOURCE_DRIFT");
  const variantSha256 = sha256(variant);
  assert.notEqual(variantSha256, EXPECTED_CANONICAL_0052_SHA256,
    "FT01_INVOKER_VARIANT_MUST_DIFFER_FROM_CANONICAL");
  assert.match(variant, /LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog/);
  assert.match(variant, /FOR UPDATE TO fawri_cashier_retirement_writer/);
  assert.doesNotMatch(variant, /FOR UPDATE TO fawri_auth_issuer/);
  assert.match(variant, /session_user <> 'fawri_auth_issuer'/);
  assert.doesNotMatch(variant, /FOR UPDATE TO PUBLIC/i);
  assert.doesNotMatch(variant, /CREATE ROLE fawri_cashier_retirement_owner/i);
  assert.doesNotMatch(variant, /ALTER FUNCTION public\.fawri_sequence_merchant_deleted\(\) OWNER TO/i);

  // No output may claim that THIS uncommitted-to-canonical migration variant
  // was applied anywhere. The SHA pins the exact 0052 alternative proposal.
  return Object.freeze({
    decision: "FT01_REVIEWABLE_NEW_COMMERCIAL_0052_INVOKER_SOURCE",
    target: historical.target,
    source_mode: "fresh_schema_migrations_only",
    source_migrations_count: historical.inventoried_migrations.length,
    canonical_0052_tag: historical.held_migration.tag,
    canonical_0052_sha256: historical.held_migration.sha256,
    reviewed_invoker_variant_0052_sha256: variantSha256,
    reviewed_invoker_function_body_sha256: INVOKER_MERCHANT_DELETION_SHA256,
    four_role_reservation_sql_sha256: sha256(reservationSql),
    reviewed_retirement_grants_sql_sha256: sha256(retirementGrants),
    held_retirement_grants_source_path: REVIEWED_CASHIER_GRANTS_PATH,
    canonical_journal_sha256: historical.migration_journal_sha256,
    source_manifest_sha256: historical.source_manifest_sha256,
    snapshot_0052_sha256: historical.snapshot_0052_sha256,
    stage_0052_sha256: historical.stage_0052_sha256,
    source_provenance: "separately committed HELD SQL, exact canonical source-derived match",
    held_invoker_source_path: REVIEWED_INVOCER_SQL_PATH,
    deployment_roles: Object.freeze({
      primary_login: "fawri_restricted_runtime",
      authentication_login: "fawri_auth_issuer",
      operator_login: "fawri_operator_issuer",
      cashier_retirement_writer_group: "fawri_cashier_retirement_writer",
    }),
    production_startup_profile_adopted: false,
    canonical_source_or_journal_modified: false,
    committed_migration_applied: false,
    roles_provisioned: false,
    external_provider_attested: false,
    external_backup_verified: false,
    new_target_sql_http_accepted: false,
    approved_to_execute: false,
    approved_to_deploy: false,
    field002_closed: false,
    commercial_release_authorized: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, "FT01_SOURCE_REVIEW_PLAN_NO_ARGS");
  process.stdout.write(JSON.stringify(buildFt01FirstCommercialInvokerReviewPlan(), null, 2) + "\n");
}
