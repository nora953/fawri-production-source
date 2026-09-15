import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  withOperationalTransaction,
} from "./operationalPostgresAuthority";
import { getManagedMerchantPostgres, MerchantManagementError } from "./postgresMerchantManagementAuthority";

const ALLOWED_ACTIONS = new Set([
  "plan_activated",
  "plan_changed",
  "plan_renewed",
  "replies_reset",
  "replies_added",
  "replies_deducted",
  "auto_reply_enabled",
  "auto_reply_disabled",
]);

export function merchantAdminLogActionAllowed(action: string): boolean {
  return ALLOWED_ACTIONS.has(action);
}

export async function appendMerchantAdminLogPostgres(input: {
  actorAdminId: string;
  merchantId: string;
  actionType: string;
  details?: string;
  reason?: string;
  meta?: Record<string, string | number>;
}): Promise<{
  id: string;
  action_type: string;
  merchant_id: string;
  details: string;
  reason?: string;
  meta?: Record<string, string | number>;
  created_at: string;
}> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new MerchantManagementError(
      503,
      "POSTGRES_OPERATIONAL_AUTHORITY_REQUIRED",
      "PostgreSQL merchant management authority is required",
    );
  }
  if (!merchantAdminLogActionAllowed(input.actionType)) {
    throw new MerchantManagementError(400, "ADMIN_LOG_ACTION_INVALID", "invalid admin log action");
  }
  const merchant = await getManagedMerchantPostgres(input.merchantId);
  if (!merchant) {
    throw new MerchantManagementError(404, "MERCHANT_NOT_FOUND", "merchant not found");
  }

  const id = `audit-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const details = String(input.details || "").slice(0, 2000);
  const reason = String(input.reason || "").slice(0, 1000);
  const meta = input.meta || {};

  await withOperationalTransaction(async (client) => {
    await client.query(
      `INSERT INTO audit_events (
         id, actor_kind, actor_account_id, merchant_id,
         action_type, entity_type, entity_id, reason_code,
         details, metadata, created_at
       ) VALUES (
         $1, 'account', $2, $3,
         $4, 'merchant', $3, $5,
         $6, $7::jsonb, $8
       )`,
      [
        id,
        input.actorAdminId,
        input.merchantId,
        input.actionType,
        reason || null,
        details || null,
        JSON.stringify(meta),
        createdAt,
      ],
    );
  });

  return {
    id,
    action_type: input.actionType,
    merchant_id: input.merchantId,
    details,
    ...(reason ? { reason } : {}),
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
    created_at: createdAt,
  };
}
