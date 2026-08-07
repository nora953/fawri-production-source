export type ProbeState = "up" | "down";

export type HealthSnapshot = {
  status: "ok";
  service: string;
  version: string;
  timestamp: string;
  uptime_seconds: number;
};

export type ReadinessCheck = {
  name: string;
  timeoutMs?: number;
  check: () => void | Promise<void>;
};

export type ReadinessCheckResult = {
  name: string;
  status: ProbeState;
  duration_ms: number;
  error_code?: "dependency_unavailable" | "timeout";
};

export type ReadinessSnapshot = {
  status: "ready" | "not_ready";
  timestamp: string;
  checks: ReadinessCheckResult[];
};
