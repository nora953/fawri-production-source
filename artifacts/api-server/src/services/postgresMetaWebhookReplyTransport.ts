import type { DurableJob, ExpiredJobResolution } from "./durableJobQueue";
import {
  sendMetaGraphTextMessage,
  type MetaGraphTextSendOutcome,
} from "./metaGraphSendClient";
import type {
  MetaWebhookReplyTransport,
  MetaWebhookReplyTransportResult,
  MetaWebhookReplyTransportState,
} from "./metaWebhookFakeTransport";
import {
  withMerchantOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";
import { readMetaChannelCredentialAuthoritative } from "./postgresMetaChannelAuthority";
import type { PreparedPostgresMetaAutoReply } from "./postgresMetaAutoReplyIntent";

export type PostgresMetaSendFunction = typeof sendMetaGraphTextMessage;

type DeliveryRow = {
  outcome: "pending" | "sent" | "confirmed_failed" | "uncertain";
  provider_message_id: string | null;
  failure_code: string | null;
  attempted_at: Date | string;
  finalized_at: Date | string | null;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function safeCode(value: unknown, fallback: string): string {
  const raw = text(value);
  return /^[A-Z][A-Z0-9_]{2,159}$/.test(raw) ? raw : fallback;
}

async function currentSettingsVersion(
  client: OperationalSqlClient,
  merchantId: string,
): Promise<number> {
  const result = await client.query<{ version: number }>(
    `SELECT version FROM merchant_settings WHERE merchant_id = $1 LIMIT 1`,
    [merchantId],
  );
  const version = Number(result.rows[0]?.version);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function stateFromDelivery(input: {
  eventId: string;
  merchantId: string;
  settingsVersion: number;
  delivery: DeliveryRow;
}): MetaWebhookReplyTransportState {
  const updatedAt =
    iso(input.delivery.finalized_at) ||
    iso(input.delivery.attempted_at) ||
    new Date().toISOString();
  if (input.delivery.outcome === "sent") {
    return {
      event_id: input.eventId,
      merchant_id: input.merchantId,
      settings_version: input.settingsVersion,
      status: "sent",
      attempts: 1,
      ...(input.delivery.provider_message_id
        ? { transport_message_id: input.delivery.provider_message_id }
        : {}),
      ...(iso(input.delivery.attempted_at)
        ? { send_started_at: iso(input.delivery.attempted_at)! }
        : {}),
      ...(iso(input.delivery.finalized_at)
        ? { completed_at: iso(input.delivery.finalized_at)! }
        : {}),
      updated_at: updatedAt,
    };
  }
  if (input.delivery.outcome === "confirmed_failed") {
    return {
      event_id: input.eventId,
      merchant_id: input.merchantId,
      settings_version: input.settingsVersion,
      status: "failed",
      attempts: 1,
      ...(input.delivery.failure_code ? { code: input.delivery.failure_code } : {}),
      ...(iso(input.delivery.attempted_at)
        ? { send_started_at: iso(input.delivery.attempted_at)! }
        : {}),
      ...(iso(input.delivery.finalized_at)
        ? { completed_at: iso(input.delivery.finalized_at)! }
        : {}),
      updated_at: updatedAt,
    };
  }
  return {
    event_id: input.eventId,
    merchant_id: input.merchantId,
    settings_version: input.settingsVersion,
    status: input.delivery.outcome === "pending" ? "sending" : "uncertain",
    attempts: 1,
    ...(input.delivery.failure_code ? { code: input.delivery.failure_code } : {}),
    ...(iso(input.delivery.attempted_at)
      ? { send_started_at: iso(input.delivery.attempted_at)! }
      : {}),
    ...(iso(input.delivery.finalized_at)
      ? { completed_at: iso(input.delivery.finalized_at)! }
      : {}),
    updated_at: updatedAt,
  };
}

async function readDeliveryState(
  client: OperationalSqlClient,
  merchantId: string,
  eventId: string,
): Promise<MetaWebhookReplyTransportState | null> {
  const settingsVersion = await currentSettingsVersion(client, merchantId);
  const delivery = await client.query<DeliveryRow>(
    `SELECT od.outcome::text AS outcome, od.provider_message_id,
            od.failure_code, od.attempted_at, od.finalized_at
       FROM outbound_deliveries od
       JOIN channel_inbound_events inbound
         ON inbound.id = od.inbound_event_id
        AND inbound.merchant_id = od.merchant_id
      WHERE od.merchant_id = $1
        AND inbound.external_event_id = $2
        AND od.reply_intent_id = $3
      LIMIT 1`,
    [merchantId, eventId, `auto:${eventId}`],
  );
  if (delivery.rows[0]) {
    return stateFromDelivery({
      eventId,
      merchantId,
      settingsVersion,
      delivery: delivery.rows[0],
    });
  }

  const reservation = await client.query<{ debit_count: number; credit_count: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE direction = 'debit')::int AS debit_count,
       COUNT(*) FILTER (WHERE direction = 'credit')::int AS credit_count
       FROM reply_ledger
      WHERE merchant_id = $1 AND external_event_id = $2`,
    [merchantId, eventId],
  );
  const debitCount = Number(reservation.rows[0]?.debit_count || 0);
  const creditCount = Number(reservation.rows[0]?.credit_count || 0);
  if (debitCount === 1 && creditCount === 0) {
    const now = new Date().toISOString();
    return {
      event_id: eventId,
      merchant_id: merchantId,
      settings_version: settingsVersion,
      status: "reserved",
      attempts: 0,
      reserved_at: now,
      updated_at: now,
    };
  }
  return null;
}

export async function readPostgresMetaWebhookReplyState(input: {
  merchantId: string;
  eventId: string;
}): Promise<MetaWebhookReplyTransportState | null> {
  return withMerchantOperationalTransaction(input.merchantId, (client) =>
    readDeliveryState(client, input.merchantId, input.eventId),
  );
}

async function assertReservationStillSendable(
  merchantId: string,
  eventId: string,
): Promise<void> {
  await withMerchantOperationalTransaction(merchantId, async (client) => {
    const ledger = await client.query<{
      subscription_id: string | null;
      direction: "debit" | "credit";
    }>(
      `SELECT subscription_id, direction::text AS direction
         FROM reply_ledger
        WHERE merchant_id = $1 AND external_event_id = $2
          AND direction IN ('debit', 'credit')
        ORDER BY created_at, id`,
      [merchantId, eventId],
    );
    const debits = ledger.rows.filter((row) => row.direction === "debit");
    const credits = ledger.rows.filter((row) => row.direction === "credit");
    if (debits.length !== 1) {
      throw Object.assign(new Error("reply reservation is unavailable"), {
        code: "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      });
    }
    if (credits.length > 0) {
      throw Object.assign(new Error("reply reservation is no longer sendable"), {
        code: "MERCHANT_AUTO_REPLY_DISABLED",
      });
    }
    const subscriptionId = text(debits[0].subscription_id);
    const subscription = await client.query<{ status: string }>(
      `SELECT status::text AS status
         FROM subscriptions
        WHERE merchant_id = $1 AND id = $2
        LIMIT 1`,
      [merchantId, subscriptionId],
    );
    const status = text(subscription.rows[0]?.status);
    if (!status) {
      throw Object.assign(new Error("subscription state is unavailable"), {
        code: "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      });
    }
    if (status === "pending_activation" || status === "expired" || status === "suspended") {
      throw Object.assign(new Error("subscription no longer permits automatic replies"), {
        code: "MERCHANT_AUTO_REPLY_DISABLED",
      });
    }
  });
}

async function beginDelivery(input: {
  prepared: Extract<PreparedPostgresMetaAutoReply, { action: "send" }>;
  settingsVersion: number;
  now: Date;
}): Promise<"send" | "sent" | "uncertain" | "superseded"> {
  const { prepared } = input;
  return withMerchantOperationalTransaction(prepared.merchantId, async (client) => {
    const conversation = await client.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata
         FROM conversations
        WHERE merchant_id = $1 AND id = $2
        FOR UPDATE`,
      [prepared.merchantId, prepared.conversationId],
    );
    const latestCustomerMessageId = text(
      conversation.rows[0]?.metadata?.latest_customer_message_id,
    );
    if (
      !conversation.rows[0] ||
      latestCustomerMessageId !== prepared.sourceCustomerMessageId
    ) {
      return "superseded";
    }

    const current = await client.query<DeliveryRow>(
      `SELECT outcome::text AS outcome, provider_message_id, failure_code,
              attempted_at, finalized_at
         FROM outbound_deliveries
        WHERE merchant_id = $1 AND inbound_event_id = $2 AND reply_intent_id = $3
        FOR UPDATE`,
      [prepared.merchantId, prepared.inboundEventId, prepared.replyIntentId],
    );
    const row = current.rows[0];
    if (row?.outcome === "sent") return "sent";
    if (row?.outcome === "pending" || row?.outcome === "uncertain") {
      return "uncertain";
    }

    if (row?.outcome === "confirmed_failed") {
      await client.query(
        `UPDATE outbound_deliveries
            SET outcome = 'pending', provider_message_id = NULL,
                failure_code = NULL, attempted_at = $4::timestamptz,
                finalized_at = NULL
          WHERE merchant_id = $1 AND inbound_event_id = $2 AND reply_intent_id = $3`,
        [
          prepared.merchantId,
          prepared.inboundEventId,
          prepared.replyIntentId,
          input.now.toISOString(),
        ],
      );
    } else {
      await client.query(
        `INSERT INTO outbound_deliveries
          (id, merchant_id, inbound_event_id, reservation_id, reply_intent_id,
           outcome, attempted_at)
         VALUES ($1, $2, $3, NULL, $4, 'pending', $5::timestamptz)`,
        [
          `outbound-${prepared.replyMessageId}`,
          prepared.merchantId,
          prepared.inboundEventId,
          prepared.replyIntentId,
          input.now.toISOString(),
        ],
      );
    }
    await client.query(
      `UPDATE messages
          SET status = 'queued', failed_at = NULL, failure_code = NULL
        WHERE merchant_id = $1 AND id = $2 AND conversation_id = $3
          AND sender = 'fawri'`,
      [prepared.merchantId, prepared.replyMessageId, prepared.conversationId],
    );
    return "send";
  });
}

