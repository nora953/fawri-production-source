import crypto from "node:crypto";
import {
  createEnvironmentMetaCredentialKeyProvider,
  decryptMetaCredential,
  encryptMetaCredential,
  type MetaCredentialEnvelope,
  type MetaCredentialKeyProvider,
} from "./metaCredentialVault";
import {
  operationalPostgresAuthorityRequired,
  withMerchantOperationalTransaction,
  withOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";
import {
  blockDeadLetterJobRequeue,
  enqueueDurableJob,
  listDurableJobs,
  listDurableJobSummaries,
  requeueDeadLetterJob,
  startDurableJobWorker,
  type DurableJob,
  type DurableJobHandler,
  type DurableJobStatus,
  type DurableJobSummary,
  type DurableJobWorker,
  type EnqueueDurableJobInput,
  type ExpiredJobResolution,
} from "./durableJobQueue";

const DEFAULT_VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const INTERNAL_REQUEUE_POLICY = "_fawri_requeue_policy";
let configuredProvider: MetaCredentialKeyProvider | null = null;

export function configurePostgresDurableJobCredentialKeyProvider(
  provider: MetaCredentialKeyProvider | null,
): void {
  configuredProvider = provider;
}

function provider(): MetaCredentialKeyProvider {
  return configuredProvider || createEnvironmentMetaCredentialKeyProvider();
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function retryDelayMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.max(0, attempts - 1));
}

function safeError(error: unknown): {
  code: string;
  retryable: boolean;
  requeueSafe: boolean;
} {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: text(record.code) || "JOB_HANDLER_FAILED",
      retryable: record.retryable !== false,
      requeueSafe: record.requeueSafe === true || record.retryable !== false,
    };
  }
  return { code: "JOB_HANDLER_FAILED", retryable: true, requeueSafe: true };
}

function payloadHash(payload: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function aad(jobId: string, merchantId: string): string {
  return `fawri:background-job:${merchantId}:${jobId}:v1`;
}

function encryptPayload(
  jobId: string,
  merchantId: string,
  payload: Record<string, unknown>,
): { serialized: string; keyId: string; hash: string } {
  const plaintext = JSON.stringify(payload);
  const envelope = encryptMetaCredential(plaintext, provider(), aad(jobId, merchantId));
  return {
    serialized: JSON.stringify(envelope),
    keyId: envelope.key_id,
    hash: payloadHash(payload),
  };
}

function decryptPayload(
  jobId: string,
  merchantId: string,
  serialized: string,
  expectedHash: string,
): Record<string, unknown> {
  let envelope: MetaCredentialEnvelope;
  try {
    envelope = JSON.parse(serialized) as MetaCredentialEnvelope;
  } catch {
    throw Object.assign(new Error("durable job payload envelope is invalid"), {
      code: "DURABLE_JOB_PAYLOAD_INVALID",
    });
  }
  const plaintext = decryptMetaCredential(envelope, provider(), aad(jobId, merchantId));
  let payload: unknown;
  try {
    payload = JSON.parse(plaintext);
  } catch {
    throw Object.assign(new Error("durable job payload is invalid"), {
      code: "DURABLE_JOB_PAYLOAD_INVALID",
    });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("durable job payload is invalid"), {
      code: "DURABLE_JOB_PAYLOAD_INVALID",
    });
  }
  if (payloadHash(payload as Record<string, unknown>) !== expectedHash) {
    throw Object.assign(new Error("durable job payload hash does not match"), {
      code: "DURABLE_JOB_PAYLOAD_HASH_MISMATCH",
    });
  }
  return payload as Record<string, unknown>;
}

