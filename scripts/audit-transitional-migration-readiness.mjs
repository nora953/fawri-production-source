import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve(
  process.argv[2] ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);

const files = {
  merchants: "merchants.json",
  runtime: "fawri-runtime-db.json",
  processedEvents: "processed-meta-events.json",
  replyReservations: "reply-reservations.json",
  backgroundJobs: "background-jobs.json",
};

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

function readOptional(fileName) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) {
    return { exists: false, file: fileName, value: {}, bytes: 0, sha256: null };
  }
  const bytes = fs.readFileSync(filePath);
  return {
    exists: true,
    file: fileName,
    value: JSON.parse(bytes.toString("utf8")),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function issue(severity, code, details) {
  return { severity, code, details };
}

function eventPageId(eventId) {
  const match = /^meta:([^:]+):/.exec(text(eventId));
  return match ? match[1] : "";
}

function buildIndexes(sources, issues) {
  const merchants = asArray(sources.merchants.value?.merchants).filter(
    (record) => record?.is_admin !== true,
  );
  const merchantIds = new Set(merchants.map((record) => text(record?.id)).filter(Boolean));

  const subscriptions = asArray(sources.merchants.value?.subscriptions);
  const subscriptionsById = new Map();
  for (const subscription of subscriptions) {
    const id = text(subscription?.id);
    const merchantId = text(subscription?.merchant_id);
    if (!id) continue;
    if (subscriptionsById.has(id)) {
      issues.push(issue("error", "DUPLICATE_SUBSCRIPTION_ID", { subscription_id: id }));
    }
    subscriptionsById.set(id, { id, merchantId });
  }

  const pageMap = asRecord(sources.runtime.value?.metaPagesByPageId);
  const pagesById = new Map();
  for (const [pageId, page] of Object.entries(pageMap)) {
    const merchantId = text(page?.merchant_id);
    const normalizedPageId = text(pageId || page?.page_id);
    if (!normalizedPageId || !merchantId) {
      issues.push(
        issue("error", "INVALID_META_PAGE_MAPPING", {
          page_id: normalizedPageId || null,
          merchant_id: merchantId || null,
        }),
      );
      continue;
    }
    if (!merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORPHAN_META_PAGE_MERCHANT", {
          page_id: normalizedPageId,
          merchant_id: merchantId,
        }),
      );
    }
    pagesById.set(normalizedPageId, { pageId: normalizedPageId, merchantId });
  }

  return { merchantIds, subscriptionsById, pagesById };
}

function auditProcessedEvents(source, indexes, issues, rows) {
  const events = asRecord(source.value?.events);
  for (const [eventId, receivedAt] of Object.entries(events)) {
    const pageId = eventPageId(eventId);
    const page = indexes.pagesById.get(pageId);
    if (!pageId) {
      issues.push(issue("error", "META_EVENT_ID_UNPARSABLE", { event_id: eventId }));
      continue;
    }
    if (!page) {
      issues.push(
        issue("error", "META_EVENT_PAGE_MAPPING_MISSING", {
          event_id: eventId,
          page_id: pageId,
        }),
      );
      continue;
    }
    const timestamp = new Date(String(receivedAt || ""));
    if (!Number.isFinite(timestamp.getTime())) {
      issues.push(
        issue("error", "META_EVENT_TIMESTAMP_INVALID", {
          event_id: eventId,
          received_at: receivedAt,
        }),
      );
      continue;
    }
    rows.processed_channel_events.push({
      event_id: eventId,
      page_id: pageId,
      merchant_id: page.merchantId,
      platform: "messenger",
      received_at: timestamp.toISOString(),
    });
  }
}

