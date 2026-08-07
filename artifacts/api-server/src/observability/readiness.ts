import type { ReadinessCheck, ReadinessCheckResult, ReadinessSnapshot } from "./types";

const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 30_000;
const SAFE_CHECK_NAME = /^[a-z][a-z0-9_-]{0,63}$/i;

function normalizedTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(timeoutMs), MAX_TIMEOUT_MS);
}

function configurationFailure(now: () => Date): ReadinessSnapshot {
  return {
    status: "not_ready",
    timestamp: now().toISOString(),
    checks: [
      {
        name: "readiness_configuration",
        status: "down",
        duration_ms: 0,
        error_code: "configuration_invalid",
      },
    ],
  };
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
  if (checks.length === 0) return configurationFailure(now);

  const names = new Set<string>();
  for (const check of checks) {
    if (!SAFE_CHECK_NAME.test(check.name) || names.has(check.name)) {
      return configurationFailure(now);
    }
    names.add(check.name);
  }

  const results = await Promise.all(checks.map((check) => executeCheck(check)));
  return {
    status: results.every((result) => result.status === "up") ? "ready" : "not_ready",
    timestamp: now().toISOString(),
    checks: results,
  };
}