type JobRow = {
  id: string;
  type: string;
  dedupe_key: string;
  merchant_id: string | null;
  payload_hash: string | null;
  priority: number;
  status: DurableJobStatus;
  attempts: number;
  max_attempts: number;
  requeue_count: number;
  available_at: Date | string;
  locked_at: Date | string | null;
  locked_by: string | null;
  lease_expires_at: Date | string | null;
  lease_generation: number | null;
  last_error_code: string | null;
  result: Record<string, string | number | boolean | null> | null;
  completed_at: Date | string | null;
  dead_lettered_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type PayloadRow = {
  ciphertext: string;
  key_id: string;
  payload_sha256: string;
};

const JOB_SELECT = `
SELECT id, type, dedupe_key, merchant_id, payload_hash, priority,
       status::text AS status, attempts, max_attempts, requeue_count,
       available_at, locked_at, locked_by, lease_expires_at, lease_generation,
       last_error_code, result, completed_at, dead_lettered_at,
       created_at, updated_at
FROM background_jobs`;

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function publicResult(
  value: Record<string, string | number | boolean | null> | null,
): Record<string, unknown> | undefined {
  const result = { ...(value || {}) } as Record<string, unknown>;
  delete result[INTERNAL_REQUEUE_POLICY];
  return Object.keys(result).length > 0 ? result : undefined;
}

function rowBase(row: JobRow): Omit<DurableJob, "payload"> {
  const policy = text(row.result?.[INTERNAL_REQUEUE_POLICY]);
  return {
    id: row.id,
    type: row.type,
    dedupe_key: row.dedupe_key,
    ...(row.merchant_id ? { merchant_id: row.merchant_id } : {}),
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    available_at: iso(row.available_at) || new Date(0).toISOString(),
    ...(iso(row.locked_at) ? { locked_at: iso(row.locked_at)! } : {}),
    ...(row.locked_by ? { locked_by: row.locked_by } : {}),
    ...(iso(row.lease_expires_at)
      ? { lease_expires_at: iso(row.lease_expires_at)! }
      : {}),
    ...(row.last_error_code ? { last_error_code: row.last_error_code } : {}),
    ...(policy === "safe" || policy === "blocked"
      ? { requeue_policy: policy }
      : {}),
    ...(publicResult(row.result) ? { result: publicResult(row.result)! } : {}),
    created_at: iso(row.created_at) || new Date(0).toISOString(),
    updated_at: iso(row.updated_at) || new Date(0).toISOString(),
    ...(iso(row.completed_at) ? { completed_at: iso(row.completed_at)! } : {}),
    ...(iso(row.dead_lettered_at)
      ? { dead_lettered_at: iso(row.dead_lettered_at)! }
      : {}),
  };
}

async function loadPayload(
  client: OperationalSqlClient,
  row: JobRow,
): Promise<Record<string, unknown>> {
  if (!row.merchant_id || !row.payload_hash) {
    throw Object.assign(new Error("durable job tenant payload is unavailable"), {
      code: "DURABLE_JOB_TENANT_REQUIRED",
    });
  }
  const result = await client.query<PayloadRow>(
    `SELECT ciphertext, key_id, payload_sha256
       FROM background_job_payloads
      WHERE job_id = $1 AND merchant_id = $2
      LIMIT 1`,
    [row.id, row.merchant_id],
  );
  const payload = result.rows[0];
  if (!payload || payload.payload_sha256 !== row.payload_hash) {
    throw Object.assign(new Error("durable job payload is unavailable"), {
      code: "DURABLE_JOB_PAYLOAD_UNAVAILABLE",
    });
  }
  return decryptPayload(
    row.id,
    row.merchant_id,
    payload.ciphertext,
    payload.payload_sha256,
  );
}

async function hydrateJob(
  client: OperationalSqlClient,
  row: JobRow,
): Promise<DurableJob> {
  return { ...rowBase(row), payload: await loadPayload(client, row) };
}

async function merchantIds(): Promise<string[]> {
  return withOperationalTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM merchants ORDER BY id`,
    );
    return result.rows.map((row) => row.id).filter(Boolean);
  });
}

export async function enqueueDurableJobAuthoritative(
  input: EnqueueDurableJobInput,
  now: Date = new Date(),
): Promise<{ job: DurableJob; deduplicated: boolean }> {
  if (!operationalPostgresAuthorityRequired()) return enqueueDurableJob(input, now);
  const type = text(input.type);
  const dedupeKey = text(input.dedupeKey);
  const merchantId = text(input.merchantId);
  if (!type || !dedupeKey) throw new Error("durable job type and dedupe key are required");
  if (!merchantId) {
    throw Object.assign(new Error("PostgreSQL durable jobs require a merchant tenant"), {
      code: "DURABLE_JOB_TENANT_REQUIRED",
    });
  }
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    throw new Error("durable job payload must be an object");
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const existing = await client.query<JobRow>(
      `${JOB_SELECT}
        WHERE merchant_id = $1 AND type = $2 AND dedupe_key = $3
        LIMIT 1`,
      [merchantId, type, dedupeKey],
    );
    if (existing.rows[0]) {
      return { job: await hydrateJob(client, existing.rows[0]), deduplicated: true };
    }
    const id = `job-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    const encrypted = encryptPayload(id, merchantId, input.payload);
    const maxAttempts = positiveInteger(input.maxAttempts, 5);
    const availableAt = input.availableAt || now;
    const inserted = await client.query<JobRow>(
      `INSERT INTO background_jobs
        (id, type, dedupe_key, merchant_id, payload_hash, priority, status,
         attempts, max_attempts, available_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued', 0, $7, $8, $9, $9)
       RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                 status::text AS status, attempts, max_attempts, requeue_count,
                 available_at, locked_at, locked_by, lease_expires_at,
                 lease_generation, last_error_code, result, completed_at,
                 dead_lettered_at, created_at, updated_at`,
      [
        id,
        type,
        dedupeKey,
        merchantId,
        encrypted.hash,
        Number.isInteger(input.priority) ? Number(input.priority) : 0,
        maxAttempts,
        availableAt.toISOString(),
        now.toISOString(),
      ],
    );
    await client.query(
      `INSERT INTO background_job_payloads
        (job_id, merchant_id, ciphertext, key_id, payload_sha256)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, merchantId, encrypted.serialized, encrypted.keyId, encrypted.hash],
    );
    return { job: await hydrateJob(client, inserted.rows[0]!), deduplicated: false };
  });
}

async function listRowsForMerchant(
  merchantId: string,
  status?: DurableJobStatus,
): Promise<JobRow[]> {
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<JobRow>(
      `${JOB_SELECT}
        WHERE merchant_id = $1
          AND ($2::text IS NULL OR status = $2::background_job_status)
        ORDER BY created_at DESC, id`,
      [merchantId, status || null],
    );
    return result.rows;
  });
}

export async function listDurableJobsAuthoritative(
  status?: DurableJobStatus,
): Promise<DurableJob[]> {
  if (!operationalPostgresAuthorityRequired()) return listDurableJobs(status);
  const jobs: DurableJob[] = [];
  for (const merchantId of await merchantIds()) {
    const tenantJobs = await withMerchantOperationalTransaction(merchantId, async (client) => {
      const rows = await client.query<JobRow>(
        `${JOB_SELECT}
          WHERE merchant_id = $1
            AND ($2::text IS NULL OR status = $2::background_job_status)
          ORDER BY created_at DESC, id`,
        [merchantId, status || null],
      );
      return Promise.all(rows.rows.map((row) => hydrateJob(client, row)));
    });
    jobs.push(...tenantJobs);
  }
  return jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function listDurableJobSummariesAuthoritative(
  status?: DurableJobStatus,
): Promise<DurableJobSummary[]> {
  if (!operationalPostgresAuthorityRequired()) return listDurableJobSummaries(status);
  const summaries: DurableJobSummary[] = [];
  for (const merchantId of await merchantIds()) {
    for (const row of await listRowsForMerchant(merchantId, status)) {
      const base = rowBase(row);
      summaries.push({
        ...base,
        has_payload: Boolean(row.payload_hash),
        has_result: Boolean(publicResult(row.result)),
      });
    }
  }
  return summaries.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function findJobTenant(jobId: string): Promise<string | null> {
  for (const merchantId of await merchantIds()) {
    const found = await withMerchantOperationalTransaction(merchantId, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM background_jobs WHERE merchant_id = $1 AND id = $2 LIMIT 1`,
        [merchantId, jobId],
      );
      return Boolean(result.rows[0]);
    });
    if (found) return merchantId;
  }
  return null;
}