function auditReplyReservations(source, indexes, issues, rows) {
  const reservations = asRecord(source.value?.reservations);
  for (const [eventId, reservationValue] of Object.entries(reservations)) {
    const reservation = asRecord(reservationValue);
    const merchantId = text(reservation.merchant_id);
    const subscriptionId = text(reservation.subscription_id);
    const recordEventId = text(reservation.event_id);
    const subscription = indexes.subscriptionsById.get(subscriptionId);
    const pageId = eventPageId(eventId);
    const page = indexes.pagesById.get(pageId);

    if (!eventId || recordEventId !== eventId) {
      issues.push(
        issue("error", "REPLY_RESERVATION_EVENT_MISMATCH", {
          map_event_id: eventId,
          record_event_id: recordEventId || null,
        }),
      );
      continue;
    }
    if (!indexes.merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "REPLY_RESERVATION_MERCHANT_MISSING", {
          event_id: eventId,
          merchant_id: merchantId || null,
        }),
      );
      continue;
    }
    if (!subscription || subscription.merchantId !== merchantId) {
      issues.push(
        issue("error", "REPLY_RESERVATION_SUBSCRIPTION_INVALID", {
          event_id: eventId,
          merchant_id: merchantId,
          subscription_id: subscriptionId || null,
          subscription_merchant_id: subscription?.merchantId || null,
        }),
      );
      continue;
    }
    if (!page || page.merchantId !== merchantId) {
      issues.push(
        issue("error", "REPLY_RESERVATION_PAGE_MISMATCH", {
          event_id: eventId,
          page_id: pageId || null,
          merchant_id: merchantId,
          page_merchant_id: page?.merchantId || null,
        }),
      );
      continue;
    }
    const status = text(reservation.status);
    if (status !== "consumed" && status !== "pending") {
      issues.push(
        issue("error", "REPLY_RESERVATION_STATUS_INVALID", {
          event_id: eventId,
          status,
        }),
      );
      continue;
    }
    const reservedAt = new Date(String(reservation.reserved_at || ""));
    if (!Number.isFinite(reservedAt.getTime())) {
      issues.push(
        issue("error", "REPLY_RESERVATION_TIMESTAMP_INVALID", {
          event_id: eventId,
          reserved_at: reservation.reserved_at,
        }),
      );
      continue;
    }
    if (status === "pending") {
      issues.push(
        issue("error", "REPLY_RESERVATION_PENDING_BLOCKS_MIGRATION", {
          event_id: eventId,
          merchant_id: merchantId,
          subscription_id: subscriptionId,
        }),
      );
      continue;
    }
    rows.reply_ledger.push({
      event_id: eventId,
      page_id: pageId,
      merchant_id: merchantId,
      subscription_id: subscriptionId,
      amount: Number(reservation.amount || 1),
      status,
      reserved_at: reservedAt.toISOString(),
      replies_remaining_after: Number(reservation.replies_remaining_after),
    });
  }
}

