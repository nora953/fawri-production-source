/**
 * First-commercial V1 ONLY: make additional job-history RLS mandatory when
 * the dedicated, separately authenticated merchant runtime role is selected.
 * Keep this helper independent of database/runtime imports so its selection
 * logic can be executed in a schema-only CI process with no credentials,
 * provider access or application side effects.
 */
export const V1_FIRST_COMMERCIAL_WORKER_RLS_TABLES = [
  "job_attempts",
  "job_dead_letters",
] as const;

export function selectProtectedRlsTablesForRuntime(
  baseline: readonly string[],
  env: Pick<NodeJS.ProcessEnv, "FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE">,
): readonly string[] {
  if (String(env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE || "").trim() !==
      "fawri_restricted_runtime") {
    return baseline;
  }
  return [...baseline, ...V1_FIRST_COMMERCIAL_WORKER_RLS_TABLES];
}