async function latestRequeueSafe(
  client: OperationalSqlClient,
  jobId: string,
): Promise<boolean> {
  const result = await client.query<{ requeue_safe: string | null }>(
    `SELECT metadata->>'requeue_safe' AS requeue_safe
       FROM job_dead_letters
      WHERE job_id = $1
      ORDER BY occurrence DESC
      LIMIT 1`,
    [jobId],
  );
  return result.rows[0]?.requeue_safe === "true";
}

export async function blockDeadLetterJobRequeueAuthoritative(
  jobId: string,
  merchantIdValue?: string,
): Promise<DurableJob> {
  if (!operationalPostgresAuthorityRequired()) return blockDeadLetterJobRequeue(jobId);
  const merchantId = text(merchantIdValue) || (await findJobTenant(jobId));
  if (!merchantId) throw new Error("durable job was not found");
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const row = await client.query<JobRow>(
      `${JOB_SELECT} WHERE merchant_id = $1 AND id = $2 FOR UPDATE`,
      [merchantId, jobId],
    );
    const current = row.rows[0];
    if (!current || current.status !== "dead_letter") {
      throw new Error("only dead-letter jobs can have requeue blocked");
    }
    await client.query(
      `UPDATE job_dead_letters
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{requeue_safe}', 'false'::jsonb, true)
        WHERE id = (
          SELECT id FROM job_dead_letters
           WHERE job_id = $1 ORDER BY occurrence DESC LIMIT 1
        )`,
      [jobId],
    );
    const result = {
      ...(current.result || {}),
      [INTERNAL_REQUEUE_POLICY]: "blocked",
    };
    const updated = await client.query<JobRow>(
      `UPDATE background_jobs
          SET result = $3::jsonb, updated_at = now()
        WHERE merchant_id = $1 AND id = $2
        RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                  status::text AS status, attempts, max_attempts, requeue_count,
                  available_at, locked_at, locked_by, lease_expires_at,
                  lease_generation, last_error_code, result, completed_at,
                  dead_lettered_at, created_at, updated_at`,
      [merchantId, jobId, JSON.stringify(result)],
    );
    return hydrateJob(client, updated.rows[0]!);
  });
}

