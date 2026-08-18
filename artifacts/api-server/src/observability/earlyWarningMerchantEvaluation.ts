import type {
  EarlyWarningIncident,
  EarlyWarningMerchantHealth,
} from "../services/earlyWarningPostgresAuthority";

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
): EarlyWarningIncident[] {
  const operationalMerchants = operationalMerchantHealthRows(merchants);
  const disconnectedMerchants = operationalMerchants.filter(
    (merchant) => merchant.connected_channels === 0,
  );

  if (disconnectedMerchants.length === 0) return [];

  return [
    {
      id: "merchant-no-connected-channel",
      severity: "warning",
      area: "merchant_channels",
      code: "MERCHANT_NO_CONNECTED_CHANNEL",
      value: disconnectedMerchants.length,
      runbook: "docs/operations-observability.md#channel-connectivity-response",
    },
  ];
}
