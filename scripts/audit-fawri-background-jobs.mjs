#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] || process.cwd());
const checks = [
  [
    "artifacts/api-server/src/services/durableJobQueue.ts",
    [
      "lease_expires_at",
      "heartbeatDurableJob",
      "reconcileExpiredJob",
      "DURABLE_JOB_REQUEUE_BLOCKED",
      "listDurableJobSummaries",
    ],
  ],
  [
    "artifacts/api-server/src/middleware/metaWebhookSecurity.ts",
    ["rawBody", "timingSafeEqual", "META_WEBHOOK_SECRET_NOT_CONFIGURED"],
  ],
  [
    "artifacts/api-server/src/middleware/metaWebhookQueueIngress.ts",
    ["enqueueDurableJob", "markMetaWebhookEventsProcessed", "res.status(200)"],
  ],
  [
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
    ["META_REPLY_OUTCOME_UNCERTAIN", "reconcileExpiredMetaJob", "refundMerchantAutoReply"],
  ],
  [
    "artifacts/api-server/src/services/metaCredentialVault.ts",
    ["aes-256-gcm", "MetaCredentialKeyProvider", "auth_tag"],
  ],
];

const failures = [];
for (const [relativePath, markers] of checks) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`${relativePath}: missing`);
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const marker of markers) {
    if (!content.includes(marker)) failures.push(`${relativePath}: missing ${marker}`);
  }
}

const forbiddenLogPatterns = [
  /console\.(?:log|info|warn|error)\([^\n]*(?:payload|webhook_body|access_token|page_access_token)/i,
  /logger\.(?:info|warn|error|fatal)\([^\n]*(?:payload|webhook_body|access_token|page_access_token)/i,
];
for (const relativePath of [
  "artifacts/api-server/src/services/metaWebhookWorker.ts",
  "artifacts/api-server/src/middleware/metaWebhookQueueIngress.ts",
  "artifacts/api-server/src/services/metaChannelJobs.ts",
]) {
  const content = fs.readFileSync(path.join(root, relativePath), "utf8");
  if (forbiddenLogPatterns.some((pattern) => pattern.test(content))) {
    failures.push(`${relativePath}: potentially sensitive log expression`);
  }
}

let queueSummary = null;
const dataDir = process.env.FAWRI_DATA_DIR;
if (dataDir) {
  const queuePath = path.join(path.resolve(dataDir), "background-jobs.json");
  if (fs.existsSync(queuePath)) {
    const parsed = JSON.parse(fs.readFileSync(queuePath, "utf8"));
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    queueSummary = jobs.reduce(
      (summary, job) => {
        const status = String(job?.status || "unknown");
        summary[status] = (summary[status] || 0) + 1;
        return summary;
      },
      {},
    );
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: failures.length === 0,
      checked_files: checks.length,
      failures,
      queue_summary: queueSummary,
      payloads_included: false,
    },
    null,
    2,
  )}\n`,
);
if (failures.length > 0) process.exitCode = 1;