export async function requeueDeadLetterJobAuthoritative(
  jobId: string,
  now: Date = new Date(),
): Promise<DurableJob> {
  if (!operationalPostgresAuthorityRequired()) return requeueDeadLetterJob(jobId, now);
  const merchantId = await findJobTenant(jobId);
  if (!merchantId) throw new Error("durable job was not found");
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const row = await client.query<JobRow>(
      `${JOB_SELECT} WHERE merchant_id = $1 AND id = $2 FOR UPDATE`,
      [merchantId, jobId],
    );
    const current = row.rows[0];
    if (!current || current.status !== "dead_letter") {
      throw new Error("only dead-letter jobs can be requeued");
    }
    if (!(await latestRequeueSafe(client, jobId))) {
      throw Object.assign(
        new Error("dead-letter outcome is uncertain and cannot be requeued safely"),
        { code: "DURABLE_JOB_REQUEUE_BLOCKED" },
      );
    }
    await client.query(
      `UPDATE job_dead_letters
          SET requeued_at = $2::timestamptz
        WHERE id = (
          SELECT id FROM job_dead_letters
           WHERE job_id = $1 ORDER BY occurrence DESC LIMIT 1
        )`,
      [jobId, now.toISOString()],
    );
    const updated = await client.query<JobRow>(
      `UPDATE background_jobs
          SET status = 'queued', attempts = 0, requeue_count = requeue_count + 1,
              available_at = $3::timestamptz, locked_at = NULL, locked_by = NULL,
              lease_expires_at = NULL, lease_generation = NULL,
              last_error_code = NULL, result = '{}'::jsonb,
              completed_at = NULL, dead_lettered_at = NULL, updated_at = $3::timestamptz
        WHERE merchant_id = $1 AND id = $2
        RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                  status::text AS status, attempts, max_attempts, requeue_count,
                  available_at, locked_at, locked_by, lease_expires_at,
                  lease_generation, last_error_code, result, completed_at,
                  dead_lettered_at, created_at, updated_at`,
      [merchantId, jobId, now.toISOString()],
    );
    return hydrateJob(client, updated.rows[0]!);
  });
}

