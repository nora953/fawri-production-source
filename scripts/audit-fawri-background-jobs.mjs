import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve(
  process.argv[2] ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
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
  if (queue?.version !== 1) {
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
      issues.push(
        issue("error", "INVALID_JOB_STATUS", { job_id: id, status }),
      );
    }
    if (!Number.isInteger(attempts) || attempts < 0) {
      issues.push(
        issue("error", "INVALID_JOB_ATTEMPTS", {
          job_id: id,
          attempts: job?.attempts,
        }),
      );
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
      issues.push(
        issue("error", "INVALID_JOB_MAX_ATTEMPTS", {
          job_id: id,
          max_attempts: job?.max_attempts,
        }),
      );
    }
    if (
      Number.isInteger(attempts) &&
      Number.isInteger(maxAttempts) &&
      attempts > maxAttempts
    ) {
      issues.push(
        issue("error", "JOB_ATTEMPTS_EXCEED_LIMIT", {
          job_id: id,
          attempts,
          max_attempts: maxAttempts,
        }),
      );
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
      issues.push(
        issue("error", "JOB_UPDATED_BEFORE_CREATED", { job_id: id }),
      );
    }
    if (!job?.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
      issues.push(
        issue("error", "INVALID_JOB_PAYLOAD", { job_id: id }),
      );
    }

    if (status === "processing") {
      if (!lockedAt || !text(job?.locked_by)) {
        issues.push(
          issue("error", "PROCESSING_JOB_LOCK_MISSING", { job_id: id }),
        );
      } else if (now.getTime() - lockedAt.getTime() > visibilityTimeoutMs) {
        issues.push(
          issue("error", "STALE_PROCESSING_JOB", {
            job_id: id,
            locked_at: lockedAt.toISOString(),
            age_ms: now.getTime() - lockedAt.getTime(),
          }),
        );
      }
    } else if (job?.locked_at || job?.locked_by) {
      issues.push(
        issue("error", "NONPROCESSING_JOB_HAS_LOCK", {
          job_id: id,
          status,
        }),
      );
    }

    if (status === "completed" && !completedAt) {
      issues.push(
        issue("error", "COMPLETED_JOB_TIMESTAMP_MISSING", { job_id: id }),
      );
    }
    if (status === "dead_letter") {
      if (!deadLetteredAt) {
        issues.push(
          issue("error", "DEAD_LETTER_TIMESTAMP_MISSING", { job_id: id }),
        );
      }
      if (!text(job?.last_error_code) || !text(job?.last_error_message)) {
        issues.push(
          issue("error", "DEAD_LETTER_REASON_MISSING", { job_id: id }),
        );
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
} else {
  try {
    const queueFile = readJson(queuePath);
    const merchantIds = readMerchantIds();
    const { jobs, issues } = auditQueue(
      queueFile.value,
      merchantIds,
      new Date(),
    );
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