async function finalizeDelivery(input: {
  prepared: Extract<PreparedPostgresMetaAutoReply, { action: "send" }>;
  outcome: MetaGraphTextSendOutcome;
  now: Date;
}): Promise<void> {
  const { prepared, outcome, now } = input;
  await withMerchantOperationalTransaction(prepared.merchantId, async (client) => {
    if (outcome.status === "sent") {
      await client.query(
        `UPDATE outbound_deliveries
            SET outcome = 'sent', provider_message_id = $4,
                failure_code = NULL, finalized_at = $5::timestamptz
          WHERE merchant_id = $1 AND inbound_event_id = $2 AND reply_intent_id = $3
            AND outcome = 'pending'`,
        [
          prepared.merchantId,
          prepared.inboundEventId,
          prepared.replyIntentId,
          outcome.providerMessageId,
          now.toISOString(),
        ],
      );
      await client.query(
        `UPDATE messages
            SET status = 'sent', external_message_id = $4,
                counted_as_auto_reply = TRUE, sent_at = $5::timestamptz,
                failed_at = NULL, failure_code = NULL
          WHERE merchant_id = $1 AND id = $2 AND conversation_id = $3`,
        [
          prepared.merchantId,
          prepared.replyMessageId,
          prepared.conversationId,
          outcome.providerMessageId,
          now.toISOString(),
        ],
      );
      await client.query(
        `UPDATE conversations
            SET last_message_at = $3::timestamptz, updated_at = $3::timestamptz
          WHERE merchant_id = $1 AND id = $2`,
        [prepared.merchantId, prepared.conversationId, now.toISOString()],
      );
      return;
    }

    if (outcome.status === "confirmed_failed") {
      await client.query(
        `UPDATE outbound_deliveries
            SET outcome = 'confirmed_failed', failure_code = $4,
                provider_message_id = NULL, finalized_at = $5::timestamptz
          WHERE merchant_id = $1 AND inbound_event_id = $2 AND reply_intent_id = $3
            AND outcome = 'pending'`,
        [
          prepared.merchantId,
          prepared.inboundEventId,
          prepared.replyIntentId,
          safeCode(outcome.code, "META_GRAPH_CONFIRMED_FAILURE"),
          now.toISOString(),
        ],
      );
      await client.query(
        `UPDATE messages
            SET status = 'failed', counted_as_auto_reply = FALSE,
                failed_at = $4::timestamptz, failure_code = $5
          WHERE merchant_id = $1 AND id = $2 AND conversation_id = $3`,
        [
          prepared.merchantId,
          prepared.replyMessageId,
          prepared.conversationId,
          now.toISOString(),
          safeCode(outcome.code, "META_GRAPH_CONFIRMED_FAILURE"),
        ],
      );
      return;
    }

    await client.query(
      `UPDATE outbound_deliveries
          SET outcome = 'uncertain', failure_code = $4,
              provider_message_id = NULL, finalized_at = $5::timestamptz
        WHERE merchant_id = $1 AND inbound_event_id = $2 AND reply_intent_id = $3
          AND outcome = 'pending'`,
      [
        prepared.merchantId,
        prepared.inboundEventId,
        prepared.replyIntentId,
        safeCode(outcome.code, "META_GRAPH_DELIVERY_UNCERTAIN"),
        now.toISOString(),
      ],
    );
  });
}