async function expiredJobsForMerchant(
  merchantId: string,
  acceptedTypes: string[],
  now: Date,
): Promise<DurableJob[]> {
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<JobRow>(
      `${JOB_SELECT}
        WHERE merchant_id = $1 AND status = 'processing'
          AND lease_expires_at <= $2::timestamptz
          AND type = ANY($3::text[])
        ORDER BY lease_expires_at, id`,
      [merchantId, now.toISOString(), acceptedTypes],
    );
    return Promise.all(result.rows.map((row) => hydrateJob(client, row)));
  });
}

async function settleExpired(
  job: DurableJob,
  resolution: ExpiredJobResolution,
  now: Date,
): Promise<DurableJob | null> {
  const merchantId = text(job.merchant_id);
  if (!merchantId) return null;
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<JobRow>(
      `${JOB_SELECT}
        WHERE merchant_id = $1 AND id = $2 AND status = 'processing'
          AND locked_by = $3
        FOR UPDATE`,
      [merchantId, job.id, job.locked_by || ""],
    );
    const current = result.rows[0];
    if (!current) return null;
    if (resolution.action === "complete") {
      const updated = await client.query<JobRow>(
        `UPDATE background_jobs
            SET status = 'completed', result = $4::jsonb, completed_at = $5::timestamptz,
                locked_at = NULL, locked_by = NULL, lease_expires_at = NULL,
                lease_generation = NULL, last_error_code = NULL, updated_at = $5::timestamptz
          WHERE merchant_id = $1 AND id = $2 AND locked_by = $3
          RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                    status::text AS status, attempts, max_attempts, requeue_count,
                    available_at, locked_at, locked_by, lease_expires_at,
                    lease_generation, last_error_code, result, completed_at,
                    dead_lettered_at, created_at, updated_at`,
        [
          merchantId,
          job.id,
          job.locked_by || "",
          JSON.stringify(resolution.result || {}),
          now.toISOString(),
        ],
      );
      await finishAttempt(client, job.id, current.attempts, "timed_out", null, now);
      return hydrateJob(client, updated.rows[0]!);
    }
    const retry = resolution.action === "retry" && current.attempts < current.max_attempts;
    if (retry) {
      const availableAt = new Date(now.getTime() + retryDelayMs(current.attempts));
      const updated = await client.query<JobRow>(
        `UPDATE background_jobs
            SET status = 'retry', available_at = $4::timestamptz,
                locked_at = NULL, locked_by = NULL, lease_expires_at = NULL,
                lease_generation = NULL, last_error_code = $5,
                updated_at = $6::timestamptz
          WHERE merchant_id = $1 AND id = $2 AND locked_by = $3
          RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                    status::text AS status, attempts, max_attempts, requeue_count,
                    available_at, locked_at, locked_by, lease_expires_at,
                    lease_generation, last_error_code, result, completed_at,
                    dead_lettered_at, created_at, updated_at`,
        [
          merchantId,
          job.id,
          job.locked_by || "",
          availableAt.toISOString(),
          resolution.code,
          now.toISOString(),
        ],
      );
      await finishAttempt(client, job.id, current.attempts, "timed_out", resolution.code, now);
      return hydrateJob(client, updated.rows[0]!);
    }
    return deadLetter(client, current, resolution.code, resolution.action === "retry", now);
  });
}

