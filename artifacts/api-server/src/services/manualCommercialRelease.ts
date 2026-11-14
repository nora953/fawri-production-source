export function manualCommercialRelease(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FAWRI_V1_MANUAL_COMMERCE === "1";
}
