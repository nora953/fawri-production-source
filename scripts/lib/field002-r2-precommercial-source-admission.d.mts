/** The canonical JS precommercial-source policy; declarations do not confer release authorization. */
export const FIELD002_R2_PROJECT_ID: string;
export const FIELD002_R2_HISTORICAL_PROJECT_ID: string;
export const FIELD002_R2_FIRST_COMMERCIAL_BRANCH_ID: string;
export const FIELD002_R2_BRANCHES: Readonly<{
  production: string;
  firstCommercialProduction: string;
  staging: string;
  cleanRehearsal: string;
  oldRehearsal: string;
  frozenRecovery: string;
  historicalAcl2Recovery: string;
  historicalAclRehearsal: string;
  nativeResetDrill: string;
  currentAcl0Recovery: string;
  archived: readonly string[];
  retired: readonly string[];
}>;
export type Field002FirstCommercialSourceCandidate = {
  intent: "first_commercial_launch";
  project_id: string;
  target_branch_id: string;
  source_mode: "fresh_schema_migrations_only";
  source_branch_id: null;
  source_backup_id: null;
  data_import_requested: false;
  restore_requested: false;
};
/** Rejects malformed/historical/data-bearing source plans. Declarative only. */
export function assertField002FirstCommercialSourcePolicy(
  candidate: unknown
): Readonly<{
  decision: "SCHEMA_ONLY_SOURCE_POLICY_COMPATIBLE";
  requiresIndependentHostedVerification: true;
  deploymentAuthorized: false;
  field002Closed: false;
}>;
