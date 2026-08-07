const METRIC_NAME = /^[a-z][a-z0-9_]*$/;
const SAFE_LABEL_VALUE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;
const DEFAULT_ALLOWED_LABELS = new Set([
  "channel",
  "operation",
  "outcome",
  "queue",
  "reason_code",
  "status",
]);

export const FAWRI_METRICS = {
  httpRequestsTotal: "fawri_http_requests_total",
  httpErrorsTotal: "fawri_http_errors_total",
  queueDepth: "fawri_queue_depth",
  queueOldestReadyAgeSeconds: "fawri_queue_oldest_ready_age_seconds",
  dlqDepth: "fawri_dlq_depth",
  webhookSignatureFailuresTotal: "fawri_webhook_signature_failures_total",
  loginFailuresTotal: "fawri_login_failures_total",
  migrationFailuresTotal: "fawri_migration_failures_total",
} as const;

export type MetricLabels = Readonly<Record<string, string>>;

type MetricEntry = {
  name: string;
  labels: MetricLabels;
  value: number;
  kind: "counter" | "gauge";
};

function normalizeMetricName(name: string): string {
  if (!METRIC_NAME.test(name)) throw new Error(`Invalid metric name: ${name}`);
  if (!name.startsWith("fawri_")) throw new Error("Metric names must use the fawri_ prefix");
  return name;
}

function normalizeLabels(labels: MetricLabels, allowedLabels: ReadonlySet<string>): MetricLabels {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length > 6) throw new Error("A metric may not have more than six labels");

  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!allowedLabels.has(key)) throw new Error(`Metric label is not allowed: ${key}`);
    if (!SAFE_LABEL_VALUE.test(value)) throw new Error(`Unsafe metric label value for ${key}`);
    normalized[key] = value;
  }
  return normalized;
}

function metricKey(name: string, labels: MetricLabels): string {
  return `${name}|${Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(",")}`;
}

function escapePrometheusLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export class MetricsRegistry {
  readonly #entries = new Map<string, MetricEntry>();
  readonly #allowedLabels: ReadonlySet<string>;

  constructor(allowedLabels: ReadonlySet<string> = DEFAULT_ALLOWED_LABELS) {
    this.#allowedLabels = allowedLabels;
  }

  increment(name: string, labels: MetricLabels = {}, amount = 1): void {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Counter increments must be finite and non-negative");
    const normalizedName = normalizeMetricName(name);
    const normalizedLabels = normalizeLabels(labels, this.#allowedLabels);
    const key = metricKey(normalizedName, normalizedLabels);
    const current = this.#entries.get(key);
    if (current && current.kind !== "counter") throw new Error(`Metric kind conflict: ${normalizedName}`);
    this.#entries.set(key, {
      name: normalizedName,
      labels: normalizedLabels,
      kind: "counter",
      value: (current?.value ?? 0) + amount,
    });
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    if (!Number.isFinite(value)) throw new Error("Gauge values must be finite");
    const normalizedName = normalizeMetricName(name);
    const normalizedLabels = normalizeLabels(labels, this.#allowedLabels);
    const key = metricKey(normalizedName, normalizedLabels);
    const current = this.#entries.get(key);
    if (current && current.kind !== "gauge") throw new Error(`Metric kind conflict: ${normalizedName}`);
    this.#entries.set(key, {
      name: normalizedName,
      labels: normalizedLabels,
      kind: "gauge",
      value,
    });
  }

  toPrometheusText(): string {
    const lines = [...this.#entries.values()]
      .sort((left, right) => metricKey(left.name, left.labels).localeCompare(metricKey(right.name, right.labels)))
      .map((entry) => {
        const labels = Object.entries(entry.labels);
        const suffix = labels.length
          ? `{${labels.map(([key, value]) => `${key}="${escapePrometheusLabel(value)}"`).join(",")}}`
          : "";
        return `${entry.name}${suffix} ${entry.value}`;
      });
    return `${lines.join("\n")}${lines.length ? "\n" : ""}`;
  }
}
