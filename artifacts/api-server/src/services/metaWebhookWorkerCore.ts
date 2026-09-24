import type { DurableJob, ExpiredJobResolution } from "./durableJobQueue";
import {
  getMerchantOperationalDecisionAuthoritative,
} from "./merchantOperationalAccess";
import {
  type MerchantOperationalSettings,
} from "./merchantSettingsRuntime";
import {
  getMerchantOperationalSettingsAuthoritative,
} from "./postgresMerchantSettingsAuthority";
import { reserveMerchantAutoReplyAuthoritative } from "./merchantReplyEntitlementAuthority";
import {
  releaseMerchantAutoReplyReservationAuthoritative,
  type MerchantReplyReleaseCode,
} from "./merchantReplyReservationReleaseAuthority";
import type {
  MetaWebhookReplyTransport,
  MetaWebhookReplyTransportState,
} from "./metaWebhookFakeTransport";

export type MetaReplyLifecycleHooks = {
  afterClaimSettingsRead?: (input: {
    job: DurableJob;
    settings: MerchantOperationalSettings;
  }) => Promise<void> | void;
  afterReservation?: (input: {
    job: DurableJob;
    settings: MerchantOperationalSettings;
  }) => Promise<void> | void;
};

type JobFailure = Error & {
  code: string;
  retryable: boolean;
  requeueSafe: boolean;
  safeMessage: string;
};

function text(value: unknown): string {
  return String(value || "").trim();
}

function jobError(
  code: string,
  safeMessage: string,
  retryable: boolean,
  requeueSafe = retryable,
): JobFailure {
  return Object.assign(new Error(safeMessage), {
    code,
    retryable,
    requeueSafe,
    safeMessage,
  });
}

function validateJob(job: DurableJob): {
  eventId: string;
  merchantId: string;
  externalMessageId: string;
} {
  const payload = job.payload || {};
  const eventId = text(payload.event_id);
  const merchantId = text(payload.merchant_id || job.merchant_id);
  const externalMessageId = text(payload.external_message_id);
  if (!eventId || !merchantId || !externalMessageId) {
    throw jobError(
      "META_JOB_PAYLOAD_INVALID",
      "Meta job identity is invalid",
      false,
      false,
    );
  }
  return { eventId, merchantId, externalMessageId };
}

async function readSettings(merchantId: string): Promise<MerchantOperationalSettings> {
  try {
    return await getMerchantOperationalSettingsAuthoritative(merchantId);
  } catch {
    throw jobError(
      "MERCHANT_SETTINGS_UNAVAILABLE",
      "merchant settings are unavailable",
      true,
      true,
    );
  }
}

function settingsSuppressionCode(
  expectedVersion: number,
  settings: MerchantOperationalSettings,
): MerchantReplyReleaseCode | null {
  if (!settings.auto_reply_enabled) return "MERCHANT_AUTO_REPLY_DISABLED";
  if (settings.version !== expectedVersion) {
    return "MERCHANT_SETTINGS_VERSION_CHANGED";
  }
  return null;
}

function completedSuppression(eventId: string, code: string) {
  return {
    event_id: eventId,
    delivery_status: "suppressed",
    suppression_code: code,
    credit_consumed: false,
  };
}

function existingTerminalResult(
  eventId: string,
  state: MetaWebhookReplyTransportState | null,
): Record<string, unknown> | null {
  if (!state) return null;
  if (state.status === "sent") {
    return {
      event_id: eventId,
      delivery_status: "sent",
      transport_message_id: text(state.transport_message_id),
      recovered_from_existing_result: true,
    };
  }
  if (state.status === "suppressed") {
    return completedSuppression(
      eventId,
      text(state.code) || "META_REPLY_SUPPRESSED",
    );
  }
  return null;
}

