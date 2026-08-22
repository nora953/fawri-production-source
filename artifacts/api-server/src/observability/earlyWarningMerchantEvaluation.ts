import type {
  EarlyWarningIncident,
  EarlyWarningMerchantHealth,
} from "../services/earlyWarningPostgresAuthority";

export type MerchantEarlyWarningIncident = EarlyWarningIncident & {
  scope: "merchant";
  merchant_id: string;
  merchant_name: string;
};

export function operationalMerchantHealthRows(
  merchants: EarlyWarningMerchantHealth[],
): EarlyWarningMerchantHealth[] {
  return merchants.filter(
    (merchant) =>
      merchant.merchant_status === "approved" &&
      merchant.account_status === "approved",
  );
}

export function evaluateMerchantEarlyWarnings(
  merchants: EarlyWarningMerchantHealth[],
): MerchantEarlyWarningIncident[] {
  const incidents: MerchantEarlyWarningIncident[] = [];
  const operationalMerchants = operationalMerchantHealthRows(merchants);

  const add = (
    merchant: EarlyWarningMerchantHealth,
    condition: boolean,
    incident: Omit<MerchantEarlyWarningIncident, "scope" | "merchant_id" | "merchant_name">,
  ) => {
    if (!condition) return;
    incidents.push({
      ...incident,
      scope: "merchant",
      merchant_id: merchant.merchant_id,
      merchant_name: merchant.store_name,
    });
  };

  for (const merchant of operationalMerchants) {
    const suffix = merchant.merchant_id;
    add(merchant, merchant.connected_channels === 0, {
      id: `merchant-no-connected-channel:${suffix}`,
      severity: "warning",
      area: "merchant_channels",
      code: "MERCHANT_NO_CONNECTED_CHANNEL",
      value: 1,
      runbook: "docs/operations-observability.md#channel-connectivity-response",
    });
    add(merchant, merchant.recent_channel_errors > 0, {
      id: `merchant-channel-errors:${suffix}`,
      severity: "warning",
      area: "channels",
      code: "CHANNEL_RECENT_ERRORS",
      value: merchant.recent_channel_errors,
      runbook: "docs/operations-observability.md#webhook-signature-response",
    });
    add(merchant, merchant.failed_messages > 0, {
      id: `merchant-message-failures:${suffix}`,
      severity: "warning",
      area: "messaging",
      code: "MESSAGE_FAILURES",
      value: merchant.failed_messages,
      runbook: "docs/operations-observability.md#queue-and-dlq-response",
    });
    add(merchant, merchant.dead_letter_jobs > 0, {
      id: `merchant-dlq:${suffix}`,
      severity: "critical",
      area: "queue",
      code: "DLQ_NONZERO",
      value: merchant.dead_letter_jobs,
      runbook: "docs/operations-observability.md#queue-and-dlq-response",
    });
    add(merchant, merchant.uncertain_deliveries > 0, {
      id: `merchant-uncertain-delivery:${suffix}`,
      severity: "critical",
      area: "channels",
      code: "OUTBOUND_DELIVERY_UNCERTAIN",
      value: merchant.uncertain_deliveries,
      runbook: "docs/operations-observability.md#queue-and-dlq-response",
    });
    add(merchant, merchant.refund_conflicts > 0, {
      id: `merchant-refund-conflict:${suffix}`,
      severity: "critical",
      area: "credits",
      code: "REPLY_REFUND_CONFLICT",
      value: merchant.refund_conflicts,
      runbook: "docs/operations-observability.md#queue-and-dlq-response",
    });
  }

  return incidents;
}
