import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimNextDurableJob,
  completeDurableJob,
  enqueueDurableJob,
  failDurableJob,
  listDurableJobs,
  requeueDeadLetterJob,
  startDurableJobWorker,
} from "../src/services/durableJobQueue";

test("durable queue supports dedupe, priority, retries, DLQ, and requeue", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "fawri-queue-"));
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  try {
    const startedAt = new Date("2026-08-06T12:00:00.000Z");
    const low = enqueueDurableJob(
      {
        type: "meta.webhook",
        dedupeKey: "event-low",
        payload: { value: "low" },
        priority: 0,
      },
      startedAt,
    );
    const high = enqueueDurableJob(
      {
        type: "meta.webhook",
        dedupeKey: "event-high",
        payload: { value: "high" },
        priority: 10,
        maxAttempts: 2,
      },
      startedAt,
    );
    const duplicate = enqueueDurableJob(
      {
        type: "meta.webhook",
        dedupeKey: "event-high",
        payload: { value: "must-not-replace" },
      },
      startedAt,
    );

    assert.equal(low.deduplicated, false);
    assert.equal(high.deduplicated, false);
    assert.equal(duplicate.deduplicated, true);
    assert.equal(duplicate.job.id, high.job.id);
    assert.deepEqual(duplicate.job.payload, { value: "high" });
    assert.equal(listDurableJobs().length, 2);

    const firstClaim = claimNextDurableJob("worker-1", { now: startedAt });
    assert.ok(firstClaim);
    assert.equal(firstClaim.id, high.job.id);
    assert.equal(firstClaim.attempts, 1);

    const firstFailure = failDurableJob(
      firstClaim.id,
      "worker-1",
      Object.assign(new Error("temporary failure"), { code: "META_TIMEOUT" }),
      startedAt,
    );
    assert.equal(firstFailure.status, "retry");
    assert.equal(firstFailure.last_error_code, "META_TIMEOUT");
    assert.equal(
      firstFailure.available_at,
      new Date(startedAt.getTime() + 5_000).toISOString(),
    );

    const lowClaim = claimNextDurableJob("worker-1", { now: startedAt });
    assert.ok(lowClaim);
    assert.equal(lowClaim.id, low.job.id);
    const completedLow = completeDurableJob(
      lowClaim.id,
      "worker-1",
      { delivered: true },
      startedAt,
    );
    assert.equal(completedLow.status, "completed");
    assert.deepEqual(completedLow.result, { delivered: true });

    assert.equal(
      claimNextDurableJob("worker-1", {
        now: new Date(startedAt.getTime() + 4_999),
      }),
      null,
    );

    const retryClaim = claimNextDurableJob("worker-2", {
      now: new Date(startedAt.getTime() + 5_000),
    });
    assert.ok(retryClaim);
    assert.equal(retryClaim.id, high.job.id);
    assert.equal(retryClaim.attempts, 2);

    const deadLetter = failDurableJob(
      retryClaim.id,
      "worker-2",
      new Error("permanent failure"),
      new Date(startedAt.getTime() + 5_000),
    );
    assert.equal(deadLetter.status, "dead_letter");
    assert.equal(listDurableJobs("dead_letter").length, 1);

    const requeued = requeueDeadLetterJob(
      deadLetter.id,
      new Date(startedAt.getTime() + 6_000),
    );
    assert.equal(requeued.status, "queued");
    assert.equal(requeued.attempts, 0);

    const finalClaim = claimNextDurableJob("worker-3", {
      now: new Date(startedAt.getTime() + 6_000),
    });
    assert.ok(finalClaim);
    assert.equal(finalClaim.id, high.job.id);
    completeDurableJob(
      finalClaim.id,
      "worker-3",
      { delivered: true },
      new Date(startedAt.getTime() + 6_000),
    );
    assert.equal(listDurableJobs("completed").length, 2);
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("expired worker claim is recovered after visibility timeout", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-queue-visibility-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  try {
    const startedAt = new Date("2026-08-06T12:00:00.000Z");
    const queued = enqueueDurableJob(
      {
        type: "meta.webhook",
        dedupeKey: "visibility-event",
        payload: { value: 1 },
        maxAttempts: 3,
      },
      startedAt,
    );
    const abandoned = claimNextDurableJob("dead-worker", {
      now: startedAt,
      visibilityTimeoutMs: 5_000,
    });
    assert.ok(abandoned);
    assert.equal(abandoned.id, queued.job.id);

    const recoveryTime = new Date(startedAt.getTime() + 5_001);
    assert.equal(
      claimNextDurableJob("replacement-worker", {
        now: recoveryTime,
        visibilityTimeoutMs: 5_000,
      }),
      null,
      "recovered job must respect retry backoff",
    );

    const recovered = listDurableJobs()[0];
    assert.equal(recovered.status, "retry");
    assert.equal(recovered.last_error_code, "JOB_VISIBILITY_TIMEOUT");

    const replacementClaim = claimNextDurableJob("replacement-worker", {
      now: new Date(recoveryTime.getTime() + 5_000),
      visibilityTimeoutMs: 5_000,
    });
    assert.ok(replacementClaim);
    assert.equal(replacementClaim.attempts, 2);
    completeDurableJob(
      replacementClaim.id,
      "replacement-worker",
      {},
      new Date(recoveryTime.getTime() + 5_000),
    );
    assert.equal(listDurableJobs()[0].status, "completed");
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("worker runOnce processes jobs and invokes dead-letter callback", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-queue-worker-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  try {
    enqueueDurableJob({
      type: "always.fail",
      dedupeKey: "worker-failure",
      payload: {},
      maxAttempts: 1,
    });
    let deadLetterId = "";
    const worker = startDurableJobWorker({
      workerId: "worker-test",
      pollIntervalMs: 60_000,
      handlers: {
        "always.fail": async () => {
          throw Object.assign(new Error("expected failure"), {
            code: "EXPECTED_FAILURE",
          });
        },
      },
      onDeadLetter(job) {
        deadLetterId = job.id;
      },
    });

    try {
      assert.equal(await worker.runOnce(), true);
      const deadLetters = listDurableJobs("dead_letter");
      assert.equal(deadLetters.length, 1);
      assert.equal(deadLetters[0].id, deadLetterId);
      assert.equal(deadLetters[0].last_error_code, "EXPECTED_FAILURE");
      assert.equal(await worker.runOnce(), false);
    } finally {
      worker.stop();
    }
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
