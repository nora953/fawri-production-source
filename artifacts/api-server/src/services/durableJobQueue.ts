import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

export type DurableJobStatus =
  | "queued"
  | "processing"
  | "retry"
  | "completed"
  | "dead_letter";

export type DurableJobRequeuePolicy = "safe" | "blocked";

export type DurableJob = {
  id: string;
  type: string;
  dedupe_key: string;
  merchant_id?: string;
  payload: Record<string, unknown>;
  priority: number;
  status: DurableJobStatus;
  attempts: number;
  max_attempts: number;
  available_at: string;
  locked_at?: string;
  locked_by?: string;
  lease_expires_at?: string;
  last_error_code?: string;
  last_error_message?: string;
  requeue_policy?: DurableJobRequeuePolicy;
  result?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  dead_lettered_at?: string;
};

type DurableJobStore = {
  version: 2;
  jobs: DurableJob[];
};

export type EnqueueDurableJobInput = {
  type: string;
  dedupeKey: string;
  merchantId?: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  availableAt?: Date;
};

export type DurableJobHandler = (
  job: DurableJob,
) => Promise<Record<string, unknown> | void>;

export type DurableJobWorker = {
  stop(): void;
  runOnce(): Promise<boolean>;
};

export type ExpiredJobResolution =
  | { action: "complete"; result?: Record<string, unknown> }
  | { action: "retry"; code: string; message?: string }
  | { action: "dead_letter"; code: string; message?: string };

export type DurableJobSummary = Omit<
  DurableJob,
  "payload" | "result" | "last_error_message"
> & {
  has_payload: boolean;
  has_result: boolean;
};

const STORE_VERSION = 2 as const;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 2 * 60 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const MAX_SAFE_ERROR_LENGTH = 300;

function queuePath(): string {
  return getFawriDataFilePath("background-jobs.json");
}

function lockPath(): string {
  return `${queuePath()}.lock`;
}

