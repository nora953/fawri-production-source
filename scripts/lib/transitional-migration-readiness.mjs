import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const transitionalSourceFiles = {
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, value) {
  return `${prefix}:${sha256(String(value)).slice(0, 32)}`;
}

function readOptional(dataDirectory, fileName) {
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
    sha256: sha256(bytes),
  };
}

function issue(severity, code, details) {
  return { severity, code, details };
}

function eventPageId(eventId) {
  const match = /^meta:([^:]+):/.exec(text(eventId));
  return match ? match[1] : "";
}

function eventMessageId(eventId) {
  const parts = text(eventId).split(":");
  return parts.length >= 3 ? parts.slice(2).join(":") : "";
}

function channelIdForPage(pageId) {
  return `legacy-meta-page:${pageId}`;
}

function normalizedSecretKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function isCredentialKey(key) {
  const normalized = normalizedSecretKey(key);
  return (
    normalized === "token" ||
    normalized.endsWith("_token") ||
    normalized.includes("access_token") ||
    normalized === "secret" ||
    normalized.endsWith("_secret") ||
    normalized === "password" ||
    normalized.endsWith("_password")
  );
}

function isSensitiveMetadataKey(key) {
  const normalized = normalizedSecretKey(key);
  return (
    isCredentialKey(normalized) ||
    normalized === "token_ciphertext" ||
    normalized.endsWith("_ciphertext") ||
    normalized === "private_key" ||
    normalized.endsWith("_private_key")
  );
}

function containsCredential(value, seen = new Set()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsCredential(item, seen));
  }
  for (const [key, item] of Object.entries(value)) {
    if (isCredentialKey(key) && text(item)) return true;
    if (containsCredential(item, seen)) return true;
  }
  return false;
}

function redactSensitiveMetadata(value, seen = new Map()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    const result = [];
    seen.set(value, result);
    for (const item of value) {
      result.push(redactSensitiveMetadata(item, seen));
    }
    return result;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  const result = {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveMetadataKey(key)) continue;
    result[key] = redactSensitiveMetadata(item, seen);
  }
  return result;
}

function runtimePageEntries(runtime) {
  const pageMap = asRecord(runtime?.metaPagesByPageId);
  if (Object.keys(pageMap).length > 0) return Object.entries(pageMap);

  return asArray(runtime?.metaPages || runtime?.meta_pages).map((page, index) => {
    const pageId = text(page?.page_id || page?.external_account_id || page?.id);
    return [pageId || `legacy-page-${index + 1}`, page];
  });
}

