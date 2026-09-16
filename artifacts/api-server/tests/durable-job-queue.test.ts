import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  blockDeadLetterJobRequeue,
  claimNextDurableJob,
  completeDurableJob,
  enqueueDurableJob,
  failDurableJob,
  heartbeatDurableJob,
  listDurableJobs,
  listDurableJobSummaries,
  listExpiredProcessingJobs,
  requeueDeadLetterJob,
  resolveExpiredDurableJob,
  startDurableJobWorker,
} from "../src/services/durableJobQueue";

async function isolated<T>(name: string, callback: () => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), `${name}-`));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

test("durable queue deduplicates, prioritizes, retries, and exposes no payload in summaries", () =>
  isolated("fawri-queue", async () => {
    const now = new Date("2026-08-07T00:00:00.000Z");
    const low = enqueueDurableJob({
      type: "meta.webhook.reply",
      dedupeKey: "low",
      payload: { customer_message: "must remain private" },
      priority: 0,
    }, now);
    const high = enqueueDurableJob({
      type: "meta.webhook.reply",
      dedupeKey: "high",
      payload: { access_token: "must remain private" },
      priority: 10,
      maxAttempts: 2,
    }, now);
    const duplicate = enqueueDurableJob({
      type: "meta.webhook.reply",
      dedupeKey: "high",
      payload: { replacement: true },
    }, now);

    assert.equal(duplicate.deduplicated, true);
    assert.equal(duplicate.job.id, high.job.id);
    assert.deepEqual(duplicate.job.payload, { access_token: "must remain private" });

    const first = claimNextDurableJob("worker-1", { now });
    assert.equal(first?.id, high.job.id);
    const retry = failDurableJob(
      high.job.id,
      "worker-1",
      Object.assign(new Error("Authorization: Bearer secret-value"), {
        code: "META_TIMEOUT",
      }),
      now,
    );
    assert.equal(retry.status, "retry");
    assert.doesNotMatch(retry.last_error_message || "", /secret-value/);

    const second = claimNextDurableJob("worker-1", { now });
    assert.equal(second?.id, low.job.id);
    completeDurableJob(low.job.id, "worker-1", { delivered: true }, now);

    const summaries = listDurableJobSummaries();
    assert.equal(summaries.length, 2);
    assert.equal("payload" in summaries[0], false);
    assert.equal("result" in summaries[0], false);
    assert.equal("last_error_message" in summaries[0], false);
    assert.equal(summaries.some((item) => item.has_payload), true);
  }));

test("heartbeat extends visibility and expired claims require explicit reconciliation", () =>
  isolated("fawri-queue-visibility", async () => {
    const started = new Date("2026-08-07T00:00:00.000Z");
    const queued = enqueueDurableJob({
      type: "meta.webhook.reply",
      dedupeKey: "event-1",
      payload: { event_id: "event-1" },
    }, started);
    const claimed = claimNextDurableJob("worker-dead", {
      now: started,
      visibilityTimeoutMs: 5_000,
    });
    assert.equal(claimed?.id, queued.job.id);

    heartbeatDurableJob(
      queued.job.id,
      "worker-dead",
      5_000,
      new Date(started.getTime() + 4_000),
    );
    assert.equal(
      listExpiredProcessingJobs(new Date(started.getTime() + 5_001), 5_000).length,
      0,
    );
    const expiredAt = new Date(started.getTime() + 9_001);
    assert.equal(listExpiredProcessingJobs(expiredAt, 5_000).length, 1);
    assert.equal(
      claimNextDurableJob("replacement", { now: expiredAt, visibilityTimeoutMs: 5_000 }),
      null,
      "claiming must not blindly replay an uncertain expired delivery",
    );

    const resolved = resolveExpiredDurableJob(
      queued.job.id,
      "worker-dead",
      {
        action: "dead_letter",
        code: "META_REPLY_OUTCOME_UNCERTAIN",
        message: "delivery outcome cannot be proven",
      },
      expiredAt,
    );
    assert.equal(resolved?.status, "dead_letter");
    assert.equal(resolved?.requeue_policy, "blocked");
    assert.throws(
      () => requeueDeadLetterJob(queued.job.id, expiredAt),
      (error: NodeJS.ErrnoException) => error.code === "DURABLE_JOB_REQUEUE_BLOCKED",
    );
  }));

test("confirmed safe failures can enter DLQ and be requeued", () =>
  isolated("fawri-queue-safe-dlq", async () => {
    const now = new Date("2026-08-07T00:00:00.000Z");
    const queued = enqueueDurableJob({
      type: "safe.failure",
      dedupeKey: "safe-event",
      payload: {},
      maxAttempts: 1,
    }, now);
    claimNextDurableJob("worker", { now });
    const dead = failDurableJob(
      queued.job.id,
      "worker",
      Object.assign(new Error("confirmed failure"), {
        code: "META_REPLY_FAILED",
        retryable: true,
        requeueSafe: true,
      }),
      now,
    );
    assert.equal(dead.status, "dead_letter");
    assert.equal(dead.requeue_policy, "safe");
    const requeued = requeueDeadLetterJob(dead.id, new Date(now.getTime() + 1));
    assert.equal(requeued.status, "queued");
    assert.equal(requeued.attempts, 0);

    const nextClaim = claimNextDurableJob("worker-2", {
      now: new Date(now.getTime() + 1),
    });
    assert.equal(nextClaim?.id, dead.id);
    const secondDead = failDurableJob(
      dead.id,
      "worker-2",
      Object.assign(new Error("confirmed failure"), {
        code: "META_REPLY_FAILED",
        retryable: false,
        requeueSafe: true,
      }),
      new Date(now.getTime() + 1),
    );
    blockDeadLetterJobRequeue(secondDead.id, new Date(now.getTime() + 2));
    assert.throws(
      () => requeueDeadLetterJob(secondDead.id, new Date(now.getTime() + 3)),
      (error: NodeJS.ErrnoException) => error.code === "DURABLE_JOB_REQUEUE_BLOCKED",
    );
  }));

test("worker reconciles a crashed claim before accepting new work", () =>
  isolated("fawri-queue-reconcile", async () => {
    const old = new Date("2026-08-07T00:00:00.000Z");
    const queued = enqueueDurableJob({
      type: "recoverable",
      dedupeKey: "recoverable-1",
      payload: {},
    }, old);
    claimNextDurableJob("crashed-worker", {
      now: old,
      visibilityTimeoutMs: 1,
    });

    const worker = startDurableJobWorker({
      workerId: "replacement-worker",
      pollIntervalMs: 60_000,
      visibilityTimeoutMs: 1,
      handlers: { recoverable: async () => ({ should_not_run: true }) },
      reconcileExpiredJob(job) {
        assert.equal(job.id, queued.job.id);
        return { action: "complete", result: { reconciled: true } };
      },
    });
    try {
      assert.equal(await worker.runOnce(), false);
      const completed = listDurableJobs("completed");
      assert.equal(completed.length, 1);
      assert.deepEqual(completed[0].result, { reconciled: true });
    } finally {
      worker.stop();
    }
  }));
