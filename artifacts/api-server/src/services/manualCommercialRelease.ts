export function manualCommercialRelease(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FAWRI_V1_MANUAL_COMMERCE === "1";
}

/**
 * First commercial release offers manual orders/COD only. Production must not
 * start in the old full-provider profile because a missing flag silently
 * re-enables Meta, billing and Support code paths.
 *
 * Staging/development continue to exercise the full-feature regression suite.
 * Removing this V1-only restriction requires a reviewed later release change.
 */
export function assertFirstCommercialManualProfile(
  env: NodeJS.ProcessEnv,
  isProductionRelease: boolean,
): void {
  if (!isProductionRelease || manualCommercialRelease(env)) return;
  throw Object.assign(
    new Error("First commercial production requires the manual-commerce profile"),
    { code: "FAWRI_V1_MANUAL_COMMERCE_REQUIRED" },
  );
}