function makeId(): string {
  return `job-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

function normalizedText(value: unknown): string {
  return String(value || "").trim();
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validDate(value: unknown): Date | null {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function safeStoredMessage(value: unknown): string {
  const text = normalizedText(value)
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /(access[_-]?token|authorization|cookie|secret|password)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi,
      "$1=[redacted]",
    );
  return (text || "job handler failed").slice(0, MAX_SAFE_ERROR_LENGTH);
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function normalizeJob(value: unknown): DurableJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const job = value as DurableJob;
  if (!normalizedText(job.id) || !normalizedText(job.type) || !normalizedText(job.dedupe_key)) {
    return null;
  }
  return {
    ...job,
    priority: Number.isInteger(job.priority) ? job.priority : 0,
    attempts: positiveInteger(job.attempts, 0),
    max_attempts: positiveInteger(job.max_attempts, DEFAULT_MAX_ATTEMPTS),
    payload:
      job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
        ? job.payload
        : {},
    requeue_policy:
      job.requeue_policy === "safe" || job.requeue_policy === "blocked"
        ? job.requeue_policy
        : undefined,
  };
}

function readStore(): DurableJobStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath(), "utf8")) as {
      version?: unknown;
      jobs?: unknown;
    };
    if (![1, STORE_VERSION].includes(Number(parsed.version)) || !Array.isArray(parsed.jobs)) {
      throw new Error("durable job queue store has an unsupported shape");
    }
    return {
      version: STORE_VERSION,
      jobs: parsed.jobs.map(normalizeJob).filter((job): job is DurableJob => job !== null),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: STORE_VERSION, jobs: [] };
    }
    throw error;
  }
}

type QueueLock = { descriptor: number; token: string };

function acquireLock(): QueueLock {
  const filePath = lockPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = fs.openSync(filePath, "wx", 0o600);
      const token = crypto.randomBytes(18).toString("hex");
      fs.writeFileSync(
        descriptor,
        JSON.stringify({
          pid: process.pid,
          token,
          acquired_at: new Date().toISOString(),
        }),
      );
      fs.fsyncSync(descriptor);
      return { descriptor, token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      try {
        const statistics = fs.statSync(filePath);
        if (Date.now() - statistics.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(filePath);
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }

      const busyError = new Error("durable job queue is busy");
      (busyError as NodeJS.ErrnoException).code = "DURABLE_QUEUE_BUSY";
      throw busyError;
    }
  }

  throw new Error("unable to acquire durable job queue lock");
}

function releaseLock(lock: QueueLock): void {
  try {
    fs.closeSync(lock.descriptor);
  } finally {
    try {
      const current = JSON.parse(fs.readFileSync(lockPath(), "utf8")) as {
        token?: unknown;
      };
      if (current.token === lock.token) fs.unlinkSync(lockPath());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function withStoreLock<T>(callback: (store: DurableJobStore) => T): T {
  const lock = acquireLock();
  try {
    const store = readStore();
    const result = callback(store);
    writeJsonAtomically(queuePath(), store);
    return result;
  } finally {
    releaseLock(lock);
  }
}

function pruneCompletedJobs(store: DurableJobStore, now: Date): void {
  store.jobs = store.jobs.filter((job) => {
    if (job.status !== "completed") return true;
    const completedAt = validDate(job.completed_at)?.getTime();
    return Boolean(completedAt && now.getTime() - completedAt <= COMPLETED_RETENTION_MS);
  });
}

function retryDelayMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.max(0, attempts - 1));
}

function safeError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  requeueSafe: boolean;
} {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: normalizedText(record.code) || "JOB_HANDLER_FAILED",
      message: safeStoredMessage(record.safeMessage || record.message),
      retryable: record.retryable !== false,
      requeueSafe: record.requeueSafe === true || record.retryable !== false,
    };
  }
  return {
    code: "JOB_HANDLER_FAILED",
    message: safeStoredMessage(error),
    retryable: true,
    requeueSafe: true,
  };
}

function assertClaim(job: DurableJob, workerId: string): void {
  if (job.status !== "processing" || job.locked_by !== workerId) {
    throw new Error("durable job is not claimed by this worker");
  }
}

export function enqueueDurableJob(
  input: EnqueueDurableJobInput,
  now: Date = new Date(),
): { job: DurableJob; deduplicated: boolean } {
  const type = normalizedText(input.type);
  const dedupeKey = normalizedText(input.dedupeKey);
  if (!type || !dedupeKey) {
    throw new Error("durable job type and dedupe key are required");
  }
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    throw new Error("durable job payload must be an object");
  }

  return withStoreLock((store) => {
    pruneCompletedJobs(store, now);
    const existing = store.jobs.find(
      (job) => job.type === type && job.dedupe_key === dedupeKey,
    );
    if (existing) return { job: structuredClone(existing), deduplicated: true };

    const timestamp = now.toISOString();
    const job: DurableJob = {
      id: makeId(),
      type,
      dedupe_key: dedupeKey,
      ...(normalizedText(input.merchantId)
        ? { merchant_id: normalizedText(input.merchantId) }
        : {}),
      payload: structuredClone(input.payload),
      priority: Number.isInteger(input.priority) ? Number(input.priority) : 0,
      status: "queued",
      attempts: 0,
      max_attempts: positiveInteger(input.maxAttempts, DEFAULT_MAX_ATTEMPTS),
      available_at: (input.availableAt || now).toISOString(),
      created_at: timestamp,
      updated_at: timestamp,
    };
    store.jobs.push(job);
    return { job: structuredClone(job), deduplicated: false };
  });
}

export function listExpiredProcessingJobs(
  now: Date = new Date(),
  visibilityTimeoutMs = DEFAULT_VISIBILITY_TIMEOUT_MS,
): DurableJob[] {
  const timeout = positiveInteger(visibilityTimeoutMs, DEFAULT_VISIBILITY_TIMEOUT_MS);
  return readStore().jobs
    .filter((job) => {
      if (job.status !== "processing") return false;
      const leaseExpiry = validDate(job.lease_expires_at)?.getTime();
      if (leaseExpiry) return leaseExpiry <= now.getTime();
      const lockedAt = validDate(job.locked_at)?.getTime();
      return !lockedAt || now.getTime() - lockedAt >= timeout;
    })
    .map((job) => structuredClone(job));
}

export function resolveExpiredDurableJob(
  jobId: string,
  expectedWorkerId: string | undefined,
  resolution: ExpiredJobResolution,
  now: Date = new Date(),
): DurableJob | null {
  return withStoreLock((store) => {
    const job = store.jobs.find((item) => item.id === jobId);
    if (!job || job.status !== "processing") return null;
    if (expectedWorkerId && job.locked_by !== expectedWorkerId) return null;

    job.locked_at = undefined;
    job.locked_by = undefined;
    job.lease_expires_at = undefined;
    job.updated_at = now.toISOString();

    if (resolution.action === "complete") {
      job.status = "completed";
      job.result = structuredClone(resolution.result || {});
      job.completed_at = now.toISOString();
      job.last_error_code = undefined;
      job.last_error_message = undefined;
      job.requeue_policy = undefined;
      return structuredClone(job);
    }

    job.last_error_code = resolution.code;
    job.last_error_message = safeStoredMessage(resolution.message);
    if (resolution.action === "retry") {
      job.requeue_policy = "safe";
      if (job.attempts >= job.max_attempts) {
        job.status = "dead_letter";
        job.dead_lettered_at = now.toISOString();
      } else {
        job.status = "retry";
        job.available_at = new Date(
          now.getTime() + retryDelayMs(job.attempts),
        ).toISOString();
      }
      return structuredClone(job);
    }

    job.status = "dead_letter";
    job.requeue_policy = "blocked";
    job.dead_lettered_at = now.toISOString();
    return structuredClone(job);
  });
}

export function claimNextDurableJob(
  workerId: string,
  options: {
    now?: Date;
    visibilityTimeoutMs?: number;
    acceptedTypes?: string[];
  } = {},
): DurableJob | null {
  const normalizedWorkerId = normalizedText(workerId);
  if (!normalizedWorkerId) throw new Error("worker id is required");
  const now = options.now || new Date();
  const visibilityTimeoutMs = positiveInteger(
    options.visibilityTimeoutMs,
    DEFAULT_VISIBILITY_TIMEOUT_MS,
  );
  const acceptedTypes = new Set(
    (options.acceptedTypes || []).map(normalizedText).filter(Boolean),
  );

  return withStoreLock((store) => {
    pruneCompletedJobs(store, now);
    const candidates = store.jobs
      .filter(
        (job) =>
          (job.status === "queued" || job.status === "retry") &&
          (acceptedTypes.size === 0 || acceptedTypes.has(job.type)) &&
          (validDate(job.available_at)?.getTime() || Infinity) <= now.getTime(),
      )
      .sort((left, right) => {
        if (left.priority !== right.priority) return right.priority - left.priority;
        const leftAvailable = validDate(left.available_at)?.getTime() || Infinity;
        const rightAvailable = validDate(right.available_at)?.getTime() || Infinity;
        if (leftAvailable !== rightAvailable) return leftAvailable - rightAvailable;
        return left.created_at.localeCompare(right.created_at);
      });

    const job = candidates[0];
    if (!job) return null;

    job.status = "processing";
    job.attempts += 1;
    job.locked_at = now.toISOString();
    job.locked_by = normalizedWorkerId;
    job.lease_expires_at = new Date(now.getTime() + visibilityTimeoutMs).toISOString();
    job.updated_at = now.toISOString();
    return structuredClone(job);
  });
}

export function heartbeatDurableJob(
  jobId: string,
  workerId: string,
  visibilityTimeoutMs = DEFAULT_VISIBILITY_TIMEOUT_MS,
  now: Date = new Date(),
): boolean {
  return withStoreLock((store) => {
    const job = store.jobs.find((item) => item.id === jobId);
    if (!job) return false;
    assertClaim(job, workerId);
    job.locked_at = now.toISOString();
    job.lease_expires_at = new Date(
      now.getTime() + positiveInteger(visibilityTimeoutMs, DEFAULT_VISIBILITY_TIMEOUT_MS),
    ).toISOString();
    job.updated_at = now.toISOString();
    return true;
  });
}

export function completeDurableJob(
  jobId: string,
  workerId: string,
  result: Record<string, unknown> = {},
  now: Date = new Date(),
): DurableJob {
  return withStoreLock((store) => {
    const job = store.jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("durable job was not found");
    assertClaim(job, workerId);

    job.status = "completed";
    job.result = structuredClone(result);
    job.completed_at = now.toISOString();
    job.updated_at = now.toISOString();
    job.locked_at = undefined;
    job.locked_by = undefined;
    job.lease_expires_at = undefined;
    job.last_error_code = undefined;
    job.last_error_message = undefined;
    job.requeue_policy = undefined;
    return structuredClone(job);
  });
}

export function failDurableJob(
  jobId: string,
  workerId: string,
  error: unknown,
  now: Date = new Date(),
): DurableJob {
  return withStoreLock((store) => {
    const job = store.jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("durable job was not found");
    assertClaim(job, workerId);

    const failure = safeError(error);
    job.last_error_code = failure.code;
    job.last_error_message = failure.message;
    job.updated_at = now.toISOString();
    job.locked_at = undefined;
    job.locked_by = undefined;
    job.lease_expires_at = undefined;

    if (!failure.retryable || job.attempts >= job.max_attempts) {
      job.status = "dead_letter";
      job.requeue_policy = failure.requeueSafe ? "safe" : "blocked";
      job.dead_lettered_at = now.toISOString();
    } else {
      job.status = "retry";
      job.requeue_policy = "safe";
      job.available_at = new Date(now.getTime() + retryDelayMs(job.attempts)).toISOString();
    }
    return structuredClone(job);
  });
}

export function requeueDeadLetterJob(
  jobId: string,
  now: Date = new Date(),
): DurableJob {
  return withStoreLock((store) => {
    const job = store.jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("durable job was not found");
    if (job.status !== "dead_letter") {
      throw new Error("only dead-letter jobs can be requeued");
    }
    if (job.requeue_policy !== "safe") {
      const error = new Error("dead-letter outcome is uncertain and cannot be requeued safely");
      (error as NodeJS.ErrnoException).code = "DURABLE_JOB_REQUEUE_BLOCKED";
      throw error;
    }

    job.status = "queued";
    job.attempts = 0;
    job.available_at = now.toISOString();
    job.updated_at = now.toISOString();
    job.dead_lettered_at = undefined;
    job.last_error_code = undefined;
    job.last_error_message = undefined;
    job.requeue_policy = undefined;
    return structuredClone(job);
  });
}

export function blockDeadLetterJobRequeue(
  jobId: string,
  now: Date = new Date(),
): DurableJob {
  return withStoreLock((store) => {
    const job = store.jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("durable job was not found");
    if (job.status !== "dead_letter") {
      throw new Error("only dead-letter jobs can have requeue blocked");
    }
    job.requeue_policy = "blocked";
    job.updated_at = now.toISOString();
    return structuredClone(job);
  });
}

export function listDurableJobs(status?: DurableJobStatus): DurableJob[] {
  return readStore().jobs
    .filter((job) => !status || job.status === status)
    .map((job) => structuredClone(job));
}

export function listDurableJobSummaries(
  status?: DurableJobStatus,
): DurableJobSummary[] {
  return listDurableJobs(status).map(({ payload, result, last_error_message: _message, ...job }) => ({
    ...job,
    has_payload: Object.keys(payload || {}).length > 0,
    has_result: Boolean(result && Object.keys(result).length > 0),
  }));
}

export function startDurableJobWorker(options: {
  workerId: string;
  handlers: Record<string, DurableJobHandler>;
  pollIntervalMs?: number;
  visibilityTimeoutMs?: number;
  onDeadLetter?: (job: DurableJob) => Promise<void> | void;
  reconcileExpiredJob?: (
    job: DurableJob,
  ) => Promise<ExpiredJobResolution> | ExpiredJobResolution;
}): DurableJobWorker {
  const workerId = normalizedText(options.workerId);
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

  const reconcileExpired = async (): Promise<void> => {
    const expired = listExpiredProcessingJobs(new Date(), visibilityTimeoutMs).filter(
      (job) => acceptedTypes.includes(job.type),
    );
    for (const job of expired) {
      let resolution: ExpiredJobResolution = {
        action: "dead_letter",
        code: "JOB_VISIBILITY_TIMEOUT_OUTCOME_UNCERTAIN",
        message: "worker claim expired and delivery outcome is uncertain",
      };
      if (options.reconcileExpiredJob) {
        try {
          resolution = await options.reconcileExpiredJob(job);
        } catch {
          resolution = {
            action: "dead_letter",
            code: "JOB_RECONCILIATION_FAILED",
            message: "expired job reconciliation failed",
          };
        }
      }
      const settled = resolveExpiredDurableJob(job.id, job.locked_by, resolution);
      if (settled?.status === "dead_letter") await options.onDeadLetter?.(settled);
    }
  };

  const runOnce = async (): Promise<boolean> => {
    if (stopped || running) return false;
    running = true;
    try {
      await reconcileExpired();
      const job = claimNextDurableJob(workerId, {
        acceptedTypes,
        visibilityTimeoutMs,
      });
      if (!job) return false;

      const handler = handlers[job.type];
      if (!handler) {
        const failed = failDurableJob(
          job.id,
          workerId,
          Object.assign(new Error("durable job handler is unavailable"), {
            code: "JOB_HANDLER_UNAVAILABLE",
            retryable: false,
            requeueSafe: false,
          }),
        );
        if (failed.status === "dead_letter") await options.onDeadLetter?.(failed);
        return true;
      }

      const heartbeatInterval = setInterval(() => {
        try {
          heartbeatDurableJob(job.id, workerId, visibilityTimeoutMs);
        } catch {
          // The handler completion path will discover a lost claim and fail closed.
        }
      }, Math.max(1_000, Math.floor(visibilityTimeoutMs / 3)));
      heartbeatInterval.unref();

      try {
        const result = await handler(job);
        completeDurableJob(job.id, workerId, result || {});
      } catch (error) {
        const failed = failDurableJob(job.id, workerId, error);
        if (failed.status === "dead_letter") await options.onDeadLetter?.(failed);
      } finally {
        clearInterval(heartbeatInterval);
      }
      return true;
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void runOnce().catch(() => {
      console.error("Durable job worker polling failed", { worker_id: workerId });
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
