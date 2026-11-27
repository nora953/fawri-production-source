export function publicPrelaunchGateActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env.FAWRI_PUBLIC_PRELAUNCH_ONLY;
  return mode !== undefined && mode !== "" && mode !== "0";
}
