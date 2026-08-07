import type { ReadinessCheck, ReadinessCheckResult, ReadinessSnapshot } from "./types";

const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 30_000;

function normalizedTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(timeoutMs), MAX_TIMEOUT_MS);
}

async function executeCheck(check: ReadinessCheck): Promise<ReadinessCheckResult> {
  const startedAt = performance.now();
  const timeoutMs = normalizedTimeout(check.timeoutMs);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      Promise.resolve().then(() => check.check()),
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("READINESS_TIMEOUT")), timeoutMs);
      }),
    ]);

    return {
      name: check.name,
      status: "up",
      duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  } catch (error) {
    return {
      name: check.name,
      status: "down",
      duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      error_code:
        error instanceof Error && error.message === "READINESS_TIMEOUT"
          ? "timeout"
          : "dependency_unavailable",
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export async function createReadinessSnapshot(
  checks: readonly ReadinessCheck[],
  now: () => Date = () => new Date(),
): Promise<ReadinessSnapshot> {
  const names = new Set<string>();
  for (const check of checks) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/i.test(check.name)) {
      throw new Error(`Invalid readiness check name: ${check.name}`);
    }
    if (names.has(check.name)) throw new Error(`Duplicate readiness check name: ${check.name}`);
    names.add(check.name);
  }

  const results = await Promise.all(checks.map((check) => executeCheck(check)));
  return {
    status: results.every((result) => result.status === "up") ? "ready" : "not_ready",
    timestamp: now().toISOString(),
    checks: results,
  };
}