function buildIndexes(sources, issues, targetRows) {
  const merchants = asArray(sources.merchants.value?.merchants).filter(
    (record) => record?.is_admin !== true,
  );
  const merchantIds = new Set(
    merchants.map((record) => text(record?.id)).filter(Boolean),
  );

  const subscriptions = asArray(sources.merchants.value?.subscriptions);
  const subscriptionsById = new Map();
  for (const subscription of subscriptions) {
    const id = text(subscription?.id);
    const merchantId = text(subscription?.merchant_id);
    if (!id) continue;
    if (subscriptionsById.has(id)) {
      issues.push(
        issue("error", "DUPLICATE_SUBSCRIPTION_ID", { subscription_id: id }),
      );
    }
    subscriptionsById.set(id, { id, merchantId });
  }

  const pagesById = new Map();
  for (const [entryPageId, pageValue] of runtimePageEntries(
    sources.runtime.value,
  )) {
    const page = asRecord(pageValue);
    const merchantId = text(page.merchant_id);
    const pageId = text(entryPageId || page.page_id);
    if (!pageId || !merchantId) {
      issues.push(
        issue("error", "INVALID_META_PAGE_MAPPING", {
          page_id: pageId || null,
          merchant_id: merchantId || null,
        }),
      );
      continue;
    }
    if (!merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORPHAN_META_PAGE_MERCHANT", {
          page_id: pageId,
          merchant_id: merchantId,
        }),
      );
    }
    if (pagesById.has(pageId)) {
      issues.push(
        issue("error", "DUPLICATE_META_PAGE_ID", { page_id: pageId }),
      );
      continue;
    }

    const hasPlaintextToken = containsCredential(page);
    if (hasPlaintextToken) {
      issues.push(
        issue("warning", "META_PAGE_TOKEN_REQUIRES_ENCRYPTED_MIGRATION", {
          page_id: pageId,
          merchant_id: merchantId,
        }),
      );
    }

    const channelId = channelIdForPage(pageId);
    pagesById.set(pageId, { pageId, merchantId, channelId });
    targetRows.merchant_channels.push({
      id: channelId,
      merchant_id: merchantId,
      platform: text(page.platform) || "messenger",
      status: text(page.status) || "connected",
      external_account_id: text(page.external_account_id || pageId) || null,
      external_account_name:
        text(page.external_account_name || page.page_name || page.display_name) ||
        null,
      page_id: pageId,
      page_name: text(page.page_name || page.display_name) || null,
      instagram_account_id: text(page.instagram_account_id) || null,
      instagram_username: text(page.instagram_username) || null,
      token_ciphertext: null,
      token_key_version: null,
      token_expires_at: page.token_expires_at || null,
      webhook_subscribed_at:
        page.webhook_subscribed === true
          ? page.connected_at || page.updated_at || page.created_at || null
          : null,
      last_webhook_at: page.last_webhook_at || null,
      last_error_code: text(page.webhook_subscription_error) || null,
      last_error_at: page.last_error_at || null,
      connected_at: page.connected_at || null,
      disconnected_at: page.disconnected_at || null,
      metadata: {
        legacy: redactSensitiveMetadata(page),
        plaintext_token_present: hasPlaintextToken,
        token_migration_required: hasPlaintextToken,
      },
      created_at: page.created_at || page.connected_at || null,
      updated_at:
        page.updated_at || page.connected_at || page.created_at || null,
    });
  }

  return { merchantIds, subscriptionsById, pagesById };
}

function auditProcessedEvents(source, indexes, issues, rows, targetRows) {
  const events = asRecord(source.value?.events);
  for (const [eventId, receivedAt] of Object.entries(events)) {
    const pageId = eventPageId(eventId);
    const page = indexes.pagesById.get(pageId);
    if (!pageId) {
      issues.push(
        issue("error", "META_EVENT_ID_UNPARSABLE", { event_id: eventId }),
      );
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

    const normalizedTimestamp = timestamp.toISOString();
    rows.processed_channel_events.push({
      event_id: eventId,
      page_id: pageId,
      merchant_id: page.merchantId,
      platform: "messenger",
      received_at: normalizedTimestamp,
    });
    targetRows.processed_channel_events.push({
      id: stableId("legacy-channel-event", eventId),
      merchant_id: page.merchantId,
      channel_id: page.channelId,
      external_event_id: eventId,
      event_type: "message",
      payload_hash: sha256(
        JSON.stringify({ event_id: eventId, received_at: normalizedTimestamp }),
      ),
      processing_status: "completed",
      error_code: null,
      received_at: normalizedTimestamp,
      completed_at: normalizedTimestamp,
    });
  }
}

function auditReplyReservations(source, indexes, issues, rows, targetRows) {
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

    const amount = Number(reservation.amount || 1);
    const balanceAfter = Number(reservation.replies_remaining_after);
    const normalizedReservedAt = reservedAt.toISOString();
    rows.reply_ledger.push({
      event_id: eventId,
      page_id: pageId,
      merchant_id: merchantId,
      subscription_id: subscriptionId,
      amount,
      status,
      reserved_at: normalizedReservedAt,
      replies_remaining_after: balanceAfter,
    });
    targetRows.reply_ledger.push({
      id: stableId("legacy-reply-ledger", eventId),
      merchant_id: merchantId,
      subscription_id: subscriptionId,
      reply_batch_id: null,
      direction: "debit",
      amount,
      reason_code: "auto_reply",
      external_event_id: eventId,
      message_id: eventMessageId(eventId) || null,
      balance_after: Number.isFinite(balanceAfter) ? balanceAfter : null,
      metadata: {
        legacy_reservation_status: status,
        page_id: pageId,
      },
      created_at: normalizedReservedAt,
    });
  }
}