function throwIfOutcomeUncertain(state: MetaWebhookReplyTransportState | null): void {
  if (state?.status === "sending" || state?.status === "uncertain") {
    throw jobError(
      "META_REPLY_OUTCOME_UNCERTAIN",
      "Meta reply outcome is uncertain and cannot be retried automatically",
      false,
      false,
    );
  }
}

async function releaseAndSuppress(input: {
  eventId: string;
  merchantId: string;
  settingsVersion: number;
  code: MerchantReplyReleaseCode;
  transport: MetaWebhookReplyTransport;
}): Promise<Record<string, unknown>> {
  const released = await releaseMerchantAutoReplyReservationAuthoritative(
    input.eventId,
    input.code,
  );
  if (
    !released.released &&
    released.reason !== "already_released"
  ) {
    throw jobError(
      "META_REPLY_RELEASE_RECONCILIATION_REQUIRED",
      "reply reservation could not be released safely",
      false,
      false,
    );
  }
  const state = input.transport.markSuppressed({
    eventId: input.eventId,
    merchantId: input.merchantId,
    settingsVersion: input.settingsVersion,
    code: input.code,
  });
  if (state.status === "sending" || state.status === "uncertain") {
    throw jobError(
      "META_REPLY_OUTCOME_UNCERTAIN",
      "Meta reply outcome became uncertain before suppression was persisted",
      false,
      false,
    );
  }
  if (state.status === "sent") {
    throw jobError(
      "META_REPLY_ALREADY_SENT",
      "Meta reply was already sent before suppression could be applied",
      false,
      false,
    );
  }
  return completedSuppression(input.eventId, input.code);
}

function isOperationalReleaseCode(code: string): code is MerchantReplyReleaseCode {
  return (
    code === "MERCHANT_APPROVAL_REQUIRED" ||
    code === "MERCHANT_REJECTED" ||
    code === "MERCHANT_SUSPENDED" ||
    code === "MERCHANT_ACCESS_STATE_UNAVAILABLE"
  );
}