function auditBackgroundJobs(source, indexes, issues, rows) {
  if (!source.exists) return;
  if (source.value?.version !== 1) {
    issues.push(
      issue("error", "BACKGROUND_JOB_VERSION_UNSUPPORTED", {
        version: source.value?.version ?? null,
      }),
    );
    return;
  }

  const jobs = asArray(source.value?.jobs);
  const seenDedupe = new Set();
  for (const jobValue of jobs) {
    const job = asRecord(jobValue);
    const id = text(job.id);
    const type = text(job.type);
    const dedupeKey = text(job.dedupe_key);
    const merchantId = text(job.merchant_id);
    const status = text(job.status);
    const dedupeIdentity = `${type}:${dedupeKey}`;

    if (!id || !type || !dedupeKey) {
      issues.push(issue("error", "BACKGROUND_JOB_IDENTITY_INVALID", { id, type, dedupe_key: dedupeKey }));
      continue;
    }
    if (seenDedupe.has(dedupeIdentity)) {
      issues.push(
        issue("error", "BACKGROUND_JOB_DEDUPE_DUPLICATE", {
          type,
          dedupe_key: dedupeKey,
        }),
      );
      continue;
    }
    seenDedupe.add(dedupeIdentity);
    if (merchantId && !indexes.merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "BACKGROUND_JOB_MERCHANT_MISSING", {
          job_id: id,
          merchant_id: merchantId,
        }),
      );
      continue;
    }
    if (!["queued", "processing", "retry", "completed", "dead_letter"].includes(status)) {
      issues.push(
        issue("error", "BACKGROUND_JOB_STATUS_INVALID", { job_id: id, status }),
      );
      continue;
    }
    if (status === "processing") {
      issues.push(
        issue("error", "PROCESSING_JOB_BLOCKS_MIGRATION", {
          job_id: id,
          locked_by: text(job.locked_by) || null,
        }),
      );
      continue;
    }

    const payload = asRecord(job.payload);
    if (type === "meta.webhook.reply") {
      const eventId = text(payload.event_id || dedupeKey);
      const pageId = eventPageId(eventId);
      const page = indexes.pagesById.get(pageId);
      if (!page || page.merchantId !== merchantId) {
        issues.push(
          issue("error", "META_JOB_PAGE_MERCHANT_MISMATCH", {
            job_id: id,
            event_id: eventId,
            page_id: pageId || null,
            merchant_id: merchantId || null,
            page_merchant_id: page?.merchantId || null,
          }),
        );
        continue;
      }
    }

    rows.background_jobs.push({
      id,
      type,
      dedupe_key: dedupeKey,
      merchant_id: merchantId || null,
      payload,
      priority: Number(job.priority || 0),
      status,
      attempts: Number(job.attempts || 0),
      max_attempts: Number(job.max_attempts || 0),
      available_at: text(job.available_at),
      locked_at: text(job.locked_at) || null,
      locked_by: text(job.locked_by) || null,
      last_error_code: text(job.last_error_code) || null,
      last_error_message: text(job.last_error_message) || null,
      result: asRecord(job.result),
      created_at: text(job.created_at),
      updated_at: text(job.updated_at),
      completed_at: text(job.completed_at) || null,
      dead_lettered_at: text(job.dead_lettered_at) || null,
    });

    if (status === "dead_letter") {
      rows.job_dead_letters.push({
        id: `legacy-dlq:${id}`,
        job_id: id,
        occurrence: 1,
        reason_code: text(job.last_error_code) || "LEGACY_DEAD_LETTER",
        reason_message: text(job.last_error_message) || "legacy dead-letter job",
        attempts: Number(job.attempts || 0),
        payload_snapshot: payload,
        created_at: text(job.dead_lettered_at || job.updated_at || job.created_at),
      });
    }
  }
}

const sources = Object.fromEntries(
  Object.entries(files).map(([key, fileName]) => [key, readOptional(fileName)]),
);
const issues = [];
const rows = {
  processed_channel_events: [],
  reply_ledger: [],
  background_jobs: [],
  job_dead_letters: [],
};

try {
  const indexes = buildIndexes(sources, issues);
  auditProcessedEvents(sources.processedEvents, indexes, issues, rows);
  auditReplyReservations(sources.replyReservations, indexes, issues, rows);
  auditBackgroundJobs(sources.backgroundJobs, indexes, issues, rows);

  const severityCounts = issues.reduce((result, item) => {
    result[item.severity] = (result[item.severity] || 0) + 1;
    return result;
  }, {});
  const report = {
    ok: !issues.some((item) => item.severity === "error"),
    mode: "read_only_migration_preflight",
    generated_at: new Date().toISOString(),
    data_dir: dataDirectory,
    source_files: Object.fromEntries(
      Object.entries(sources).map(([key, source]) => [key, {
        file: source.file,
        exists: source.exists,
        bytes: source.bytes,
        sha256: source.sha256,
      }]),
    ),
    summary: {
      issues: issues.length,
      severity_counts: severityCounts,
      row_counts: Object.fromEntries(
        Object.entries(rows).map(([table, tableRows]) => [table, tableRows.length]),
      ),
    },
    issues,
    rows,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    mode: "read_only_migration_preflight",
    generated_at: new Date().toISOString(),
    data_dir: dataDirectory,
    fatal_error: String(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
}