async function claimForMerchant(
  merchantId: string,
  workerId: string,
  acceptedTypes: string[],
  visibilityTimeoutMs: number,
  now: Date,
): Promise<DurableJob | null> {
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const candidate = await client.query<JobRow>(
      `${JOB_SELECT}
        WHERE merchant_id = $1
          AND status IN ('queued', 'retry')
          AND available_at <= $2::timestamptz
          AND type = ANY($3::text[])
        ORDER BY priority DESC, available_at, created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [merchantId, now.toISOString(), acceptedTypes],
    );
    const row = candidate.rows[0];
    if (!row) return null;
    const leaseExpiry = new Date(now.getTime() + visibilityTimeoutMs);
    const updated = await client.query<JobRow>(
      `UPDATE background_jobs
          SET status = 'processing', attempts = attempts + 1,
              locked_at = $3::timestamptz, locked_by = $4,
              lease_expires_at = $5::timestamptz,
              lease_generation = attempts + 1,
              updated_at = $3::timestamptz
        WHERE merchant_id = $1 AND id = $2
        RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                  status::text AS status, attempts, max_attempts, requeue_count,
                  available_at, locked_at, locked_by, lease_expires_at,
                  lease_generation, last_error_code, result, completed_at,
                  dead_lettered_at, created_at, updated_at`,
      [merchantId, row.id, now.toISOString(), workerId, leaseExpiry.toISOString()],
    );
    const claimed = updated.rows[0]!;
    await client.query(
      `INSERT INTO job_attempts
        (id, job_id, attempt_number, worker_id, lease_generation, status, started_at)
       VALUES ($1, $2, $3, $4, $5, 'processing', $6::timestamptz)`,
      [
        `attempt-${crypto.randomUUID()}`,
        claimed.id,
        claimed.attempts,
        workerId,
        claimed.lease_generation || claimed.attempts,
        now.toISOString(),
      ],
    );
    return hydrateJob(client, claimed);
  });
}

async function heartbeat(
  job: DurableJob,
  workerId: string,
  visibilityTimeoutMs: number,
): Promise<void> {
  const merchantId = text(job.merchant_id);
  if (!merchantId) return;
  const now = new Date();
  await withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<{ id: string }>(
      `UPDATE background_jobs
          SET locked_at = $4::timestamptz,
              lease_expires_at = $5::timestamptz,
              updated_at = $4::timestamptz
        WHERE merchant_id = $1 AND id = $2
          AND status = 'processing' AND locked_by = $3
        RETURNING id`,
      [
        merchantId,
        job.id,
        workerId,
        now.toISOString(),
        new Date(now.getTime() + visibilityTimeoutMs).toISOString(),
      ],
    );
    if (!result.rows[0]) throw new Error("durable job claim was lost");
  });
}

async function finishAttempt(
  client: OperationalSqlClient,
  jobId: string,
  attemptNumber: number,
  status: "succeeded" | "failed" | "timed_out",
  errorCode: string | null,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE job_attempts
        SET status = $3::job_attempt_status, error_code = $4,
            finished_at = $5::timestamptz
      WHERE job_id = $1 AND attempt_number = $2 AND status = 'processing'`,
    [jobId, attemptNumber, status, errorCode, now.toISOString()],
  );
}

