#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function text(value) {
  return String(value || "").trim();
}

function runStaticContractAudit() {
  const root = process.cwd();
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
    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath)) {
      failures.push(`${relativePath}: missing`);
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    if (forbiddenLogPatterns.some((pattern) => pattern.test(content))) {
      failures.push(`${relativePath}: potentially sensitive log expression`);
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: failures.length === 0,
        mode: "static_contract",
        checked_files: checks.length,
        failures,
        payloads_included: false,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function validDate(value) {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function duplicateValues(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const value = selector(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }));
}

function issue(severity, code, details) {
  return { severity, code, details };
}

function readJson(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function runDataAudit(dataDirectory) {
  const queuePath = path.join(dataDirectory, "background-jobs.json");
  const merchantsPath = path.join(dataDirectory, "merchants.json");
  const visibilityTimeoutMs = Number(
    process.env.FAWRI_JOB_VISIBILITY_TIMEOUT_MS || 5 * 60 * 1000,
  );
  const validStatuses = new Set([
    "queued",
    "processing",
    "retry",
    "completed",
    "dead_letter",
  ]);

  function readMerchantIds() {
    if (!fs.existsSync(merchantsPath)) return new Set();
    const parsed = readJson(merchantsPath).value;
    return new Set(
      asArray(parsed?.merchants)
        .filter((merchant) => merchant?.is_admin !== true)
        .map((merchant) => text(merchant?.id))
        .filter(Boolean),
    );
  }

  function auditQueue(queue, merchantIds, now) {
    const issues = [];
    if (queue?.version !== 1 && queue?.version !== 2) {
      issues.push(
        issue("error", "UNSUPPORTED_JOB_QUEUE_VERSION", {
          version: queue?.version ?? null,
        }),
      );
    }

    const jobs = asArray(queue?.jobs);
    for (const duplicate of duplicateValues(jobs, (job) => text(job?.id))) {
      issues.push(issue("error", "DUPLICATE_JOB_ID", duplicate));
    }
    for (const duplicate of duplicateValues(
      jobs,
      (job) => `${text(job?.type)}:${text(job?.dedupe_key)}`,
    )) {
      issues.push(issue("error", "DUPLICATE_JOB_DEDUPE_KEY", duplicate));
    }

    for (const job of jobs) {
      const id = text(job?.id);
      const type = text(job?.type);
      const dedupeKey = text(job?.dedupe_key);
      const merchantId = text(job?.merchant_id);
      const status = text(job?.status);
      const attempts = Number(job?.attempts);
      const maxAttempts = Number(job?.max_attempts);
      const availableAt = validDate(job?.available_at);
      const createdAt = validDate(job?.created_at);
      const updatedAt = validDate(job?.updated_at);
      const lockedAt = validDate(job?.locked_at);
      const leaseExpiresAt = validDate(job?.lease_expires_at);
      const completedAt = validDate(job?.completed_at);
      const deadLetteredAt = validDate(job?.dead_lettered_at);

      if (!id || !type || !dedupeKey) {
        issues.push(
          issue("error", "JOB_IDENTITY_MISSING", {
            id: id || null,
            type: type || null,
            dedupe_key: dedupeKey || null,
          }),
        );
      }
      if (merchantId && merchantIds.size > 0 && !merchantIds.has(merchantId)) {
        issues.push(
          issue("error", "ORPHAN_JOB_MERCHANT", {
            job_id: id,
            merchant_id: merchantId,
          }),
        );
      }
      if (!validStatuses.has(status)) {
        issues.push(issue("error", "INVALID_JOB_STATUS", { job_id: id, status }));
      }
      if (!Number.isInteger(attempts) || attempts < 0) {
        issues.push(issue("error", "INVALID_JOB_ATTEMPTS", { job_id: id, attempts: job?.attempts }));
      }
      if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
        issues.push(issue("error", "INVALID_JOB_MAX_ATTEMPTS", { job_id: id, max_attempts: job?.max_attempts }));
      }
      if (Number.isInteger(attempts) && Number.isInteger(maxAttempts) && attempts > maxAttempts) {
        issues.push(issue("error", "JOB_ATTEMPTS_EXCEED_LIMIT", { job_id: id, attempts, max_attempts: maxAttempts }));
      }
      if (!availableAt || !createdAt || !updatedAt) {
        issues.push(
          issue("error", "INVALID_JOB_TIMESTAMP", {
            job_id: id,
            available_at: job?.available_at,
            created_at: job?.created_at,
            updated_at: job?.updated_at,
          }),
        );
      }
      if (updatedAt && createdAt && updatedAt < createdAt) {
        issues.push(issue("error", "JOB_UPDATED_BEFORE_CREATED", { job_id: id }));
      }
      if (!job?.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
        issues.push(issue("error", "INVALID_JOB_PAYLOAD", { job_id: id }));
      }

      if (status === "processing") {
        if (!lockedAt || !text(job?.locked_by)) {
          issues.push(issue("error", "PROCESSING_JOB_LOCK_MISSING", { job_id: id }));
        } else {
          const expiredByLease = leaseExpiresAt && leaseExpiresAt.getTime() <= now.getTime();
          const expiredByAge = !leaseExpiresAt && now.getTime() - lockedAt.getTime() > visibilityTimeoutMs;
          if (expiredByLease || expiredByAge) {
            issues.push(
              issue("error", "STALE_PROCESSING_JOB", {
                job_id: id,
                locked_at: lockedAt.toISOString(),
                lease_expires_at: leaseExpiresAt?.toISOString() || null,
              }),
            );
          }
        }
      } else if (job?.locked_at || job?.locked_by || job?.lease_expires_at) {
        issues.push(issue("error", "NONPROCESSING_JOB_HAS_LOCK", { job_id: id, status }));
      }

      if (status === "completed" && !completedAt) {
        issues.push(issue("error", "COMPLETED_JOB_TIMESTAMP_MISSING", { job_id: id }));
      }
      if (status === "dead_letter") {
        if (!deadLetteredAt) {
          issues.push(issue("error", "DEAD_LETTER_TIMESTAMP_MISSING", { job_id: id }));
        }
        if (!text(job?.last_error_code) || !text(job?.last_error_message)) {
          issues.push(issue("error", "DEAD_LETTER_REASON_MISSING", { job_id: id }));
        }
      }
    }

    return { jobs, issues };
  }

  if (!fs.existsSync(queuePath)) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          mode: "read_only",
          generated_at: new Date().toISOString(),
          data_dir: dataDirectory,
          queue_file: { exists: false },
          summary: { jobs: 0, issues: 0, severity_counts: {} },
          issues: [],
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 0;
    return;
  }

  try {
    const queueFile = readJson(queuePath);
    const merchantIds = readMerchantIds();
    const { jobs, issues } = auditQueue(queueFile.value, merchantIds, new Date());
    const severityCounts = issues.reduce((result, item) => {
      result[item.severity] = (result[item.severity] || 0) + 1;
      return result;
    }, {});
    const statusCounts = jobs.reduce((result, job) => {
      const status = text(job?.status) || "unknown";
      result[status] = (result[status] || 0) + 1;
      return result;
    }, {});
    const report = {
      ok: !issues.some((item) => item.severity === "error"),
      mode: "read_only",
      generated_at: new Date().toISOString(),
      data_dir: dataDirectory,
      queue_file: {
        exists: true,
        bytes: queueFile.bytes,
        sha256: queueFile.sha256,
      },
      summary: {
        jobs: jobs.length,
        status_counts: statusCounts,
        issues: issues.length,
        severity_counts: severityCounts,
      },
      issues,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 2;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          mode: "read_only",
          generated_at: new Date().toISOString(),
          data_dir: dataDirectory,
          queue_file: { exists: true },
          fatal_error: String(error),
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}

const explicitDataDirectory = process.argv[2];
if (explicitDataDirectory) {
  runDataAudit(path.resolve(explicitDataDirectory));
} else {
  runStaticContractAudit();
}
