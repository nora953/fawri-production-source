import {
  operationalPostgresAuthorityRequired,
  withOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";

export type EarlyWarningWindow = "1h" | "24h" | "7d" | "30d";
export type EarlyWarningHealth = "healthy" | "warning" | "critical" | "unknown";
export type EarlyWarningCoverage = "available" | "partial" | "not_instrumented";

const WINDOW_MS: Record<EarlyWarningWindow, number> = {
  "1h": 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

const DANGEROUS_JOB_CODES = [
  "META_REPLY_OUTCOME_UNCERTAIN",
  "META_REPLY_RELEASE_RECONCILIATION_REQUIRED",
  "META_REPLY_ALREADY_SENT",
  "META_REPLY_LEGACY_RESERVATION_UNCERTAIN",
  "META_REPLY_REFUND_CONFLICT",
  "META_REPLY_SUPPRESSION_COMMIT_FAILED",
  "META_EVENT_IDENTITY_COLLISION",
  "META_MESSAGE_IDENTITY_COLLISION",
  "KNOWLEDGE_TENANT_VIOLATION",
  "CROSS_TENANT_ACCESS_FORBIDDEN",
] as const;

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function timestamp(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function healthRank(value: EarlyWarningHealth): number {
  return value === "critical" ? 3 : value === "warning" ? 2 : value === "unknown" ? 1 : 0;
}

function worstHealth(values: EarlyWarningHealth[]): EarlyWarningHealth {
  return values.reduce<EarlyWarningHealth>(
    (worst, current) => (healthRank(current) > healthRank(worst) ? current : worst),
    "healthy",
  );
}

export type EarlyWarningIncident = {
  id: string;
  severity: "warning" | "critical";
  area: string;
  code: string;
  value: number;
  runbook: string;
};

export type EarlyWarningMerchantHealth = {
  merchant_id: string;
  store_name: string;
  merchant_status: string;
  account_status: string;
  health: EarlyWarningHealth;
  connected_channels: number;
  recent_channel_errors: number;
  messages: number;
  failed_messages: number;
  jobs: number;
  failed_jobs: number;
  dead_letter_jobs: number;
  uncertain_deliveries: number;
  refund_conflicts: number;
  open_support_tickets: number;
  ai_recorded_tokens: number;
};

export type EarlyWarningSnapshot = {
  authority: "postgresql";
  generated_at: string;
  window: EarlyWarningWindow;
  window_started_at: string;
  database_latency_ms: number;
  overall_health: EarlyWarningHealth;
  incidents: EarlyWarningIncident[];
  queue: {
    ready: number;
    processing: number;
    dead_letter: number;
    oldest_ready_age_seconds: number;
    failed_in_window: number;
    dangerous_failures_in_window: number;
  };
  channels: {
    connected: number;
    non_connected: number;
    recent_errors: number;
    expiring_credentials_7d: number;
    latest_webhook_at: string | null;
  };
  messaging: {
    inbound_events: number;
    messages: number;
    customer_messages: number;
    fawri_messages: number;
    failed_messages: number;
    outbound_sent: number;
    outbound_confirmed_failed: number;
    outbound_uncertain: number;
    outbound_stuck_pending: number;
    outbound_p95_latency_ms: number | null;
  };
  bot_quality: {
    knowledge_decisions: number;
    successful_decisions: number;
    handoffs: number;
    rejected_decisions: number;
    prompt_injection_blocks: number;
    expected_suppressions: number;
    dangerous_guardrail_events: number;
  };
  credits: {
    debits: number;
    credits: number;
    debit_amount: number;
    credit_amount: number;
    stale_reservations: number;
    pending_refunds: number;
    refund_conflicts: number;
  };
  support: {
    open_tickets: number;
    created_in_window: number;
    waiting_on_admin: number;
    attachment_bytes_in_window: number;
    local_filesystem_attachments: number;
  };
  ai_usage: {
    coverage: EarlyWarningCoverage;
    recorded_calls: number;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number;
  };
  data_usage: {
    support_attachment_bytes: number;
    tracked_message_text_bytes: number;
    database_storage_bytes: null;
    network_transfer_bytes: null;
  };
  coverage: Array<{
    id: string;
    coverage: EarlyWarningCoverage;
    note: string;
  }>;
  merchants: EarlyWarningMerchantHealth[];
};

type AggregateRow = Record<string, unknown>;

async function one(client: OperationalSqlClient, sql: string, values: unknown[] = []): Promise<AggregateRow> {
  const result = await client.query<AggregateRow>(sql, values);
  return result.rows[0] || {};
}

function merchantHealth(row: AggregateRow): EarlyWarningMerchantHealth {
  const operational = text(row.merchant_status) === "approved" && text(row.account_status) === "approved";
  const critical =
    numberValue(row.uncertain_deliveries) > 0 ||
    numberValue(row.refund_conflicts) > 0 ||
    numberValue(row.dangerous_jobs) > 0;
  const warning =
    numberValue(row.dead_letter_jobs) > 0 ||
    numberValue(row.failed_messages) > 0 ||
    numberValue(row.failed_jobs) > 0 ||
    numberValue(row.recent_channel_errors) > 0 ||
    (operational && numberValue(row.connected_channels) === 0);

  return {
    merchant_id: text(row.merchant_id),
    store_name: text(row.store_name),
    merchant_status: text(row.merchant_status),
    account_status: text(row.account_status),
    health: !operational ? "unknown" : critical ? "critical" : warning ? "warning" : "healthy",
    connected_channels: numberValue(row.connected_channels),
    recent_channel_errors: numberValue(row.recent_channel_errors),
    messages: numberValue(row.messages),
    failed_messages: numberValue(row.failed_messages),
    jobs: numberValue(row.jobs),
    failed_jobs: numberValue(row.failed_jobs),
    dead_letter_jobs: numberValue(row.dead_letter_jobs),
    uncertain_deliveries: numberValue(row.uncertain_deliveries),
    refund_conflicts: numberValue(row.refund_conflicts),
    open_support_tickets: numberValue(row.open_support_tickets),
    ai_recorded_tokens: numberValue(row.ai_recorded_tokens),
  };
}

export function normalizeEarlyWarningWindow(value: unknown): EarlyWarningWindow {
  return value === "24h" || value === "7d" || value === "30d" ? value : "1h";
}

export async function loadEarlyWarningPostgresSnapshot(
  requestedWindow: EarlyWarningWindow,
  now = new Date(),
): Promise<EarlyWarningSnapshot> {
  if (!operationalPostgresAuthorityRequired()) {
    throw Object.assign(new Error("PostgreSQL operational authority is required"), {
      code: "EARLY_WARNING_POSTGRES_REQUIRED",
      status: 503,
    });
  }

  const windowMs = WINDOW_MS[requestedWindow];
  const since = new Date(now.getTime() - windowMs);
  const started = Date.now();

  const data = await withOperationalTransaction(async (client) => {
    await client.query("SELECT 1");

    const queue = await one(
      client,
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('queued','retry') AND available_at <= now()) AS ready,
         COUNT(*) FILTER (WHERE status = 'processing') AS processing,
         COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter,
         COALESCE(MAX(CASE WHEN status IN ('queued','retry') AND available_at <= now()
           THEN EXTRACT(EPOCH FROM (now() - available_at)) END), 0) AS oldest_ready_age_seconds,
         COUNT(*) FILTER (WHERE updated_at >= $1::timestamptz AND last_error_code IS NOT NULL) AS failed_in_window,
         COUNT(*) FILTER (WHERE updated_at >= $1::timestamptz AND last_error_code = ANY($2::text[])) AS dangerous_failures_in_window,
         COUNT(*) FILTER (WHERE updated_at >= $1::timestamptz AND result->>'delivery_status' = 'suppressed') AS expected_suppressions
       FROM background_jobs`,
      [since.toISOString(), [...DANGEROUS_JOB_CODES]],
    );

    const channels = await one(
      client,
      `SELECT
         COUNT(*) FILTER (WHERE status = 'connected') AS connected,
         COUNT(*) FILTER (WHERE status <> 'connected') AS non_connected,
         COUNT(*) FILTER (WHERE last_error_at >= $1::timestamptz) AS recent_errors,
         COUNT(*) FILTER (WHERE status = 'connected' AND credential_expires_at IS NOT NULL
           AND credential_expires_at <= now() + interval '7 days') AS expiring_credentials_7d,
         MAX(last_webhook_at) AS latest_webhook_at
       FROM merchant_channels`,
      [since.toISOString()],
    );

    const messaging = await one(
      client,
      `SELECT
         (SELECT COUNT(*) FROM channel_inbound_events WHERE received_at >= $1::timestamptz) AS inbound_events,
         COUNT(*) AS messages,
         COUNT(*) FILTER (WHERE sender = 'customer') AS customer_messages,
         COUNT(*) FILTER (WHERE sender = 'fawri') AS fawri_messages,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed_messages,
         COALESCE(SUM(o.sent), 0) AS outbound_sent,
         COALESCE(SUM(o.confirmed_failed), 0) AS outbound_confirmed_failed,
         COALESCE(SUM(o.uncertain), 0) AS outbound_uncertain,
         COALESCE(SUM(o.stuck_pending), 0) AS outbound_stuck_pending,
         MAX(o.p95_latency_ms) AS outbound_p95_latency_ms,
         COALESCE(SUM(o.total_text_bytes), 0) + COALESCE(SUM(o.message_text_bytes), 0) AS tracked_message_text_bytes
       FROM messages m
       CROSS JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE outcome = 'sent')::bigint AS sent,
           COUNT(*) FILTER (WHERE outcome = 'confirmed_failed')::bigint AS confirmed_failed,
           COUNT(*) FILTER (WHERE outcome = 'uncertain')::bigint AS uncertain,
           COUNT(*) FILTER (WHERE outcome = 'pending' AND attempted_at < now() - interval '5 minutes')::bigint AS stuck_pending,
           percentile_cont(0.95) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (finalized_at - attempted_at)) * 1000
           ) FILTER (WHERE finalized_at IS NOT NULL) AS p95_latency_ms,
           0::bigint AS total_text_bytes,
           0::bigint AS message_text_bytes
         FROM outbound_deliveries
         WHERE attempted_at >= $1::timestamptz
       ) o
       WHERE m.created_at >= $1::timestamptz`,
      [since.toISOString()],
    );

    const messageBytes = await one(
      client,
      `SELECT COALESCE(SUM(octet_length(text)), 0) AS tracked_message_text_bytes
         FROM messages
        WHERE created_at >= $1::timestamptz`,
      [since.toISOString()],
    );

    const botQuality = await one(
      client,
      `SELECT
         COUNT(*) FILTER (WHERE action = 'knowledge_decision') AS knowledge_decisions,
         COUNT(*) FILTER (WHERE action = 'knowledge_decision' AND outcome_code = 'success') AS successful_decisions,
         COUNT(*) FILTER (WHERE action = 'knowledge_decision' AND outcome_code = 'handoff') AS handoffs,
         COUNT(*) FILTER (WHERE action = 'knowledge_decision' AND outcome_code = 'rejected') AS rejected_decisions,
         COUNT(*) FILTER (WHERE decision_code = 'PROMPT_INJECTION_BLOCKED') AS prompt_injection_blocks
       FROM knowledge_audit_events
       WHERE created_at >= $1::timestamptz`,
      [since.toISOString()],
    );

    const credits = await one(
      client,
      `SELECT
         (SELECT COUNT(*) FROM reply_ledger WHERE created_at >= $1::timestamptz AND direction = 'debit') AS debits,
         (SELECT COUNT(*) FROM reply_ledger WHERE created_at >= $1::timestamptz AND direction = 'credit') AS credits,
         (SELECT COALESCE(SUM(amount),0) FROM reply_ledger WHERE created_at >= $1::timestamptz AND direction = 'debit') AS debit_amount,
         (SELECT COALESCE(SUM(amount),0) FROM reply_ledger WHERE created_at >= $1::timestamptz AND direction = 'credit') AS credit_amount,
         (SELECT COUNT(*) FROM reply_reservations WHERE status = 'reserved' AND reserved_at < now() - interval '10 minutes') AS stale_reservations,
         (SELECT COUNT(*) FROM reply_refunds WHERE state = 'pending' AND requested_at < now() - interval '10 minutes') AS pending_refunds,
         (SELECT COUNT(*) FROM reply_refunds WHERE state = 'conflict' AND conflict_at >= $1::timestamptz) AS refund_conflicts`,
      [since.toISOString()],
    );

    const support = await one(
      client,
      `SELECT
         (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','in_progress')) AS open_tickets,
         (SELECT COUNT(*) FROM support_tickets WHERE created_at >= $1::timestamptz) AS created_in_window,
         (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','in_progress') AND waiting_on = 'admin') AS waiting_on_admin,
         (SELECT COALESCE(SUM(size_bytes),0) FROM support_attachments WHERE created_at >= $1::timestamptz AND deleted_at IS NULL) AS attachment_bytes_in_window,
         (SELECT COUNT(*) FROM support_attachments WHERE deleted_at IS NULL AND storage_provider IN ('filesystem','local','local_filesystem')) AS local_filesystem_attachments`,
      [since.toISOString()],
    );

    const aiUsage = await one(
      client,
      `SELECT
         COUNT(*) FILTER (WHERE metadata ? 'ai_usage') AS recorded_calls,
         COALESCE(SUM(CASE WHEN metadata ? 'ai_usage' THEN NULLIF(metadata->'ai_usage'->>'input_tokens','')::bigint ELSE 0 END), 0) AS input_tokens,
         COALESCE(SUM(CASE WHEN metadata ? 'ai_usage' THEN NULLIF(metadata->'ai_usage'->>'output_tokens','')::bigint ELSE 0 END), 0) AS output_tokens,
         COALESCE(SUM(CASE WHEN metadata ? 'ai_usage' THEN NULLIF(metadata->'ai_usage'->>'total_tokens','')::bigint ELSE 0 END), 0) AS total_tokens
       FROM messages
       WHERE created_at >= $1::timestamptz AND sender = 'fawri'`,
      [since.toISOString()],
    );

    const merchants = await client.query<AggregateRow>(
      `WITH
       ch AS (
         SELECT merchant_id,
           COUNT(*) FILTER (WHERE status = 'connected') AS connected_channels,
           COUNT(*) FILTER (WHERE last_error_at >= $1::timestamptz) AS recent_channel_errors
         FROM merchant_channels GROUP BY merchant_id
       ),
       msg AS (
         SELECT merchant_id,
           COUNT(*) AS messages,
           COUNT(*) FILTER (WHERE status = 'failed') AS failed_messages,
           COALESCE(SUM(CASE WHEN metadata ? 'ai_usage'
             THEN NULLIF(metadata->'ai_usage'->>'total_tokens','')::bigint ELSE 0 END), 0) AS ai_recorded_tokens
         FROM messages WHERE created_at >= $1::timestamptz GROUP BY merchant_id
       ),
       jobs AS (
         SELECT merchant_id,
           COUNT(*) FILTER (WHERE updated_at >= $1::timestamptz) AS jobs,
           COUNT(*) FILTER (WHERE updated_at >= $1::timestamptz AND last_error_code IS NOT NULL) AS failed_jobs,
           COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_jobs,
           COUNT(*) FILTER (WHERE updated_at >= $1::timestamptz AND last_error_code = ANY($2::text[])) AS dangerous_jobs
         FROM background_jobs GROUP BY merchant_id
       ),
       delivery AS (
         SELECT merchant_id,
           COUNT(*) FILTER (WHERE attempted_at >= $1::timestamptz AND outcome = 'uncertain') AS uncertain_deliveries
         FROM outbound_deliveries GROUP BY merchant_id
       ),
       refunds AS (
         SELECT merchant_id,
           COUNT(*) FILTER (WHERE conflict_at >= $1::timestamptz AND state = 'conflict') AS refund_conflicts
         FROM reply_refunds GROUP BY merchant_id
       ),
       support AS (
         SELECT merchant_id,
           COUNT(*) FILTER (WHERE status IN ('open','in_progress')) AS open_support_tickets
         FROM support_tickets GROUP BY merchant_id
       )
       SELECT m.id AS merchant_id, m.store_name, m.status::text AS merchant_status,
              m.account_status::text AS account_status,
              COALESCE(ch.connected_channels,0) AS connected_channels,
              COALESCE(ch.recent_channel_errors,0) AS recent_channel_errors,
              COALESCE(msg.messages,0) AS messages,
              COALESCE(msg.failed_messages,0) AS failed_messages,
              COALESCE(msg.ai_recorded_tokens,0) AS ai_recorded_tokens,
              COALESCE(jobs.jobs,0) AS jobs,
              COALESCE(jobs.failed_jobs,0) AS failed_jobs,
              COALESCE(jobs.dead_letter_jobs,0) AS dead_letter_jobs,
              COALESCE(jobs.dangerous_jobs,0) AS dangerous_jobs,
              COALESCE(delivery.uncertain_deliveries,0) AS uncertain_deliveries,
              COALESCE(refunds.refund_conflicts,0) AS refund_conflicts,
              COALESCE(support.open_support_tickets,0) AS open_support_tickets
         FROM merchants m
         LEFT JOIN ch ON ch.merchant_id = m.id
         LEFT JOIN msg ON msg.merchant_id = m.id
         LEFT JOIN jobs ON jobs.merchant_id = m.id
         LEFT JOIN delivery ON delivery.merchant_id = m.id
         LEFT JOIN refunds ON refunds.merchant_id = m.id
         LEFT JOIN support ON support.merchant_id = m.id
        ORDER BY m.store_name, m.id`,
      [since.toISOString(), [...DANGEROUS_JOB_CODES]],
    );

    return {
      queue,
      channels,
      messaging,
      messageBytes,
      botQuality,
      credits,
      support,
      aiUsage,
      merchants: merchants.rows.map(merchantHealth),
    };
  });

  const databaseLatencyMs = Math.max(0, Date.now() - started);
  const incidents: EarlyWarningIncident[] = [];
  const addIncident = (
    condition: boolean,
    incident: EarlyWarningIncident,
  ) => {
    if (condition) incidents.push(incident);
  };

  addIncident(numberValue(data.queue.dead_letter) > 0, {
    id: "queue-dlq-nonzero",
    severity: "warning",
    area: "queue",
    code: "DLQ_NONZERO",
    value: numberValue(data.queue.dead_letter),
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  });
  addIncident(numberValue(data.messaging.outbound_uncertain) > 0, {
    id: "outbound-delivery-uncertain",
    severity: "critical",
    area: "channels",
    code: "OUTBOUND_DELIVERY_UNCERTAIN",
    value: numberValue(data.messaging.outbound_uncertain),
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  });
  addIncident(numberValue(data.messaging.outbound_stuck_pending) > 0, {
    id: "outbound-delivery-stuck",
    severity: "critical",
    area: "channels",
    code: "OUTBOUND_DELIVERY_STUCK",
    value: numberValue(data.messaging.outbound_stuck_pending),
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  });
  addIncident(numberValue(data.credits.refund_conflicts) > 0, {
    id: "reply-refund-conflict",
    severity: "critical",
    area: "credits",
    code: "REPLY_REFUND_CONFLICT",
    value: numberValue(data.credits.refund_conflicts),
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  });
  addIncident(numberValue(data.credits.stale_reservations) > 0, {
    id: "reply-reservation-stale",
    severity: "critical",
    area: "credits",
    code: "REPLY_RESERVATION_STALE",
    value: numberValue(data.credits.stale_reservations),
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  });
  addIncident(numberValue(data.queue.dangerous_failures_in_window) > 0, {
    id: "bot-guardrail-dangerous-event",
    severity: "critical",
    area: "bot_guardrails",
    code: "DANGEROUS_GUARDRAIL_EVENT",
    value: numberValue(data.queue.dangerous_failures_in_window),
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  });
  addIncident(numberValue(data.channels.recent_errors) > 0, {
    id: "channel-recent-errors",
    severity: "warning",
    area: "channels",
    code: "CHANNEL_RECENT_ERRORS",
    value: numberValue(data.channels.recent_errors),
    runbook: "docs/operations-observability.md#webhook-signature-response",
  });
  addIncident(numberValue(data.messaging.failed_messages) > 0, {
    id: "message-failures",
    severity: "warning",
    area: "messaging",
    code: "MESSAGE_FAILURES",
    value: numberValue(data.messaging.failed_messages),
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  });

  const overallHealth: EarlyWarningHealth = incidents.some((item) => item.severity === "critical")
    ? "critical"
    : incidents.length > 0
      ? "warning"
      : worstHealth(data.merchants.map((merchant) => merchant.health));

  const aiRecordedCalls = numberValue(data.aiUsage.recorded_calls);

  return {
    authority: "postgresql",
    generated_at: now.toISOString(),
    window: requestedWindow,
    window_started_at: since.toISOString(),
    database_latency_ms: databaseLatencyMs,
    overall_health: overallHealth,
    incidents,
    queue: {
      ready: numberValue(data.queue.ready),
      processing: numberValue(data.queue.processing),
      dead_letter: numberValue(data.queue.dead_letter),
      oldest_ready_age_seconds: numberValue(data.queue.oldest_ready_age_seconds),
      failed_in_window: numberValue(data.queue.failed_in_window),
      dangerous_failures_in_window: numberValue(data.queue.dangerous_failures_in_window),
    },
    channels: {
      connected: numberValue(data.channels.connected),
      non_connected: numberValue(data.channels.non_connected),
      recent_errors: numberValue(data.channels.recent_errors),
      expiring_credentials_7d: numberValue(data.channels.expiring_credentials_7d),
      latest_webhook_at: timestamp(data.channels.latest_webhook_at),
    },
    messaging: {
      inbound_events: numberValue(data.messaging.inbound_events),
      messages: numberValue(data.messaging.messages),
      customer_messages: numberValue(data.messaging.customer_messages),
      fawri_messages: numberValue(data.messaging.fawri_messages),
      failed_messages: numberValue(data.messaging.failed_messages),
      outbound_sent: numberValue(data.messaging.outbound_sent),
      outbound_confirmed_failed: numberValue(data.messaging.outbound_confirmed_failed),
      outbound_uncertain: numberValue(data.messaging.outbound_uncertain),
      outbound_stuck_pending: numberValue(data.messaging.outbound_stuck_pending),
      outbound_p95_latency_ms:
        data.messaging.outbound_p95_latency_ms === null || data.messaging.outbound_p95_latency_ms === undefined
          ? null
          : numberValue(data.messaging.outbound_p95_latency_ms),
    },
    bot_quality: {
      knowledge_decisions: numberValue(data.botQuality.knowledge_decisions),
      successful_decisions: numberValue(data.botQuality.successful_decisions),
      handoffs: numberValue(data.botQuality.handoffs),
      rejected_decisions: numberValue(data.botQuality.rejected_decisions),
      prompt_injection_blocks: numberValue(data.botQuality.prompt_injection_blocks),
      expected_suppressions: numberValue(data.queue.expected_suppressions),
      dangerous_guardrail_events: numberValue(data.queue.dangerous_failures_in_window),
    },
    credits: {
      debits: numberValue(data.credits.debits),
      credits: numberValue(data.credits.credits),
      debit_amount: numberValue(data.credits.debit_amount),
      credit_amount: numberValue(data.credits.credit_amount),
      stale_reservations: numberValue(data.credits.stale_reservations),
      pending_refunds: numberValue(data.credits.pending_refunds),
      refund_conflicts: numberValue(data.credits.refund_conflicts),
    },
    support: {
      open_tickets: numberValue(data.support.open_tickets),
      created_in_window: numberValue(data.support.created_in_window),
      waiting_on_admin: numberValue(data.support.waiting_on_admin),
      attachment_bytes_in_window: numberValue(data.support.attachment_bytes_in_window),
      local_filesystem_attachments: numberValue(data.support.local_filesystem_attachments),
    },
    ai_usage: {
      coverage: aiRecordedCalls > 0 ? "partial" : "partial",
      recorded_calls: aiRecordedCalls,
      input_tokens: aiRecordedCalls > 0 ? numberValue(data.aiUsage.input_tokens) : 0,
      output_tokens: aiRecordedCalls > 0 ? numberValue(data.aiUsage.output_tokens) : 0,
      total_tokens: numberValue(data.aiUsage.total_tokens),
    },
    data_usage: {
      support_attachment_bytes: numberValue(data.support.attachment_bytes_in_window),
      tracked_message_text_bytes: numberValue(data.messageBytes.tracked_message_text_bytes),
      database_storage_bytes: null,
      network_transfer_bytes: null,
    },
    coverage: [
      { id: "postgresql", coverage: "available", note: "server-authoritative PostgreSQL snapshot" },
      { id: "queue", coverage: "available", note: "durable jobs, attempts and DLQ state" },
      { id: "channels", coverage: "available", note: "channel state, inbound events and outbound delivery outcomes" },
      { id: "bot_guardrails", coverage: "available", note: "deterministic job and delivery safety outcomes" },
      { id: "ai_tokens", coverage: "partial", note: "recorded only for instrumented AI-generated message intents" },
      { id: "http_latency", coverage: "partial", note: "current-process telemetry is supplied separately by the API route" },
      { id: "database_storage", coverage: "not_instrumented", note: "per-merchant physical PostgreSQL storage is not measured yet" },
      { id: "network_transfer", coverage: "not_instrumented", note: "hosting-provider bandwidth authority is not connected" },
      { id: "durable_object_storage", coverage: "not_instrumented", note: "support attachment durability still depends on production object-storage activation" },
    ],
    merchants: data.merchants,
  };
}
