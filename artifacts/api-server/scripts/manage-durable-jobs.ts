import {
  listDurableJobs,
  requeueDeadLetterJob,
  type DurableJob,
  type DurableJobStatus,
} from "../src/services/durableJobQueue";

const validStatuses = new Set<DurableJobStatus>([
  "queued",
  "processing",
  "retry",
  "completed",
  "dead_letter",
]);

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function safeJob(job: DurableJob, includePayload: boolean) {
  return {
    id: job.id,
    type: job.type,
    dedupe_key: job.dedupe_key,
    merchant_id: job.merchant_id || null,
    priority: job.priority,
    status: job.status,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    available_at: job.available_at,
    locked_at: job.locked_at || null,
    locked_by: job.locked_by || null,
    last_error_code: job.last_error_code || null,
    last_error_message: job.last_error_message || null,
    created_at: job.created_at,
    updated_at: job.updated_at,
    completed_at: job.completed_at || null,
    dead_lettered_at: job.dead_lettered_at || null,
    ...(includePayload ? { payload: job.payload, result: job.result || null } : {}),
  };
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const command = String(process.argv[2] || "list").trim();
const includePayload = flag("--include-payload");
if (
  includePayload &&
  process.env.FAWRI_ALLOW_JOB_PAYLOAD_INSPECTION !== "1"
) {
  throw new Error(
    "FAWRI_ALLOW_JOB_PAYLOAD_INSPECTION=1 is required to include payloads",
  );
}

if (command === "list") {
  const statusValue = argument("--status");
  if (statusValue && !validStatuses.has(statusValue as DurableJobStatus)) {
    throw new Error(`invalid job status: ${statusValue}`);
  }
  const jobs = listDurableJobs(
    statusValue ? (statusValue as DurableJobStatus) : undefined,
  );
  output({
    ok: true,
    mode: "read_only",
    payloads_included: includePayload,
    count: jobs.length,
    jobs: jobs.map((job) => safeJob(job, includePayload)),
  });
} else if (command === "requeue") {
  if (process.env.FAWRI_ALLOW_JOB_REQUEUE !== "1") {
    throw new Error("FAWRI_ALLOW_JOB_REQUEUE=1 is required to requeue a job");
  }
  const jobId = argument("--job-id");
  if (!jobId) throw new Error("--job-id is required");
  const job = requeueDeadLetterJob(jobId);
  output({
    ok: true,
    mode: "write",
    action: "requeue_dead_letter",
    job: safeJob(job, includePayload),
  });
} else {
  throw new Error(`unsupported command: ${command}`);
}