async function deadLetter(
  client: OperationalSqlClient,
  current: JobRow,
  errorCode: string,
  requeueSafe: boolean,
  now: Date,
): Promise<DurableJob> {
  const policy = requeueSafe ? "safe" : "blocked";
  const result = {
    ...(current.result || {}),
    [INTERNAL_REQUEUE_POLICY]: policy,
  };
  const updated = await client.query<JobRow>(
    `UPDATE background_jobs
        SET status = 'dead_letter', last_error_code = $3,
            result = $4::jsonb, dead_lettered_at = $5::timestamptz,
            locked_at = NULL, locked_by = NULL, lease_expires_at = NULL,
            lease_generation = NULL, updated_at = $5::timestamptz
      WHERE merchant_id = $1 AND id = $2
      RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                status::text AS status, attempts, max_attempts, requeue_count,
                available_at, locked_at, locked_by, lease_expires_at,
                lease_generation, last_error_code, result, completed_at,
                dead_lettered_at, created_at, updated_at`,
    [current.merchant_id, current.id, errorCode, JSON.stringify(result), now.toISOString()],
  );
  const occurrenceResult = await client.query<{ occurrence: number }>(
    `SELECT COALESCE(MAX(occurrence), 0) + 1 AS occurrence
       FROM job_dead_letters WHERE job_id = $1`,
    [current.id],
  );
  const occurrence = Number(occurrenceResult.rows[0]?.occurrence || 1);
  await client.query(
    `INSERT INTO job_dead_letters
      (id, job_id, occurrence, reason_code, attempts, payload_sha256, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)`,
    [
      `dlq-${crypto.randomUUID()}`,
      current.id,
      occurrence,
      errorCode,
      current.attempts,
      current.payload_hash,
      JSON.stringify({ requeue_safe: requeueSafe }),
      now.toISOString(),
    ],
  );
  await finishAttempt(client, current.id, current.attempts, "failed", errorCode, now);
  return hydrateJob(client, updated.rows[0]!);
}

async function completeJob(
  job: DurableJob,
  workerId: string,
  result: Record<string, unknown>,
): Promise<DurableJob> {
  const merchantId = text(job.merchant_id);
  if (!merchantId) throw new Error("durable job tenant is unavailable");
  const now = new Date();
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const current = await client.query<JobRow>(
      `${JOB_SELECT}
        WHERE merchant_id = $1 AND id = $2 AND status = 'processing'
          AND locked_by = $3 FOR UPDATE`,
      [merchantId, job.id, workerId],
    );
    if (!current.rows[0]) throw new Error("durable job claim was lost");
    const updated = await client.query<JobRow>(
      `UPDATE background_jobs
          SET status = 'completed', result = $4::jsonb,
              completed_at = $5::timestamptz, last_error_code = NULL,
              locked_at = NULL, locked_by = NULL, lease_expires_at = NULL,
              lease_generation = NULL, updated_at = $5::timestamptz
        WHERE merchant_id = $1 AND id = $2 AND locked_by = $3
        RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                  status::text AS status, attempts, max_attempts, requeue_count,
                  available_at, locked_at, locked_by, lease_expires_at,
                  lease_generation, last_error_code, result, completed_at,
                  dead_lettered_at, created_at, updated_at`,
      [merchantId, job.id, workerId, JSON.stringify(result || {}), now.toISOString()],
    );
    await finishAttempt(client, job.id, current.rows[0].attempts, "succeeded", null, now);
    return hydrateJob(client, updated.rows[0]!);
  });
}

async function failJob(
  job: DurableJob,
  workerId: string,
  error: unknown,
): Promise<DurableJob> {
  const merchantId = text(job.merchant_id);
  if (!merchantId) throw new Error("durable job tenant is unavailable");
  const now = new Date();
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const currentResult = await client.query<JobRow>(
      `${JOB_SELECT}
        WHERE merchant_id = $1 AND id = $2 AND status = 'processing'
          AND locked_by = $3 FOR UPDATE`,
      [merchantId, job.id, workerId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("durable job claim was lost");
    const failure = safeError(error);
    if (!failure.retryable || current.attempts >= current.max_attempts) {
      return deadLetter(client, current, failure.code, failure.requeueSafe, now);
    }
    const availableAt = new Date(now.getTime() + retryDelayMs(current.attempts));
    const updated = await client.query<JobRow>(
      `UPDATE background_jobs
          SET status = 'retry', available_at = $4::timestamptz,
              last_error_code = $5, locked_at = NULL, locked_by = NULL,
              lease_expires_at = NULL, lease_generation = NULL,
              updated_at = $6::timestamptz
        WHERE merchant_id = $1 AND id = $2 AND locked_by = $3
        RETURNING id, type, dedupe_key, merchant_id, payload_hash, priority,
                  status::text AS status, attempts, max_attempts, requeue_count,
                  available_at, locked_at, locked_by, lease_expires_at,
                  lease_generation, last_error_code, result, completed_at,
                  dead_lettered_at, created_at, updated_at`,
      [
        merchantId,
        job.id,
        workerId,
        availableAt.toISOString(),
        failure.code,
        now.toISOString(),
      ],
    );
    await finishAttempt(client, job.id, current.attempts, "failed", failure.code, now);
    return hydrateJob(client, updated.rows[0]!);
  });
}

