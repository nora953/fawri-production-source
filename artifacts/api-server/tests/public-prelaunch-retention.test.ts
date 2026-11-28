import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { startMerchantRetentionPolicyScheduler } from "../src/services/merchantRetentionPolicy";

test("closed prelaunch skips the immediate retention pass and timer", (t) => {
  const previousMode = process.env.FAWRI_PUBLIC_PRELAUNCH_ONLY;
  const previousAuthority = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  t.after(() => {
    if (previousMode === undefined) delete process.env.FAWRI_PUBLIC_PRELAUNCH_ONLY;
    else process.env.FAWRI_PUBLIC_PRELAUNCH_ONLY = previousMode;
    if (previousAuthority === undefined) delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
    else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = previousAuthority;
    delete (globalThis as { __fawriRetentionPolicySchedulerStarted?: boolean }).__fawriRetentionPolicySchedulerStarted;
  });
  // Make the old path observable, without DB access or reading a real file.
  delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const read = t.mock.method(fs, "existsSync", () => false);
  const timer = t.mock.method(globalThis, "setInterval", () => ({ unref() {} }));

  for (const mode of ["1", "unexpected"]) {
    process.env.FAWRI_PUBLIC_PRELAUNCH_ONLY = mode;
    startMerchantRetentionPolicyScheduler();
    assert.equal(read.mock.callCount(), 0);
    assert.equal(timer.mock.callCount(), 0);
  }

  process.env.FAWRI_PUBLIC_PRELAUNCH_ONLY = "0";
  startMerchantRetentionPolicyScheduler();
  startMerchantRetentionPolicyScheduler();
  assert.equal(read.mock.callCount(), 1);
  assert.equal(timer.mock.callCount(), 1);
});
