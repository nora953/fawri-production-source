export type ProbeState = "up" | "down";

export type HealthSnapshot =
  | {
      status: "ok";
      service: string;
      version: string;
      timestamp: string;
      uptime_seconds: number;
    }
  | {
      status: "unhealthy";
      timestamp: string;
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
  error_code?: "dependency_unavailable" | "timeout" | "configuration_invalid";
};

export type ReadinessSnapshot = {
  status: "ready" | "not_ready";
  timestamp: string;
  checks: ReadinessCheckResult[];
};
