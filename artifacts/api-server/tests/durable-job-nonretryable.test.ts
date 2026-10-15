import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  enqueueDurableJob,
  listDurableJobs,
  startDurableJobWorker,
} from "../src/services/durableJobQueue";

test("non-retryable handler failure moves job directly to DLQ", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-queue-nonretryable-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  try {
    enqueueDurableJob({
      type: "uncertain.delivery",
      dedupeKey: "delivery-1",
      payload: { event_id: "delivery-1" },
      maxAttempts: 5,
    });

    let callbackJobId = "";
    const worker = startDurableJobWorker({
      workerId: "uncertain-worker",
      pollIntervalMs: 60_000,
      handlers: {
        "uncertain.delivery": async () => {
          throw Object.assign(new Error("delivery outcome is uncertain"), {
            code: "DELIVERY_OUTCOME_UNCERTAIN",
            retryable: false,
          });
        },
      },
      onDeadLetter(job) {
        callbackJobId = job.id;
      },
    });

    try {
      assert.equal(await worker.runOnce(), true);
    } finally {
      worker.stop();
    }

    const deadLetters = listDurableJobs("dead_letter");
    assert.equal(deadLetters.length, 1);
    assert.equal(deadLetters[0].id, callbackJobId);
    assert.equal(deadLetters[0].attempts, 1);
    assert.equal(deadLetters[0].max_attempts, 5);
    assert.equal(
      deadLetters[0].last_error_code,
      "DELIVERY_OUTCOME_UNCERTAIN",
    );
    assert.equal(listDurableJobs("retry").length, 0);
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