function auditBackgroundJobs(source, indexes, issues, rows, targetRows) {
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
      issues.push(
        issue("error", "BACKGROUND_JOB_IDENTITY_INVALID", {
          id,
          type,
          dedupe_key: dedupeKey,
        }),
      );
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
    if (
      !["queued", "processing", "retry", "completed", "dead_letter"].includes(
        status,
      )
    ) {
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

    const normalizedJob = {
      id,
      type,
      dedupe_key: dedupeKey,
      merchant_id: merchantId || null,
      payload,
      priority: Number(job.priority || 0),
      status,
      attempts: Number(job.attempts || 0),
      max_attempts: Number(job.max_attempts || 5),
      available_at: text(job.available_at),
      locked_at: null,
      locked_by: null,
      last_error_code: text(job.last_error_code) || null,
      last_error_message: text(job.last_error_message) || null,
      result: Object.keys(asRecord(job.result)).length > 0 ? asRecord(job.result) : null,
      completed_at: text(job.completed_at) || null,
      dead_lettered_at: text(job.dead_lettered_at) || null,
      created_at: text(job.created_at),
      updated_at: text(job.updated_at),
    };
    rows.background_jobs.push(normalizedJob);
    targetRows.background_jobs.push(normalizedJob);

    if (status === "dead_letter") {
      const deadLetter = {
        id: `legacy-dlq:${id}`,
        job_id: id,
        occurrence: 1,
        reason_code: text(job.last_error_code) || "LEGACY_DEAD_LETTER",
        reason_message:
          text(job.last_error_message) || "legacy dead-letter job",
        attempts: Number(job.attempts || 0),
        payload_snapshot: payload,
        metadata: { migrated_from: "background-jobs.json" },
        created_at: text(
          job.dead_lettered_at || job.updated_at || job.created_at,
        ),
        requeued_at: null,
        requeued_by_account_id: null,
      };
      rows.job_dead_letters.push(deadLetter);
      targetRows.job_dead_letters.push(deadLetter);
    }
  }
}

export function buildTransitionalMigrationReadiness({ dataDirectory }) {
  const resolvedDataDirectory = path.resolve(dataDirectory);
  const sources = Object.fromEntries(
    Object.entries(transitionalSourceFiles).map(([key, fileName]) => [
      key,
      readOptional(resolvedDataDirectory, fileName),
    ]),
  );
  const issues = [];
  const rows = {
    processed_channel_events: [],
    reply_ledger: [],
    background_jobs: [],
    job_dead_letters: [],
  };
  const targetRows = {
    merchant_channels: [],
    processed_channel_events: [],
    reply_ledger: [],
    background_jobs: [],
    job_dead_letters: [],
  };

  const indexes = buildIndexes(sources, issues, targetRows);
  auditProcessedEvents(
    sources.processedEvents,
    indexes,
    issues,
    rows,
    targetRows,
  );
  auditReplyReservations(
    sources.replyReservations,
    indexes,
    issues,
    rows,
    targetRows,
  );
  auditBackgroundJobs(
    sources.backgroundJobs,
    indexes,
    issues,
    rows,
    targetRows,
  );

  const severityCounts = issues.reduce((result, item) => {
    result[item.severity] = (result[item.severity] || 0) + 1;
    return result;
  }, {});
  const report = {
    ok: !issues.some((item) => item.severity === "error"),
    mode: "read_only_migration_preflight",
    generated_at: new Date().toISOString(),
    data_dir: resolvedDataDirectory,
    source_files: Object.fromEntries(
      Object.entries(sources).map(([key, source]) => [
        key,
        {
          file: source.file,
          exists: source.exists,
          bytes: source.bytes,
          sha256: source.sha256,
        },
      ]),
    ),
    summary: {
      issues: issues.length,
      severity_counts: severityCounts,
      row_counts: Object.fromEntries(
        Object.entries(rows).map(([table, tableRows]) => [
          table,
          tableRows.length,
        ]),
      ),
      target_row_counts: Object.fromEntries(
        Object.entries(targetRows).map(([table, tableRows]) => [
          table,
          tableRows.length,
        ]),
      ),
    },
    issues,
    rows,
    target_rows: targetRows,
  };

  return { report, sources };
}
