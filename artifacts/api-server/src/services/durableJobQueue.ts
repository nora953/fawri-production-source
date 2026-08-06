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
  last_error_code?: string;
  last_error_message?: string;
  result?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  dead_lettered_at?: string;
};

type DurableJobStore = {
  version: 1;
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

const STORE_VERSION = 1 as const;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

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

function writeJsonAtomically(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function readStore(): DurableJobStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(queuePath(), "utf8")) as {
      version?: unknown;
      jobs?: unknown;
    };
    if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.jobs)) {
      throw new Error("durable job queue store has an unsupported shape");
    }
    return {
      version: STORE_VERSION,
      jobs: parsed.jobs.filter(
        (item): item is DurableJob =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: STORE_VERSION, jobs: [] };
    }
    throw error;
  }
}

function acquireLock(): number {
  const filePath = lockPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(filePath, "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
      );
      return descriptor;
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

function withStoreLock<T>(callback: (store: DurableJobStore) => T): T {
  const descriptor = acquireLock();
  try {
    const store = readStore();
    const result = callback(store);
    writeJsonAtomically(queuePath(), store);
    return result;
  } finally {
    try {
      fs.closeSync(descriptor);
    } finally {
      try {
        fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

function pruneCompletedJobs(store: DurableJobStore, now: Date): void {
  store.jobs = store.jobs.filter((job) => {
    if (job.status !== "completed") return true;
    const completedAt = validDate(job.completed_at)?.getTime();
    return Boolean(
      completedAt && now.getTime() - completedAt <= COMPLETED_RETENTION_MS,
    );
  });
}

function retryDelayMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.max(0, attempts - 1));
}

function recoverExpiredClaims(
  store: DurableJobStore,
  now: Date,
  visibilityTimeoutMs: number,
): void {
  for (const job of store.jobs) {
    if (job.status !== "processing") continue;
    const lockedAt = validDate(job.locked_at)?.getTime();
    if (
      lockedAt &&
      now.getTime() - lockedAt < visibilityTimeoutMs
    ) {
      continue;
    }

    job.locked_at = undefined;
    job.locked_by = undefined;
    job.last_error_code = "JOB_VISIBILITY_TIMEOUT";
    job.last_error_message = "worker claim expired before completion";
    job.updated_at = now.toISOString();

    if (job.attempts >= job.max_attempts) {
      job.status = "dead_letter";
      job.dead_lettered_at = now.toISOString();
    } else {
      job.status = "retry";
      job.available_at = new Date(
        now.getTime() + retryDelayMs(job.attempts),
      ).toISOString();
    }
  }
}

function safeError(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: normalizedText(record.code) || "JOB_HANDLER_FAILED",
      message:
        normalizedText(record.message) ||
        normalizedText(error) ||
        "job handler failed",
    };
  }
  return {
    code: "JOB_HANDLER_FAILED",
    message: normalizedText(error) || "job handler failed",
  };
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
  if (!input.payload || typeof input.payload !== "object") {
    throw new Error("durable job payload must be an object");
  }

  return withStoreLock((store) => {
    pruneCompletedJobs(store, now);
    const existing = store.jobs.find(
      (job) => job.type === type && job.dedupe_key === dedupeKey,
    );
    if (existing) {
      return { job: structuredClone(existing), deduplicated: true };
    }

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
      max_attempts: positiveInteger(
        input.maxAttempts,
        DEFAULT_MAX_ATTEMPTS,
      ),
      available_at: (input.availableAt || now).toISOString(),
      created_at: timestamp,
      updated_at: timestamp,
    };
    store.jobs.push(job);
    return { job: structuredClone(job), deduplicated: false };
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
    recoverExpiredClaims(store, now, visibilityTimeoutMs);
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
    job.updated_at = now.toISOString();
    return structuredClone(job);
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
    if (job.status !== "processing" || job.locked_by !== workerId) {
      throw new Error("durable job is not claimed by this worker");
    }

    job.status = "completed";
    job.result = structuredClone(result);
    job.completed_at = now.toISOString();
    job.updated_at = now.toISOString();
    job.locked_at = undefined;
    job.locked_by = undefined;
    job.last_error_code = undefined;
    job.last_error_message = undefined;
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
    if (job.status !== "processing" || job.locked_by !== workerId) {
      throw new Error("durable job is not claimed by this worker");
    }

    const failure = safeError(error);
    job.last_error_code = failure.code;
    job.last_error_message = failure.message;
    job.updated_at = now.toISOString();
    job.locked_at = undefined;
    job.locked_by = undefined;

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

    job.status = "queued";
    job.attempts = 0;
    job.available_at = now.toISOString();
    job.updated_at = now.toISOString();
    job.dead_lettered_at = undefined;
    job.last_error_code = undefined;
    job.last_error_message = undefined;
    return structuredClone(job);
  });
}

export function listDurableJobs(status?: DurableJobStatus): DurableJob[] {
  const store = readStore();
  return store.jobs
    .filter((job) => !status || job.status === status)
    .map((job) => structuredClone(job));
}

export function startDurableJobWorker(options: {
  workerId: string;
  handlers: Record<string, DurableJobHandler>;
  pollIntervalMs?: number;
  visibilityTimeoutMs?: number;
  onDeadLetter?: (job: DurableJob) => Promise<void> | void;
}): DurableJobWorker {
  const workerId = normalizedText(options.workerId);
  if (!workerId) throw new Error("worker id is required");
  const handlers = options.handlers || {};
  const acceptedTypes = Object.keys(handlers);
  if (acceptedTypes.length === 0) {
    throw new Error("at least one durable job handler is required");
  }

  let stopped = false;
  let running = false;

  const runOnce = async (): Promise<boolean> => {
    if (stopped || running) return false;
    running = true;
    try {
      const job = claimNextDurableJob(workerId, {
        acceptedTypes,
        visibilityTimeoutMs: options.visibilityTimeoutMs,
      });
      if (!job) return false;

      const handler = handlers[job.type];
      if (!handler) {
        const failed = failDurableJob(
          job.id,
          workerId,
          Object.assign(new Error("durable job handler is unavailable"), {
            code: "JOB_HANDLER_UNAVAILABLE",
          }),
        );
        if (failed.status === "dead_letter") {
          await options.onDeadLetter?.(failed);
        }
        return true;
      }

      try {
        const result = await handler(job);
        completeDurableJob(job.id, workerId, result || {});
      } catch (error) {
        const failed = failDurableJob(job.id, workerId, error);
        if (failed.status === "dead_letter") {
          await options.onDeadLetter?.(failed);
        }
      }
      return true;
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void runOnce();
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
