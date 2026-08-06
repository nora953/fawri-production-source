import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve(
  process.argv.find((value, index) => index > 1 && !value.startsWith("--")) ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);
const now = Date.now();
const PENDING_STALE_MS = 5 * 60 * 1000;

function text(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readOptional(fileName, fallback) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) return { exists: false, value: fallback };
  return {
    exists: true,
    value: JSON.parse(fs.readFileSync(filePath, "utf8")),
  };
}

function issue(severity, code, details) {
  return { severity, code, details };
}

function validTimestamp(value) {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function addMessageIdentityIssues({
  issues,
  seenMessageIds,
  seenExternalIds,
  merchantId,
  conversationId,
  message,
  kind,
}) {
  const messageId = text(message?.id);
  const externalMessageId = text(message?.external_message_id);
  if (!messageId || seenMessageIds.has(messageId)) {
    issues.push(
      issue("error", `${kind}_MESSAGE_ID_INVALID`, {
        merchant_id: merchantId,
        conversation_id: conversationId,
        message_id: messageId || null,
      }),
    );
  }
  seenMessageIds.add(messageId);
  if (externalMessageId) {
    if (seenExternalIds.has(externalMessageId)) {
      issues.push(
        issue("error", `${kind}_MESSAGE_EXTERNAL_ID_DUPLICATE`, {
          merchant_id: merchantId,
          conversation_id: conversationId,
          external_message_id: externalMessageId,
        }),
      );
    }
    seenExternalIds.add(externalMessageId);
  }
  return { messageId, externalMessageId };
}

function buildReport() {
  const merchantSource = readOptional("merchants.json", { merchants: [] });
  const runtimeSource = readOptional("fawri-runtime-db.json", {
    conversationsByMerchant: {},
    metaPagesByPageId: {},
  });
  const overlaySource = readOptional("manual-conversation-operations.json", {
    version: 1,
    conversations: {},
  });

  const merchantIds = new Set(
    asArray(merchantSource.value?.merchants)
      .filter((record) => record?.is_admin !== true)
      .map((record) => text(record?.id))
      .filter(Boolean),
  );
  const runtimeConversations = asRecord(
    runtimeSource.value?.conversationsByMerchant,
  );
  const pages = asRecord(runtimeSource.value?.metaPagesByPageId);
  const pageMerchant = new Map(
    Object.entries(pages).map(([pageId, page]) => [
      text(page?.page_id || pageId),
      text(page?.merchant_id),
    ]),
  );
  const issues = [];
  let conversations = 0;
  let inboundMessages = 0;
  let manualMessages = 0;
  let requests = 0;

  if (overlaySource.exists && overlaySource.value?.version !== 1) {
    issues.push(
      issue("error", "MANUAL_OVERLAY_VERSION_UNSUPPORTED", {
        version: overlaySource.value?.version ?? null,
      }),
    );
  }

  const overlaysByMerchant = asRecord(overlaySource.value?.conversations);
  for (const [merchantId, conversationValue] of Object.entries(
    overlaysByMerchant,
  )) {
    if (!merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "MANUAL_OVERLAY_MERCHANT_MISSING", {
          merchant_id: merchantId,
        }),
      );
    }

    const baseIds = new Set(
      asArray(runtimeConversations[merchantId])
        .map((conversation) => text(conversation?.id))
        .filter(Boolean),
    );
    const overlays = asRecord(conversationValue);
    for (const [conversationId, overlayValue] of Object.entries(overlays)) {
      conversations += 1;
      const overlay = asRecord(overlayValue);
      if (!baseIds.has(conversationId)) {
        issues.push(
          issue("error", "MANUAL_OVERLAY_CONVERSATION_MISSING", {
            merchant_id: merchantId,
            conversation_id: conversationId,
          }),
        );
      }

      const status = text(overlay.status);
      const assigned = overlay.assigned_to_human === true;
      if (!["manual", "auto_replying"].includes(status)) {
        issues.push(
          issue("error", "MANUAL_OVERLAY_STATUS_INVALID", {
            merchant_id: merchantId,
            conversation_id: conversationId,
            status,
          }),
        );
      }
      if ((status === "manual") !== assigned) {
        issues.push(
          issue("error", "MANUAL_OVERLAY_ASSIGNMENT_MISMATCH", {
            merchant_id: merchantId,
            conversation_id: conversationId,
            status,
            assigned_to_human: assigned,
          }),
        );
      }

      const pageId = text(overlay.page_id);
      if (!pageId || pageMerchant.get(pageId) !== merchantId) {
        issues.push(
          issue("error", "MANUAL_OVERLAY_PAGE_INVALID", {
            merchant_id: merchantId,
            conversation_id: conversationId,
            page_id: pageId || null,
            page_merchant_id: pageMerchant.get(pageId) || null,
          }),
        );
      }

      if (!validTimestamp(overlay.updated_at)) {
        issues.push(
          issue("error", "MANUAL_OVERLAY_UPDATED_AT_INVALID", {
            merchant_id: merchantId,
            conversation_id: conversationId,
          }),
        );
      }

      const seenMessageIds = new Set();
      const seenExternalIds = new Set();
      const manualMessageIds = new Set();

      for (const message of asArray(overlay.inbound_messages)) {
        inboundMessages += 1;
        const { messageId, externalMessageId } = addMessageIdentityIssues({
          issues,
          seenMessageIds,
          seenExternalIds,
          merchantId,
          conversationId,
          message,
          kind: "MANUAL_INBOUND",
        });
        if (
          !externalMessageId ||
          text(message?.conversation_id) !== conversationId ||
          text(message?.sender) !== "customer" ||
          text(message?.status) !== "received" ||
          message?.counted_as_auto_reply !== false ||
          !text(message?.text) ||
          !validTimestamp(message?.created_at)
        ) {
          issues.push(
            issue("error", "MANUAL_INBOUND_MESSAGE_SHAPE_INVALID", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              message_id: messageId || null,
            }),
          );
        }
      }

      for (const message of asArray(overlay.manual_messages)) {
        manualMessages += 1;
        const { messageId } = addMessageIdentityIssues({
          issues,
          seenMessageIds,
          seenExternalIds,
          merchantId,
          conversationId,
          message,
          kind: "MANUAL_OUTBOUND",
        });
        manualMessageIds.add(messageId);
        if (
          text(message?.conversation_id) !== conversationId ||
          text(message?.sender) !== "merchant" ||
          text(message?.status) !== "sent" ||
          message?.counted_as_auto_reply !== false ||
          text(message?.reply_type) !== "manual" ||
          !text(message?.text) ||
          !validTimestamp(message?.created_at)
        ) {
          issues.push(
            issue("error", "MANUAL_OUTBOUND_MESSAGE_SHAPE_INVALID", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              message_id: messageId || null,
            }),
          );
        }
      }

      const requestMap = asRecord(overlay.requests);
      for (const [requestKey, requestValue] of Object.entries(requestMap)) {
        requests += 1;
        const request = asRecord(requestValue);
        const statusValue = text(request.status);
        const createdAt = validTimestamp(request.created_at);
        const updatedAt = validTimestamp(request.updated_at);
        if (
          !/^[A-Za-z0-9._:-]{16,128}$/.test(requestKey) ||
          text(request.idempotency_key) !== requestKey
        ) {
          issues.push(
            issue("error", "MANUAL_REQUEST_IDEMPOTENCY_INVALID", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              idempotency_key: requestKey,
            }),
          );
        }
        if (!/^[a-f0-9]{64}$/.test(text(request.text_sha256))) {
          issues.push(
            issue("error", "MANUAL_REQUEST_HASH_INVALID", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              idempotency_key: requestKey,
            }),
          );
        }
        if (!["pending", "sent", "failed", "uncertain"].includes(statusValue)) {
          issues.push(
            issue("error", "MANUAL_REQUEST_STATUS_INVALID", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              idempotency_key: requestKey,
              status: statusValue,
            }),
          );
        }
        if (!createdAt || !updatedAt || updatedAt < createdAt) {
          issues.push(
            issue("error", "MANUAL_REQUEST_TIMESTAMP_INVALID", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              idempotency_key: requestKey,
            }),
          );
        }
        if (
          statusValue === "sent" &&
          !manualMessageIds.has(text(request.message_id))
        ) {
          issues.push(
            issue("error", "MANUAL_REQUEST_SENT_MESSAGE_MISSING", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              idempotency_key: requestKey,
              message_id: text(request.message_id) || null,
            }),
          );
        }
        if (statusValue === "uncertain") {
          issues.push(
            issue("error", "MANUAL_REQUEST_OUTCOME_UNCERTAIN", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              idempotency_key: requestKey,
              error_code: text(request.error_code) || null,
            }),
          );
        }
        if (
          statusValue === "pending" &&
          createdAt &&
          now - createdAt.getTime() > PENDING_STALE_MS
        ) {
          issues.push(
            issue("error", "MANUAL_REQUEST_PENDING_STALE", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              idempotency_key: requestKey,
              created_at: createdAt.toISOString(),
            }),
          );
        } else if (statusValue === "pending") {
          issues.push(
            issue("warning", "MANUAL_REQUEST_PENDING_ACTIVE", {
              merchant_id: merchantId,
              conversation_id: conversationId,
              idempotency_key: requestKey,
            }),
          );
        }
      }
    }
  }

  const severityCounts = issues.reduce((result, item) => {
    result[item.severity] = (result[item.severity] || 0) + 1;
    return result;
  }, {});
  return {
    ok: !issues.some((item) => item.severity === "error"),
    mode: "read_only",
    generated_at: new Date().toISOString(),
    data_dir: dataDirectory,
    files: {
      merchants: { file: "merchants.json", exists: merchantSource.exists },
      runtime: { file: "fawri-runtime-db.json", exists: runtimeSource.exists },
      overlay: {
        file: "manual-conversation-operations.json",
        exists: overlaySource.exists,
      },
    },
    summary: {
      conversations,
      inbound_messages: inboundMessages,
      manual_messages: manualMessages,
      requests,
      issues: issues.length,
      severity_counts: severityCounts,
    },
    issues,
  };
}

try {
  const report = buildReport();
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
        fatal_error: String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