export async function processMetaReplyJob(
  job: DurableJob,
  options: {
    transport: MetaWebhookReplyTransport;
    hooks?: MetaReplyLifecycleHooks;
  },
): Promise<Record<string, unknown>> {
  const { eventId, merchantId } = validateJob(job);
  const transport = options.transport;

  const existingState = transport.read(eventId);
  const terminal = existingTerminalResult(eventId, existingState);
  if (terminal) return terminal;
  throwIfOutcomeUncertain(existingState);

  const access = await getMerchantOperationalDecisionAuthoritative(merchantId);
  if (!access.allowed) {
    if (access.code === "MERCHANT_ACCESS_STATE_UNAVAILABLE") {
      throw jobError(access.code, access.error, true, true);
    }
    transport.markSuppressed({
      eventId,
      merchantId,
      settingsVersion: existingState?.settings_version || 1,
      code: access.code,
    });
    return completedSuppression(eventId, access.code);
  }

  const claimedSettings = await readSettings(merchantId);
  if (!claimedSettings.auto_reply_enabled) {
    transport.markSuppressed({
      eventId,
      merchantId,
      settingsVersion: claimedSettings.version,
      code: "MERCHANT_AUTO_REPLY_DISABLED",
    });
    return completedSuppression(eventId, "MERCHANT_AUTO_REPLY_DISABLED");
  }

  if (
    existingState &&
    existingState.settings_version !== claimedSettings.version
  ) {
    if (existingState.status === "reserved" || existingState.status === "failed") {
      return await releaseAndSuppress({
        eventId,
        merchantId,
        settingsVersion: existingState.settings_version,
        code: "MERCHANT_SETTINGS_VERSION_CHANGED",
        transport,
      });
    }
    throw jobError(
      "MERCHANT_SETTINGS_VERSION_CHANGED",
      "merchant settings changed after reply claim",
      false,
      false,
    );
  }

  await options.hooks?.afterClaimSettingsRead?.({
    job,
    settings: claimedSettings,
  });

  const beforeReservationAccess =
    await getMerchantOperationalDecisionAuthoritative(merchantId);
  if (!beforeReservationAccess.allowed) {
    if (beforeReservationAccess.code === "MERCHANT_ACCESS_STATE_UNAVAILABLE") {
      throw jobError(
        beforeReservationAccess.code,
        beforeReservationAccess.error,
        true,
        true,
      );
    }
    transport.markSuppressed({
      eventId,
      merchantId,
      settingsVersion: claimedSettings.version,
      code: beforeReservationAccess.code,
    });
    return completedSuppression(eventId, beforeReservationAccess.code);
  }

  const beforeReservation = await readSettings(merchantId);
  const beforeReservationCode = settingsSuppressionCode(
    claimedSettings.version,
    beforeReservation,
  );
  if (beforeReservationCode) {
    transport.markSuppressed({
      eventId,
      merchantId,
      settingsVersion: claimedSettings.version,
      code: beforeReservationCode,
    });
    return completedSuppression(eventId, beforeReservationCode);
  }

  let reservation;
  try {
    reservation = await reserveMerchantAutoReplyAuthoritative(merchantId, eventId);
  } catch {
    throw jobError(
      "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      "merchant reply entitlement is unavailable",
      true,
      true,
    );
  }
  if (!reservation.allowed) {
    if (reservation.code === "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE") {
      throw jobError(reservation.code, reservation.error, true, true);
    }
    transport.markSuppressed({
      eventId,
      merchantId,
      settingsVersion: claimedSettings.version,
      code: reservation.code,
    });
    return completedSuppression(eventId, reservation.code);
  }

  if (reservation.duplicate && !existingState) {
    throw jobError(
      "META_REPLY_LEGACY_RESERVATION_UNCERTAIN",
      "reply reservation predates the fake transport lifecycle and cannot be sent safely",
      false,
      false,
    );
  }

  let reservedState: MetaWebhookReplyTransportState;
  try {
    reservedState = transport.markReserved({
      eventId,
      merchantId,
      settingsVersion: claimedSettings.version,
    });
  } catch {
    return await releaseAndSuppress({
      eventId,
      merchantId,
      settingsVersion: claimedSettings.version,
      code: "MERCHANT_SETTINGS_UNAVAILABLE",
      transport,
    });
  }

  if (reservedState.settings_version !== claimedSettings.version) {
    return await releaseAndSuppress({
      eventId,
      merchantId,
      settingsVersion: reservedState.settings_version,
      code: "MERCHANT_SETTINGS_VERSION_CHANGED",
      transport,
    });
  }

  await options.hooks?.afterReservation?.({
    job,
    settings: claimedSettings,
  });

  let result;
  try {
    result = await transport.send({
      eventId,
      merchantId,
      settingsVersion: claimedSettings.version,
      beforeSend: async () => {
        const immediatelyBeforeSend = await readSettings(merchantId);
        const code = settingsSuppressionCode(
          claimedSettings.version,
          immediatelyBeforeSend,
        );
        if (code) {
          throw jobError(
            code,
            code === "MERCHANT_AUTO_REPLY_DISABLED"
              ? "merchant automatic replies were disabled before send"
              : "merchant settings changed before send",
            false,
            false,
          );
        }

        // Re-read the canonical merchant state at the final provider boundary.
        // A reservation must never authorize a send after the merchant becomes
        // rejected/suspended or otherwise operationally unavailable.
        const immediatelyBeforeSendAccess =
          await getMerchantOperationalDecisionAuthoritative(merchantId);
        if (!immediatelyBeforeSendAccess.allowed) {
          throw jobError(
            immediatelyBeforeSendAccess.code,
            immediatelyBeforeSendAccess.error,
            false,
            false,
          );
        }
      },
    });
  } catch (error) {
    const state = transport.read(eventId);
    if (state?.status === "sent") {
      return {
        event_id: eventId,
        delivery_status: "sent",
        transport_message_id: text(state.transport_message_id),
        recovered_after_transport_error: true,
      };
    }
    if (state?.status === "failed") {
      throw jobError("META_REPLY_FAILED", "Meta reply failed", true, true);
    }
    if (state?.status === "sending" || state?.status === "uncertain") {
      throw jobError(
        "META_REPLY_OUTCOME_UNCERTAIN",
        "Meta reply outcome is uncertain and cannot be retried automatically",
        false,
        false,
      );
    }
    const code = text((error as { code?: unknown }).code);
    if (
      code === "MERCHANT_AUTO_REPLY_DISABLED" ||
      code === "MERCHANT_SETTINGS_VERSION_CHANGED" ||
      code === "MERCHANT_SETTINGS_UNAVAILABLE" ||
      code === "CONVERSATION_SUPERSEDED" ||
      isOperationalReleaseCode(code)
    ) {
      return await releaseAndSuppress({
        eventId,
        merchantId,
        settingsVersion: claimedSettings.version,
        code: code as MerchantReplyReleaseCode,
        transport,
      });
    }
    throw jobError(
      code || "META_FAKE_TRANSPORT_UNAVAILABLE",
      "fake Meta transport is unavailable",
      true,
      true,
    );
  }

  if (result.status === "sent") {
    return {
      event_id: eventId,
      delivery_status: "sent",
      transport_message_id: result.transportMessageId,
      deduplicated_send: result.deduplicated,
    };
  }
  if (result.status === "failed") {
    throw jobError("META_REPLY_FAILED", "Meta reply failed", true, true);
  }
  if (result.status === "uncertain") {
    throw jobError(
      "META_REPLY_OUTCOME_UNCERTAIN",
      "Meta reply outcome is uncertain and cannot be retried automatically",
      false,
      false,
    );
  }

  return await releaseAndSuppress({
    eventId,
    merchantId,
    settingsVersion: claimedSettings.version,
    code:
      result.code === "MERCHANT_SETTINGS_VERSION_CHANGED"
        ? "MERCHANT_SETTINGS_VERSION_CHANGED"
        : "META_FAKE_TRANSPORT_ONLY",
    transport,
  });
}