export async function createPostgresMetaWebhookReplyTransport(input: {
  prepared: Extract<PreparedPostgresMetaAutoReply, { action: "send" }>;
  sendText?: PostgresMetaSendFunction;
}): Promise<MetaWebhookReplyTransport> {
  const prepared = input.prepared;
  let state = await readPostgresMetaWebhookReplyState({
    merchantId: prepared.merchantId,
    eventId: prepared.eventId,
  });
  const terminalOrUncertain =
    state?.status === "sent" ||
    state?.status === "sending" ||
    state?.status === "uncertain";
  let pageAccessToken = "";
  if (!terminalOrUncertain) {
    pageAccessToken = await readMetaChannelCredentialAuthoritative({
      merchantId: prepared.merchantId,
      platform: "messenger",
      pageId: prepared.pageId,
    });
  }
  const sendText = input.sendText || sendMetaGraphTextMessage;

  return {
    read(eventId) {
      return eventId === prepared.eventId ? state : null;
    },
    markReserved(mark) {
      if (state?.status === "sent" || state?.status === "sending" || state?.status === "uncertain") {
        return state;
      }
      const now = mark.now || new Date();
      state = {
        event_id: mark.eventId,
        merchant_id: mark.merchantId,
        settings_version: mark.settingsVersion,
        status: "reserved",
        attempts: state?.attempts || 0,
        reserved_at: state?.reserved_at || now.toISOString(),
        updated_at: now.toISOString(),
      };
      return state;
    },
    markSuppressed(mark) {
      if (state?.status === "sent" || state?.status === "sending" || state?.status === "uncertain") {
        return state;
      }
      const now = mark.now || new Date();
      state = {
        event_id: mark.eventId,
        merchant_id: mark.merchantId,
        settings_version: mark.settingsVersion,
        status: "suppressed",
        attempts: state?.attempts || 0,
        code: mark.code,
        ...(state?.reserved_at ? { reserved_at: state.reserved_at } : {}),
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      return state;
    },
    async send(sendInput): Promise<MetaWebhookReplyTransportResult> {
      if (state?.status === "sent") {
        return {
          status: "sent",
          transportMessageId: text(state.transport_message_id),
          deduplicated: true,
        };
      }
      if (state?.status === "sending" || state?.status === "uncertain") {
        return { status: "uncertain", code: "META_GRAPH_DELIVERY_UNCERTAIN" };
      }

      await sendInput.beforeSend();
      await assertReservationStillSendable(prepared.merchantId, prepared.eventId);
      const now = sendInput.now || new Date();
      const start = await beginDelivery({
        prepared,
        settingsVersion: sendInput.settingsVersion,
        now,
      });
      if (start === "sent") {
        state = await readPostgresMetaWebhookReplyState({
          merchantId: prepared.merchantId,
          eventId: prepared.eventId,
        });
        return {
          status: "sent",
          transportMessageId: text(state?.transport_message_id),
          deduplicated: true,
        };
      }
      if (start === "uncertain") {
        state = await readPostgresMetaWebhookReplyState({
          merchantId: prepared.merchantId,
          eventId: prepared.eventId,
        });
        return { status: "uncertain", code: "META_GRAPH_DELIVERY_UNCERTAIN" };
      }
      if (start === "superseded") {
        return { status: "blocked", code: "CONVERSATION_CONTEXT_SUPERSEDED" };
      }

      state = {
        event_id: prepared.eventId,
        merchant_id: prepared.merchantId,
        settings_version: sendInput.settingsVersion,
        status: "sending",
        attempts: (state?.attempts || 0) + 1,
        ...(state?.reserved_at ? { reserved_at: state.reserved_at } : {}),
        send_started_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      let outcome: MetaGraphTextSendOutcome;
      try {
        outcome = await sendText({
          pageId: prepared.pageId,
          recipientId: prepared.recipientId,
          messageText: prepared.messageText,
          pageAccessToken,
        });
      } catch (error) {
        outcome = {
          status: "confirmed_failed",
          code: safeCode(
            (error as { code?: unknown } | undefined)?.code,
            "META_GRAPH_SEND_CONFIGURATION_FAILED",
          ),
          httpStatus: 0,
        };
      }

      try {
        await finalizeDelivery({ prepared, outcome, now: new Date() });
      } catch {
        state = {
          ...state,
          status: "uncertain",
          code: "META_REPLY_LOCAL_COMMIT_UNCERTAIN",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        throw Object.assign(new Error("Meta reply local confirmation is uncertain"), {
          code: "META_REPLY_OUTCOME_UNCERTAIN",
        });
      }

      state = await readPostgresMetaWebhookReplyState({
        merchantId: prepared.merchantId,
        eventId: prepared.eventId,
      });
      if (outcome.status === "sent") {
        return {
          status: "sent",
          transportMessageId: outcome.providerMessageId,
          deduplicated: false,
        };
      }
      if (outcome.status === "confirmed_failed") {
        return { status: "failed", code: "META_FAKE_CONFIRMED_FAILURE" };
      }
      return { status: "uncertain", code: "META_FAKE_DELIVERY_UNCERTAIN" };
    },
  };
}

export async function reconcilePostgresMetaReplyJob(
  job: DurableJob,
): Promise<ExpiredJobResolution> {
  const merchantId = text(job.payload?.merchant_id || job.merchant_id);
  const eventId = text(job.payload?.event_id || job.dedupe_key);
  if (!merchantId || !eventId) {
    return {
      action: "dead_letter",
      code: "META_JOB_RECONCILIATION_INVALID",
      message: "expired Meta job identity is invalid",
    };
  }
  try {
    const state = await readPostgresMetaWebhookReplyState({ merchantId, eventId });
    if (!state || state.status === "reserved") {
      return {
        action: "retry",
        code: "META_REPLY_NOT_STARTED",
        message: "reply send had not started before the worker claim expired",
      };
    }
    if (state.status === "sent") {
      return {
        action: "complete",
        result: {
          event_id: eventId,
          delivery_status: "sent",
          transport_message_id: text(state.transport_message_id),
          recovered_after_worker_crash: true,
        },
      };
    }
    if (state.status === "failed") {
      return {
        action: "retry",
        code: "META_REPLY_FAILED",
        message: "confirmed failed Meta reply recovered after worker crash",
      };
    }
    return {
      action: "dead_letter",
      code: "META_REPLY_OUTCOME_UNCERTAIN",
      message: "worker claim expired after Meta delivery may have started",
    };
  } catch {
    return {
      action: "dead_letter",
      code: "META_JOB_RECONCILIATION_FAILED",
      message: "expired Meta reply could not be reconciled safely",
    };
  }
}
