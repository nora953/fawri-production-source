import type { HealthSnapshot } from "./types";

export type HealthOptions = {
  service: string;
  version: string;
  now?: () => Date;
  uptimeSeconds?: () => number;
};

export function createHealthSnapshot(options: HealthOptions): HealthSnapshot {
  const now = options.now ?? (() => new Date());
  const uptimeSeconds = options.uptimeSeconds ?? (() => process.uptime());

  return {
    status: "ok",
    service: options.service,
    version: options.version,
    timestamp: now().toISOString(),
    uptime_seconds: Math.max(0, Math.floor(uptimeSeconds())),
  };
}
