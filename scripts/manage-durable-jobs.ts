#!/usr/bin/env node
import {
  listDurableJobSummaries,
  requeueDeadLetterJob,
  type DurableJobStatus,
} from "../artifacts/api-server/src/services/durableJobQueue";

const allowedStatuses = new Set<DurableJobStatus>([
  "queued",
  "processing",
  "retry",
  "completed",
  "dead_letter",
]);

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): never {
  process.stderr.write(
    "Usage: manage-durable-jobs.ts list [status] | requeue <job-id>\n",
  );
  process.exit(2);
}

const [command, argument] = process.argv.slice(2);
if (command === "list") {
  const status = argument && allowedStatuses.has(argument as DurableJobStatus)
    ? (argument as DurableJobStatus)
    : undefined;
  if (argument && !status) usage();
  print({ jobs: listDurableJobSummaries(status), payloads_included: false });
} else if (command === "requeue") {
  if (!argument) usage();
  try {
    const requeued = requeueDeadLetterJob(argument);
    print({
      ok: true,
      job: listDurableJobSummaries().find((item) => item.id === requeued.id),
      payloads_included: false,
    });
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException).code || "").trim();
    print({
      ok: false,
      code: code || "DURABLE_JOB_REQUEUE_FAILED",
      error:
        code === "DURABLE_JOB_REQUEUE_BLOCKED"
          ? "dead-letter outcome is uncertain and cannot be requeued safely"
          : "durable job could not be requeued",
    });
    process.exitCode = 1;
  }
} else {
  usage();
}