export function reconcileMetaReplyJob(
  job: DurableJob,
  transport: MetaWebhookReplyTransport,
): ExpiredJobResolution {
  try {
    const { eventId } = validateJob(job);
    const state = transport.read(eventId);
    if (!state) {
      return {
        action: "dead_letter",
        code: "META_REPLY_OUTCOME_UNCERTAIN",
        message: "expired claimed reply has no fake transport lifecycle record",
      };
    }
    if (state.status === "sent") {
      return {
        action: "complete",
        result: {
          event_id: eventId,
          delivery_status: "sent",
          transport_message_id: text(state.transport_message_id),
          recovered_after_worker_restart: true,
        },
      };
    }
    if (state.status === "suppressed") {
      return {
        action: "complete",
        result: completedSuppression(
          eventId,
          text(state.code) || "META_REPLY_SUPPRESSED",
        ),
      };
    }
    if (state.status === "failed") {
      return {
        action: "retry",
        code: "META_REPLY_FAILED",
        message: "confirmed failed fake Meta reply can be retried safely",
      };
    }
    if (state.status === "reserved") {
      return {
        action: "retry",
        code: "META_REPLY_NOT_STARTED",
        message: "reply reservation exists but fake Meta send was not started",
      };
    }
    return {
      action: "dead_letter",
      code: "META_REPLY_OUTCOME_UNCERTAIN",
      message: "fake Meta send may have started before worker restart",
    };
  } catch {
    return {
      action: "dead_letter",
      code: "META_JOB_RECONCILIATION_INVALID",
      message: "expired Meta reply job could not be reconciled safely",
    };
  }
}
