import type { HealthSnapshot } from "./types";

export type HealthOptions = {
  service: string;
  version: string;
  now?: () => Date;
  uptimeSeconds?: () => number;
};

const SAFE_SERVICE = /^[a-z][a-z0-9-]{0,31}$/;
const SAFE_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function createHealthSnapshot(options: HealthOptions): HealthSnapshot {
  const now = options.now ?? (() => new Date());
  const timestamp = now().toISOString();
  const uptimeSeconds = options.uptimeSeconds ?? (() => process.uptime());
  const uptime = uptimeSeconds();

  if (
    !SAFE_SERVICE.test(options.service) ||
    !SAFE_VERSION.test(options.version) ||
    !Number.isFinite(uptime) ||
    uptime < 0
  ) {
    return { status: "unhealthy", timestamp };
  }

  return {
    status: "ok",
    service: options.service,
    version: options.version,
    timestamp,
    uptime_seconds: Math.floor(uptime),
  };
}