export function startDurableJobWorkerAuthoritative(options: {
  workerId: string;
  handlers: Record<string, DurableJobHandler>;
  pollIntervalMs?: number;
  visibilityTimeoutMs?: number;
  onDeadLetter?: (job: DurableJob) => Promise<void> | void;
  reconcileExpiredJob?: (
    job: DurableJob,
  ) => Promise<ExpiredJobResolution> | ExpiredJobResolution;
}): DurableJobWorker {
  if (!operationalPostgresAuthorityRequired()) return startDurableJobWorker(options);
  const workerId = text(options.workerId);
  if (!workerId) throw new Error("worker id is required");
  const handlers = options.handlers || {};
  const acceptedTypes = Object.keys(handlers);
  if (acceptedTypes.length === 0) {
    throw new Error("at least one durable job handler is required");
  }
  const visibilityTimeoutMs = positiveInteger(
    options.visibilityTimeoutMs,
    DEFAULT_VISIBILITY_TIMEOUT_MS,
  );
  let stopped = false;
  let running = false;
  let cursor = 0;

  const runOnce = async (): Promise<boolean> => {
    if (stopped || running) return false;
    running = true;
    try {
      const tenants = await merchantIds();
      const now = new Date();
      for (const merchantId of tenants) {
        for (const expired of await expiredJobsForMerchant(
          merchantId,
          acceptedTypes,
          now,
        )) {
          let resolution: ExpiredJobResolution = {
            action: "dead_letter",
            code: "JOB_VISIBILITY_TIMEOUT_OUTCOME_UNCERTAIN",
            message: "worker claim expired and delivery outcome is uncertain",
          };
          if (options.reconcileExpiredJob) {
            try {
              resolution = await options.reconcileExpiredJob(expired);
            } catch {
              resolution = {
                action: "dead_letter",
                code: "JOB_RECONCILIATION_FAILED",
                message: "expired job reconciliation failed",
              };
            }
          }
          const settled = await settleExpired(expired, resolution, now);
          if (settled?.status === "dead_letter") await options.onDeadLetter?.(settled);
        }
      }
      if (tenants.length === 0) return false;
      for (let offset = 0; offset < tenants.length; offset += 1) {
        const index = (cursor + offset) % tenants.length;
        const job = await claimForMerchant(
          tenants[index],
          workerId,
          acceptedTypes,
          visibilityTimeoutMs,
          new Date(),
        );
        if (!job) continue;
        cursor = (index + 1) % tenants.length;
        const handler = handlers[job.type];
        const heartbeatInterval = setInterval(() => {
          void heartbeat(job, workerId, visibilityTimeoutMs).catch(() => undefined);
        }, Math.max(1_000, Math.floor(visibilityTimeoutMs / 3)));
        heartbeatInterval.unref();
        try {
          const result = await handler(job);
          await completeJob(job, workerId, result || {});
        } catch (error) {
          const failed = await failJob(job, workerId, error);
          if (failed.status === "dead_letter") await options.onDeadLetter?.(failed);
        } finally {
          clearInterval(heartbeatInterval);
        }
        return true;
      }
      return false;
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void runOnce().catch(() => {
      console.error("Durable PostgreSQL job worker polling failed", {
        worker_id: workerId,
      });
    });
  }, positiveInteger(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS));
  interval.unref();

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
    runOnce,
  };
}
