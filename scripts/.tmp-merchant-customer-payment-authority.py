from __future__ import annotations

from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str, marker: str | None = None) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if marker and marker in text:
        return
    if old not in text:
        raise SystemExit(f"PATCH STOP: expected source fragment missing in {path}")
    text = text.replace(old, new, 1)
    file_path.write_text(text, encoding="utf-8")


def write_stage_preimage() -> None:
    stage = ROOT / "lib/db/migration-stages/0007"
    preimage = stage / "preimage"
    if not stage.exists():
        preimage.mkdir(parents=True, exist_ok=True)
        for name in ("orders.ts", "tenant-security.ts"):
            shutil.copy2(ROOT / "lib/db/src/schema" / name, preimage / name)
        (stage / "stage.json").write_text(
            json.dumps(
                {
                    "index": 7,
                    "name": "merchant_customer_payment_confirmation_authority",
                    "when": 1786488600000,
                    "preimage_files": ["orders.ts", "tenant-security.ts"],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return
    expected = stage / "stage.json"
    if not expected.exists():
        raise SystemExit("PATCH STOP: migration stage 0007 exists without stage.json")


write_stage_preimage()

# ---------------------------------------------------------------------------
# PostgreSQL schema: source/provenance, provider evidence, conflict lifecycle.
# ---------------------------------------------------------------------------
replace_once(
    "lib/db/src/schema/orders.ts",
    "  check,\n  foreignKey,",
    "  boolean,\n  check,\n  foreignKey,",
    marker="paymentConfirmationSourceEnum",
)
replace_once(
    "lib/db/src/schema/orders.ts",
    "export const paymentDecisionActorEnum = pgEnum(\"payment_decision_actor\", [\n  \"merchant\",\n  \"admin\",\n  \"system\",\n]);\n\nexport const orders = pgTable(",
    "export const paymentDecisionActorEnum = pgEnum(\"payment_decision_actor\", [\n  \"merchant\",\n  \"admin\",\n  \"system\",\n]);\nexport const paymentConfirmationSourceEnum = pgEnum(\n  \"payment_confirmation_source\",\n  [\"merchant_confirmed\", \"provider_verified\"],\n);\nexport const paymentReconciliationStatusEnum = pgEnum(\n  \"payment_reconciliation_status\",\n  [\"clear\", \"reconciliation_required\", \"resolved\"],\n);\nexport const providerPaymentOutcomeEnum = pgEnum(\n  \"provider_payment_outcome\",\n  [\"paid\", \"failed\", \"cancelled\"],\n);\n\nexport const orders = pgTable(",
    marker="paymentConfirmationSourceEnum",
)
replace_once(
    "lib/db/src/schema/orders.ts",
    "    paymentRejectionReason: text(\"payment_rejection_reason\"),\n    confirmedAt:",
    "    paymentRejectionReason: text(\"payment_rejection_reason\"),\n    paymentConfirmationSource: paymentConfirmationSourceEnum(\n      \"payment_confirmation_source\",\n    ),\n    paymentProvider: text(\"payment_provider\"),\n    paymentProviderTransactionRef: text(\"payment_provider_transaction_ref\"),\n    paymentProviderLastEventId: text(\"payment_provider_last_event_id\"),\n    paymentReconciliationStatus: paymentReconciliationStatusEnum(\n      \"payment_reconciliation_status\",\n    )\n      .notNull()\n      .default(\"clear\"),\n    paymentConflictCode: text(\"payment_conflict_code\"),\n    paymentConflictAt: timestamp(\"payment_conflict_at\", { withTimezone: true }),\n    paymentConflictResolvedAt: timestamp(\"payment_conflict_resolved_at\", {\n      withTimezone: true,\n    }),\n    paymentConflictResolvedByAccountId: text(\n      \"payment_conflict_resolved_by_account_id\",\n    ).references(() => accounts.id, { onDelete: \"set null\" }),\n    paymentConflictResolutionNote: text(\"payment_conflict_resolution_note\"),\n    confirmedAt:",
    marker="paymentProviderLastEventId",
)
replace_once(
    "lib/db/src/schema/orders.ts",
    "    lifecycleTimestampCheck: check(\"orders_lifecycle_timestamp_check\", sql`${table.updatedAt} >= ${table.createdAt}`),",
    "    paymentConfirmationSourceCheck: check(\n      \"orders_payment_confirmation_source_check\",\n      sql`${table.paymentStatus} <> 'paid' OR ${table.paymentConfirmationSource} IS NOT NULL OR ${table.paymentVerifiedAt} IS NOT NULL`,\n    ),\n    paymentReconciliationCheck: check(\n      \"orders_payment_reconciliation_check\",\n      sql`(${table.paymentReconciliationStatus} = 'clear' AND ${table.paymentConflictCode} IS NULL AND ${table.paymentConflictAt} IS NULL AND ${table.paymentConflictResolvedAt} IS NULL AND ${table.paymentConflictResolvedByAccountId} IS NULL AND ${table.paymentConflictResolutionNote} IS NULL) OR (${table.paymentReconciliationStatus} = 'reconciliation_required' AND ${table.paymentConflictCode} IS NOT NULL AND ${table.paymentConflictAt} IS NOT NULL AND ${table.paymentConflictResolvedAt} IS NULL AND ${table.paymentConflictResolvedByAccountId} IS NULL AND ${table.paymentConflictResolutionNote} IS NULL) OR (${table.paymentReconciliationStatus} = 'resolved' AND ${table.paymentConflictCode} IS NOT NULL AND ${table.paymentConflictAt} IS NOT NULL AND ${table.paymentConflictResolvedAt} IS NOT NULL AND ${table.paymentConflictResolvedByAccountId} IS NOT NULL AND ${table.paymentConflictResolutionNote} IS NOT NULL)`,\n    ),\n    lifecycleTimestampCheck: check(\"orders_lifecycle_timestamp_check\", sql`${table.updatedAt} >= ${table.createdAt}`),",
    marker="orders_payment_reconciliation_check",
)
replace_once(
    "lib/db/src/schema/orders.ts",
    "    outcome: paymentDecisionOutcomeEnum(\"outcome\").notNull(),\n    previousOrderStatus:",
    "    outcome: paymentDecisionOutcomeEnum(\"outcome\").notNull(),\n    confirmationSource: paymentConfirmationSourceEnum(\"confirmation_source\"),\n    previousOrderStatus:",
    marker="confirmationSource: paymentConfirmationSourceEnum",
)

provider_table = r'''
export const orderPaymentProviderEvents = pgTable(
  "order_payment_provider_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerTransactionRef: text("provider_transaction_ref"),
    outcome: providerPaymentOutcomeEnum("outcome").notNull(),
    amountIqd: integer("amount_iqd").notNull(),
    currency: text("currency").notNull().default("IQD"),
    authenticityVerified: boolean("authenticity_verified").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    sanitizedMetadata: jsonb("sanitized_metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    resultingAction: text("resulting_action").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idMerchantUnique: unique("order_payment_provider_events_id_merchant_unique").on(
      table.id,
      table.merchantId,
    ),
    orderTenantForeignKey: foreignKey({
      name: "order_payment_provider_events_order_merchant_fk",
      columns: [table.orderId, table.merchantId],
      foreignColumns: [orders.id, orders.merchantId],
    }).onDelete("cascade"),
    providerEventUnique: uniqueIndex(
      "order_payment_provider_events_provider_event_unique",
    ).on(table.merchantId, table.provider, table.providerEventId),
    merchantOrderIndex: index("order_payment_provider_events_merchant_order_idx").on(
      table.merchantId,
      table.orderId,
      table.receivedAt,
    ),
    providerCheck: check(
      "order_payment_provider_events_provider_check",
      sql`char_length(${table.provider}) BETWEEN 2 AND 40`,
    ),
    eventCheck: check(
      "order_payment_provider_events_event_check",
      sql`char_length(${table.providerEventId}) BETWEEN 6 AND 200`,
    ),
    transactionCheck: check(
      "order_payment_provider_events_transaction_check",
      sql`${table.providerTransactionRef} IS NULL OR char_length(${table.providerTransactionRef}) BETWEEN 1 AND 200`,
    ),
    amountCurrencyCheck: check(
      "order_payment_provider_events_amount_currency_check",
      sql`${table.amountIqd} >= 0 AND ${table.currency} = 'IQD'`,
    ),
    authenticityCheck: check(
      "order_payment_provider_events_authenticity_check",
      sql`${table.authenticityVerified} = TRUE`,
    ),
    payloadHashCheck: check(
      "order_payment_provider_events_payload_hash_check",
      sql`char_length(${table.payloadSha256}) = 64`,
    ),
    actionCheck: check(
      "order_payment_provider_events_action_check",
      sql`${table.resultingAction} IN ('provider_paid_confirmed', 'provider_failure_recorded', 'payment_conflict', 'provider_evidence_recorded')`,
    ),
    timeCheck: check(
      "order_payment_provider_events_time_check",
      sql`${table.processedAt} >= ${table.receivedAt}`,
    ),
  }),
);

'''
replace_once(
    "lib/db/src/schema/orders.ts",
    "/** One terminal decision per order; the composite FK proves the decision belongs to the same tenant/order. */",
    provider_table + "/** One terminal decision per order; the composite FK proves the decision belongs to the same tenant/order. */",
    marker="orderPaymentProviderEvents = pgTable",
)
replace_once(
    "lib/db/src/schema/orders.ts",
    "export type OrderPaymentDecision = typeof orderPaymentDecisions.$inferSelect;\nexport type OrderTerminalDecisionLink",
    "export type OrderPaymentDecision = typeof orderPaymentDecisions.$inferSelect;\nexport type OrderPaymentProviderEvent = typeof orderPaymentProviderEvents.$inferSelect;\nexport type OrderTerminalDecisionLink",
    marker="OrderPaymentProviderEvent",
)

# RLS for provider evidence.
replace_once(
    "lib/db/src/schema/tenant-security.ts",
    'import { orders, orderPaymentDecisions, orderTerminalDecisionLinks } from "./orders";',
    'import {\n  orders,\n  orderPaymentDecisions,\n  orderPaymentProviderEvents,\n  orderTerminalDecisionLinks,\n} from "./orders";',
    marker="orderPaymentProviderEvents",
)
replace_once(
    "lib/db/src/schema/tenant-security.ts",
    'export const orderPaymentDecisionsTenantPolicy = tenantPolicy("order_payment_decisions_tenant_boundary", orderPaymentDecisions);\nexport const orderTerminalDecisionLinksTenantPolicy',
    'export const orderPaymentDecisionsTenantPolicy = tenantPolicy("order_payment_decisions_tenant_boundary", orderPaymentDecisions);\nexport const orderPaymentProviderEventsTenantPolicy = tenantPolicy(\n  "order_payment_provider_events_tenant_boundary",\n  orderPaymentProviderEvents,\n);\nexport const orderTerminalDecisionLinksTenantPolicy',
    marker="orderPaymentProviderEventsTenantPolicy",
)

# ---------------------------------------------------------------------------
# Shared server types.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/api-server/src/services/orderOperationsRuntime.ts",
    'export type ServerPaymentStatus =\n  | "cash_on_delivery"\n  | "electronic_pending"\n  | "paid"\n  | "failed"\n  | "manual_review";\n',
    'export type ServerPaymentStatus =\n  | "cash_on_delivery"\n  | "electronic_pending"\n  | "paid"\n  | "failed"\n  | "manual_review";\n\nexport type PaymentConfirmationSource =\n  | "merchant_confirmed"\n  | "provider_verified";\n\nexport type PaymentReconciliationStatus =\n  | "clear"\n  | "reconciliation_required"\n  | "resolved";\n',
    marker="PaymentConfirmationSource",
)
replace_once(
    "artifacts/api-server/src/services/orderOperationsRuntime.ts",
    '  outcome: "paid" | "failed";\n  previous_payment_status:',
    '  outcome: "paid" | "failed";\n  confirmation_source?: PaymentConfirmationSource;\n  previous_payment_status:',
    marker="confirmation_source?: PaymentConfirmationSource",
)
replace_once(
    "artifacts/api-server/src/services/orderOperationsRuntime.ts",
    '  payment_rejection_reason?: string;\n  last_payment_decision?: PaymentDecisionAudit;',
    '  payment_rejection_reason?: string;\n  payment_confirmation_source?: PaymentConfirmationSource;\n  payment_provider?: string;\n  payment_provider_transaction_ref?: string;\n  payment_provider_last_event_id?: string;\n  payment_reconciliation_status?: PaymentReconciliationStatus;\n  payment_conflict_code?: string;\n  payment_conflict_at?: string;\n  payment_conflict_resolved_at?: string;\n  payment_conflict_resolved_by?: string;\n  payment_conflict_resolution_note?: string;\n  last_payment_decision?: PaymentDecisionAudit;',
    marker="payment_reconciliation_status?: PaymentReconciliationStatus",
)

# ---------------------------------------------------------------------------
# PostgreSQL order mapping + manual merchant confirmation provenance/conflict.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '  payment_rejection_reason: string | null;\n  metadata:',
    '  payment_rejection_reason: string | null;\n  payment_confirmation_source: "merchant_confirmed" | "provider_verified" | null;\n  payment_provider: string | null;\n  payment_provider_transaction_ref: string | null;\n  payment_provider_last_event_id: string | null;\n  payment_reconciliation_status: "clear" | "reconciliation_required" | "resolved";\n  payment_conflict_code: string | null;\n  payment_conflict_at: Date | string | null;\n  payment_conflict_resolved_at: Date | string | null;\n  payment_conflict_resolved_by_account_id: string | null;\n  payment_conflict_resolution_note: string | null;\n  metadata:',
    marker="payment_provider_last_event_id",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '  outcome: "paid" | "failed";\n  previous_order_status:',
    '  outcome: "paid" | "failed";\n  confirmation_source: "merchant_confirmed" | "provider_verified" | null;\n  previous_order_status:',
    marker="confirmation_source: \"merchant_confirmed\"",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '       notes, payment_verified_at, payment_verified_by_account_id,\n       payment_rejection_reason, metadata, created_at, updated_at',
    '       notes, payment_verified_at, payment_verified_by_account_id,\n       payment_rejection_reason, payment_confirmation_source::text AS payment_confirmation_source,\n       payment_provider, payment_provider_transaction_ref, payment_provider_last_event_id,\n       payment_reconciliation_status::text AS payment_reconciliation_status,\n       payment_conflict_code, payment_conflict_at, payment_conflict_resolved_at,\n       payment_conflict_resolved_by_account_id, payment_conflict_resolution_note,\n       metadata, created_at, updated_at',
    marker="payment_reconciliation_status::text AS payment_reconciliation_status",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '    outcome: row.outcome,\n    previous_payment_status:',
    '    outcome: row.outcome,\n    ...(row.confirmation_source ? { confirmation_source: row.confirmation_source } : {}),\n    previous_payment_status:',
    marker="row.confirmation_source ?",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '            d.payment_channel::text AS payment_channel, d.outcome::text AS outcome,\n            d.previous_order_status::text AS previous_order_status,',
    '            d.payment_channel::text AS payment_channel, d.outcome::text AS outcome,\n            d.confirmation_source::text AS confirmation_source,\n            d.previous_order_status::text AS previous_order_status,',
    marker="d.confirmation_source::text AS confirmation_source",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '    ...(row.payment_rejection_reason\n      ? { payment_rejection_reason: row.payment_rejection_reason }\n      : {}),\n    ...(decision ? { last_payment_decision: decision } : {}),',
    '    ...(row.payment_rejection_reason\n      ? { payment_rejection_reason: row.payment_rejection_reason }\n      : {}),\n    ...(row.payment_confirmation_source\n      ? { payment_confirmation_source: row.payment_confirmation_source }\n      : {}),\n    ...(row.payment_provider ? { payment_provider: row.payment_provider } : {}),\n    ...(row.payment_provider_transaction_ref\n      ? { payment_provider_transaction_ref: row.payment_provider_transaction_ref }\n      : {}),\n    ...(row.payment_provider_last_event_id\n      ? { payment_provider_last_event_id: row.payment_provider_last_event_id }\n      : {}),\n    payment_reconciliation_status: row.payment_reconciliation_status,\n    ...(row.payment_conflict_code ? { payment_conflict_code: row.payment_conflict_code } : {}),\n    ...(iso(row.payment_conflict_at)\n      ? { payment_conflict_at: iso(row.payment_conflict_at)! }\n      : {}),\n    ...(iso(row.payment_conflict_resolved_at)\n      ? { payment_conflict_resolved_at: iso(row.payment_conflict_resolved_at)! }\n      : {}),\n    ...(row.payment_conflict_resolved_by_account_id\n      ? { payment_conflict_resolved_by: row.payment_conflict_resolved_by_account_id }\n      : {}),\n    ...(row.payment_conflict_resolution_note\n      ? { payment_conflict_resolution_note: row.payment_conflict_resolution_note }\n      : {}),\n    ...(decision ? { last_payment_decision: decision } : {}),',
    marker="payment_conflict_resolution_note",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '  outcome: "paid" | "failed";\n  resultingStatus:',
    '  outcome: "paid" | "failed";\n  confirmationSource?: "merchant_confirmed" | "provider_verified";\n  resultingStatus:',
    marker="confirmationSource?: \"merchant_confirmed\"",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '      (id, merchant_id, order_id, operation, payment_channel, outcome,\n       previous_order_status, resulting_order_status,\n       previous_payment_status, resulting_payment_status,',
    '      (id, merchant_id, order_id, operation, payment_channel, outcome, confirmation_source,\n       previous_order_status, resulting_order_status,\n       previous_payment_status, resulting_payment_status,',
    marker="outcome, confirmation_source",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '       $5::payment_decision_channel, $6::payment_decision_outcome,\n       $7::order_status, $8::order_status,\n       $9::payment_status, $10::payment_status,\n       \'merchant\', $11, $12, $13, $14, $15, now())`,',
    '       $5::payment_decision_channel, $6::payment_decision_outcome,\n       $7::payment_confirmation_source,\n       $8::order_status, $9::order_status,\n       $10::payment_status, $11::payment_status,\n       \'merchant\', $12, $13, $14, $15, $16, now())`,',
    marker="$7::payment_confirmation_source",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '      input.outcome,\n      input.current.status,\n      input.resultingStatus,\n      input.current.payment_status,\n      input.resultingPaymentStatus,\n      input.actorId,\n      input.requestId || null,\n      input.reason || null,\n      input.current.version,\n      input.current.version + 1,',
    '      input.outcome,\n      input.confirmationSource || null,\n      input.current.status,\n      input.resultingStatus,\n      input.current.payment_status,\n      input.resultingPaymentStatus,\n      input.actorId,\n      input.requestId || null,\n      input.reason || null,\n      input.current.version,\n      input.current.version + 1,',
    marker="input.confirmationSource || null",
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '        current.payment_status !== "electronic_pending" &&\n        current.payment_status !== "manual_review"',
    '        current.payment_status !== "electronic_pending" &&\n        current.payment_status !== "manual_review" &&\n        current.payment_status !== "failed"',
    marker='current.payment_status !== "failed"',
)
replace_once(
    "artifacts/api-server/src/services/postgresOrderOperationsAuthority.ts",
    '    await saveTerminalDecision({\n      client,\n      current,\n      merchantId,\n      orderId,\n      actorId,\n      requestId,\n      operation: "confirm",\n      channel: current.payment_method === "cash_on_delivery" ? "cash_on_delivery" : "electronic",\n      outcome: "paid",\n      resultingStatus,\n      resultingPaymentStatus: "paid",\n    });\n    await client.query(\n      `UPDATE orders\n          SET status = $3::order_status,\n              payment_status = \'paid\',\n              payment_verified_at = now(),\n              payment_verified_by_account_id = $4,\n              payment_rejection_reason = NULL,\n              confirmed_at = CASE WHEN $3 = \'confirmed\' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,\n              version = version + 1,\n              updated_at = now()\n        WHERE merchant_id = $1 AND id = $2`,\n      [merchantId, orderId, resultingStatus, actorId],\n    );',
    '    const providerEvidence =\n      current.payment_method === "cash_on_delivery"\n        ? { rows: [] as Array<{ provider: string; provider_event_id: string; provider_transaction_ref: string | null; outcome: string }> }\n        : await client.query<{\n            provider: string;\n            provider_event_id: string;\n            provider_transaction_ref: string | null;\n            outcome: string;\n          }>(\n            `SELECT provider, provider_event_id, provider_transaction_ref, outcome::text AS outcome\n               FROM order_payment_provider_events\n              WHERE merchant_id = $1 AND order_id = $2\n              ORDER BY received_at DESC, processed_at DESC, id DESC\n              LIMIT 1`,\n            [merchantId, orderId],\n          );\n    const latestProvider = providerEvidence.rows[0];\n    const providerConflict = Boolean(latestProvider && latestProvider.outcome !== "paid");\n    const providerConflictCode = providerConflict\n      ? `MERCHANT_PAID_PROVIDER_${String(latestProvider!.outcome).toUpperCase()}`\n      : null;\n\n    await saveTerminalDecision({\n      client,\n      current,\n      merchantId,\n      orderId,\n      actorId,\n      requestId,\n      operation: "confirm",\n      channel: current.payment_method === "cash_on_delivery" ? "cash_on_delivery" : "electronic",\n      outcome: "paid",\n      confirmationSource: "merchant_confirmed",\n      resultingStatus,\n      resultingPaymentStatus: "paid",\n    });\n    await client.query(\n      `UPDATE orders\n          SET status = $3::order_status,\n              payment_status = \'paid\',\n              payment_verified_at = now(),\n              payment_verified_by_account_id = $4,\n              payment_rejection_reason = NULL,\n              payment_confirmation_source = \'merchant_confirmed\',\n              payment_provider = COALESCE($5, payment_provider),\n              payment_provider_transaction_ref = COALESCE($6, payment_provider_transaction_ref),\n              payment_provider_last_event_id = COALESCE($7, payment_provider_last_event_id),\n              payment_reconciliation_status = CASE WHEN $8::boolean THEN \'reconciliation_required\' ELSE \'clear\' END,\n              payment_conflict_code = CASE WHEN $8::boolean THEN $9 ELSE NULL END,\n              payment_conflict_at = CASE WHEN $8::boolean THEN COALESCE(payment_conflict_at, now()) ELSE NULL END,\n              payment_conflict_resolved_at = NULL,\n              payment_conflict_resolved_by_account_id = NULL,\n              payment_conflict_resolution_note = NULL,\n              confirmed_at = CASE WHEN $3 = \'confirmed\' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,\n              version = version + 1,\n              updated_at = now()\n        WHERE merchant_id = $1 AND id = $2`,\n      [\n        merchantId,\n        orderId,\n        resultingStatus,\n        actorId,\n        latestProvider?.provider || null,\n        latestProvider?.provider_transaction_ref || null,\n        latestProvider?.provider_event_id || null,\n        providerConflict,\n        providerConflictCode,\n      ],\n    );\n    if (providerConflict && current.conversation_id) {\n      await client.query(\n        `UPDATE conversations\n            SET status = \'manual\', assigned_to_human = TRUE, updated_at = now()\n          WHERE merchant_id = $1 AND id = $2`,\n        [merchantId, current.conversation_id],\n      );\n    }',
    marker="const providerEvidence =",
)

# ---------------------------------------------------------------------------
# Prevent unresolved payment conflicts from silently returning to the bot.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/api-server/src/services/postgresManualConversationAuthority.ts",
    '    if (!manual && unresolved.rows.length > 0) {\n      throw new ManualConversationError(\n        "MANUAL_REPLY_RECONCILIATION_REQUIRED",\n        "manual reply delivery must be reconciled before returning to Fawri",\n      );\n    }\n    const updated =',
    '    if (!manual && unresolved.rows.length > 0) {\n      throw new ManualConversationError(\n        "MANUAL_REPLY_RECONCILIATION_REQUIRED",\n        "manual reply delivery must be reconciled before returning to Fawri",\n      );\n    }\n    if (!manual) {\n      const paymentConflict = await client.query<{ id: string }>(\n        `SELECT id\n           FROM orders\n          WHERE merchant_id = $1 AND conversation_id = $2\n            AND payment_reconciliation_status = \'reconciliation_required\'\n          LIMIT 1`,\n        [merchantId, conversationId],\n      );\n      if (paymentConflict.rows.length > 0) {\n        throw new ManualConversationError(\n          "PAYMENT_RECONCILIATION_REQUIRED",\n          "payment conflict must be resolved before returning the conversation to Fawri",\n        );\n      }\n    }\n    const updated =',
    marker="PAYMENT_RECONCILIATION_REQUIRED",
)

# ---------------------------------------------------------------------------
# Merchant notification for payment conflict.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts",
    '  type: "operational_new_order" | "operational_customer_message";\n  sourceEntityType: "order" | "conversation_event";',
    '  type:\n    | "operational_new_order"\n    | "operational_customer_message"\n    | "operational_payment_conflict";\n  sourceEntityType: "order" | "conversation_event" | "order_payment_conflict";',
    marker="operational_payment_conflict",
)
replace_once(
    "artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts",
    'export async function notifyMerchantNewCustomerMessagePostgres(input: {',
    'export async function notifyMerchantPaymentConflictPostgres(input: {\n  merchantId: string;\n  orderId: string;\n  conversationId?: string;\n  provider?: string;\n  sourceEventId: string;\n  createdAt?: unknown;\n}) {\n  const orderId = text(input.orderId);\n  const conversationId = text(input.conversationId);\n  const sourceEventId = text(input.sourceEventId);\n  return insertOperationalNotification({\n    merchantId: input.merchantId,\n    type: "operational_payment_conflict",\n    sourceEntityType: "order_payment_conflict",\n    sourceEntityId: sourceEventId || orderId,\n    titleKey: "notifications.payment_conflict.title",\n    bodyKey: "notifications.payment_conflict.body",\n    variables: {\n      order_id: orderId,\n      ...(conversationId ? { conversation_id: conversationId } : {}),\n      ...(text(input.provider) ? { provider: text(input.provider) } : {}),\n      action_url: conversationId\n        ? `/dashboard/conversations?conversation=${encodeURIComponent(conversationId)}`\n        : `/dashboard/orders?order=${encodeURIComponent(orderId)}`,\n    },\n    createdAt: input.createdAt,\n  });\n}\n\nexport async function notifyMerchantNewCustomerMessagePostgres(input: {',
    marker="notifyMerchantPaymentConflictPostgres",
)

# ---------------------------------------------------------------------------
# Merchant order routes: manual source notification + explicit conflict resolve.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/api-server/src/routes/order-operations.ts",
    '} from "../services/postgresOrderOperationsAuthority";\n',
    '} from "../services/postgresOrderOperationsAuthority";\nimport {\n  resolveMerchantPaymentConflictAuthoritative,\n} from "../services/postgresOrderPaymentProviderAuthority";\nimport {\n  notifyMerchantPaymentConflictPostgres,\n} from "../services/postgresOperationalNotificationAuthority";\n',
    marker="resolveMerchantPaymentConflictAuthoritative",
)
replace_once(
    "artifacts/api-server/src/routes/order-operations.ts",
    '      const order = await confirmServerPaymentAuthoritative({\n        merchantId,\n        orderId: parameter(req.params.orderId),\n        expectedVersion: req.body?.expected_version,\n        actorId: merchantId,\n        requestId: requestId(req),\n      });\n      res.setHeader("Cache-Control", "no-store");',
    '      const paymentRequestId = requestId(req);\n      const order = await confirmServerPaymentAuthoritative({\n        merchantId,\n        orderId: parameter(req.params.orderId),\n        expectedVersion: req.body?.expected_version,\n        actorId: merchantId,\n        requestId: paymentRequestId,\n      });\n      if (order.payment_reconciliation_status === "reconciliation_required") {\n        await notifyMerchantPaymentConflictPostgres({\n          merchantId,\n          orderId: order.id,\n          conversationId: order.conversation_id,\n          provider: order.payment_provider,\n          sourceEventId: paymentRequestId || `merchant:${order.id}:${order.version}`,\n        });\n      }\n      res.setHeader("Cache-Control", "no-store");',
    marker="paymentRequestId = requestId(req)",
)
replace_once(
    "artifacts/api-server/src/routes/order-operations.ts",
    '\nexport default router;\n',
    '''\nrouter.post(\n  "/orders/:orderId/payment/conflict/resolve",\n  requireMerchantSession,\n  async (req: Request, res: Response) => {\n    try {\n      const merchantId = getMerchantIdFromSession(res);\n      const order = await resolveMerchantPaymentConflictAuthoritative({\n        merchantId,\n        orderId: parameter(req.params.orderId),\n        expectedVersion: req.body?.expected_version,\n        actorId: merchantId,\n        resolutionNote: req.body?.resolution_note,\n      });\n      res.setHeader("Cache-Control", "no-store");\n      res.json({ ok: true, order });\n    } catch (error) {\n      sendError(res, error);\n    }\n  },\n);\n\nexport default router;\n''',
    marker="payment/conflict/resolve",
)

# ---------------------------------------------------------------------------
# Frontend shared types.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/fawri/src/lib/types.ts",
    "export type OrderPaymentStatus =\n  | 'cash_on_delivery'\n  | 'electronic_pending'\n  | 'paid'\n  | 'failed'\n  | 'manual_review';\n",
    "export type OrderPaymentStatus =\n  | 'cash_on_delivery'\n  | 'electronic_pending'\n  | 'paid'\n  | 'failed'\n  | 'manual_review';\n\nexport type PaymentConfirmationSource =\n  | 'merchant_confirmed'\n  | 'provider_verified';\n\nexport type PaymentReconciliationStatus =\n  | 'clear'\n  | 'reconciliation_required'\n  | 'resolved';\n",
    marker="PaymentReconciliationStatus",
)
replace_once(
    "artifacts/fawri/src/lib/types.ts",
    'export type MerchantOperationalNotification =\n  | MerchantNewOrderNotification\n  | MerchantCustomerMessageNotification;',
    '''export interface MerchantPaymentConflictNotification {\n  id: string;\n  merchant_id: string;\n  type: 'operational_payment_conflict';\n  order_id: string;\n  conversation_id?: string;\n  provider?: string;\n  action_url: string;\n  created_at: string;\n  read_at?: string;\n}\n\nexport type MerchantOperationalNotification =\n  | MerchantNewOrderNotification\n  | MerchantCustomerMessageNotification\n  | MerchantPaymentConflictNotification;''',
    marker="MerchantPaymentConflictNotification",
)
replace_once(
    "artifacts/fawri/src/lib/types.ts",
    '  payment_rejection_reason?: string;\n\n  created_at: string;',
    '''  payment_rejection_reason?: string;\n  payment_confirmation_source?: PaymentConfirmationSource;\n  payment_provider?: string;\n  payment_provider_transaction_ref?: string;\n  payment_provider_last_event_id?: string;\n  payment_reconciliation_status?: PaymentReconciliationStatus;\n  payment_conflict_code?: string;\n  payment_conflict_at?: string;\n  payment_conflict_resolved_at?: string;\n  payment_conflict_resolved_by?: string;\n  payment_conflict_resolution_note?: string;\n\n  created_at: string;''',
    marker="payment_provider_last_event_id?: string",
)

# ---------------------------------------------------------------------------
# Orders UI: show source, conflict, explicit resolution.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    '  RefreshCw,\n  Search,\n  XCircle,',
    '  RefreshCw,\n  Search,\n  AlertTriangle,\n  XCircle,',
    marker="AlertTriangle",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "    reason?: string;\n  };\n};",
    "    reason?: string;\n    confirmation_source?: 'merchant_confirmed' | 'provider_verified';\n  };\n};",
    marker="confirmation_source?: 'merchant_confirmed'",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "      paymentDecision: 'آخر قرار دفع',",
    "      paymentDecision: 'آخر قرار دفع',\n      confirmationSource: 'مصدر تأكيد الدفع',\n      merchantConfirmed: 'أكد التاجر يدويًا',\n      providerVerified: 'تم التحقق من مزود الدفع',\n      paymentConflictTitle: 'يوجد تعارض في معلومات الدفع',\n      paymentConflictBody: 'تم إيقاف البوت لهذه المحادثة فقط. راجع العملية مع الزبون ثم سجل حل الخلاف.',\n      resolutionNote: 'اكتب كيف تم حل الخلاف',\n      resolveConflict: 'تم حل الخلاف',\n      conflictResolved: 'تم تسجيل حل خلاف الدفع. يمكنك إعادة المحادثة إلى فوري من صفحة المحادثات.',",
    marker="paymentConflictTitle",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "      paymentDecision: 'دوایین بڕیاری پارەدان',",
    "      paymentDecision: 'دوایین بڕیاری پارەدان',\n      confirmationSource: 'سەرچاوەی پشتڕاستکردنەوەی پارەدان',\n      merchantConfirmed: 'فرۆشیار بە دەستی پشتڕاستی کردەوە',\n      providerVerified: 'دابینکەری پارەدان پشتڕاستی کردەوە',\n      paymentConflictTitle: 'ناکۆکی لە زانیاری پارەدان هەیە',\n      paymentConflictBody: 'بۆتی تەنها بۆ ئەم گفتوگۆیە وەستاوە. مامەڵەکە پشکنین بکە و چارەسەرەکە تۆمار بکە.',\n      resolutionNote: 'چۆنیەتی چارەسەرکردنی ناکۆکی بنووسە',\n      resolveConflict: 'ناکۆکی چارەسەر کرا',\n      conflictResolved: 'چارەسەری ناکۆکی پارەدان تۆمار کرا. دەتوانیت گفتوگۆکە بگەڕێنیتەوە بۆ فەوری.',",
    marker="سەرچاوەی پشتڕاستکردنەوەی پارەدان",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "    paymentDecision: 'Last payment decision',",
    "    paymentDecision: 'Last payment decision',\n    confirmationSource: 'Payment confirmation source',\n    merchantConfirmed: 'Merchant confirmed manually',\n    providerVerified: 'Verified by payment provider',\n    paymentConflictTitle: 'Payment information conflict',\n    paymentConflictBody: 'Fawri paused only this conversation. Review the payment with the customer, then record how the conflict was resolved.',\n    resolutionNote: 'Describe how the conflict was resolved',\n    resolveConflict: 'Mark conflict resolved',\n    conflictResolved: 'Payment conflict resolution recorded. You can return the conversation to Fawri from Conversations.',",
    marker="Payment confirmation source",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "  const [rejectionReason, setRejectionReason] = useState('');",
    "  const [rejectionReason, setRejectionReason] = useState('');\n  const [conflictResolutionNote, setConflictResolutionNote] = useState('');",
    marker="conflictResolutionNote",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "      setRejectionReason('');\n      toast.success(labels.updated);",
    "      setRejectionReason('');\n      setConflictResolutionNote('');\n      toast.success(labels.updated);",
    marker="setConflictResolutionNote('');\n      toast.success",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "  const rejectPayment = (order: ServerOrder) => {",
    "  const resolvePaymentConflict = (order: ServerOrder) => {\n    const note = conflictResolutionNote.trim();\n    if (!note) {\n      toast.error(labels.resolutionNote);\n      return;\n    }\n    void mutateOrder(\n      order,\n      `/api/orders/${encodeURIComponent(order.id)}/payment/conflict/resolve`,\n      { resolution_note: note },\n      'POST',\n    );\n  };\n\n  const rejectPayment = (order: ServerOrder) => {",
    marker="resolvePaymentConflict",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "  const cashCanConfirm =\n    selectedOrder?.payment_method === 'cash_on_delivery' &&",
    "  const paymentConflictActive =\n    selectedOrder?.payment_reconciliation_status === 'reconciliation_required';\n  const cashCanConfirm =\n    selectedOrder?.payment_method === 'cash_on_delivery' &&",
    marker="paymentConflictActive",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx",
    "                {electronicPending ? (",
    '''                {selectedOrder.payment_status === 'paid' &&\n                selectedOrder.payment_confirmation_source ? (\n                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">\n                    <p className="font-semibold">{labels.confirmationSource}</p>\n                    <p className="mt-1 text-muted-foreground">\n                      {selectedOrder.payment_confirmation_source === 'provider_verified'\n                        ? labels.providerVerified\n                        : labels.merchantConfirmed}\n                      {selectedOrder.payment_provider\n                        ? ` · ${selectedOrder.payment_provider}`\n                        : ''}\n                    </p>\n                  </div>\n                ) : null}\n\n                {paymentConflictActive ? (\n                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">\n                    <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">\n                      <AlertTriangle className="h-5 w-5" />\n                      {labels.paymentConflictTitle}\n                    </div>\n                    <p className="mt-2 text-sm leading-6 text-foreground/80">\n                      {labels.paymentConflictBody}\n                    </p>\n                    {selectedOrder.payment_conflict_code ? (\n                      <p className="mt-2 font-mono text-xs text-muted-foreground">\n                        {selectedOrder.payment_conflict_code}\n                      </p>\n                    ) : null}\n                    <Input\n                      value={conflictResolutionNote}\n                      onChange={event => setConflictResolutionNote(event.target.value)}\n                      placeholder={labels.resolutionNote}\n                      maxLength={500}\n                      disabled={busy}\n                      className="mt-3"\n                    />\n                    <Button\n                      className="mt-3"\n                      variant="outline"\n                      disabled={busy || !conflictResolutionNote.trim()}\n                      onClick={() => resolvePaymentConflict(selectedOrder)}\n                    >\n                      {labels.resolveConflict}\n                    </Button>\n                  </div>\n                ) : selectedOrder.payment_reconciliation_status === 'resolved' ? (\n                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">\n                    {labels.conflictResolved}\n                  </div>\n                ) : null}\n\n                {electronicPending ? (''',
    marker="labels.paymentConflictTitle}</div>",
)

# ---------------------------------------------------------------------------
# Notifications UI: payment conflict is a first-class operational notice.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx",
    "import { Bell, Check, ExternalLink, Loader2, MessageCircle, Package, RefreshCw, ShieldCheck } from 'lucide-react';",
    "import { AlertTriangle, Bell, Check, ExternalLink, Loader2, MessageCircle, Package, RefreshCw, ShieldCheck } from 'lucide-react';",
    marker="AlertTriangle, Bell",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx",
    "    messageOpen: 'فتح المحادثة',",
    "    messageOpen: 'فتح المحادثة',\n    conflictTitle: 'تعارض في تأكيد الدفع',\n    conflictBody: 'يوجد اختلاف في معلومات دفع الطلب {order}. تم إيقاف البوت للمحادثة المعنية حتى تراجع العملية.',\n    conflictOpen: 'مراجعة الخلاف',",
    marker="تعارض في تأكيد الدفع",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx",
    "    messageOpen: 'کردنەوەی گفتوگۆ',",
    "    messageOpen: 'کردنەوەی گفتوگۆ',\n    conflictTitle: 'ناکۆکی لە پشتڕاستکردنەوەی پارەدان',\n    conflictBody: 'زانیاری پارەدانی داواکاری {order} یەک ناگرێتەوە. بۆتی ئەم گفتوگۆیە تا پشکنین وەستاوە.',\n    conflictOpen: 'پشکنینی ناکۆکی',",
    marker="ناکۆکی لە پشتڕاستکردنەوەی پارەدان",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx",
    "    messageOpen: 'Open conversation',",
    "    messageOpen: 'Open conversation',\n    conflictTitle: 'Payment confirmation conflict',\n    conflictBody: 'Payment information for order {order} conflicts. Fawri paused only the related conversation until you review it.',\n    conflictOpen: 'Review conflict',",
    marker="Payment confirmation conflict",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx",
    "              notification.type === 'operational_new_order' ||\n              notification.type === 'operational_customer_message'",
    "              notification.type === 'operational_new_order' ||\n              notification.type === 'operational_customer_message' ||\n              notification.type === 'operational_payment_conflict'",
    marker="notification.type === 'operational_payment_conflict'",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx",
    "              const isOrder = notification.type === 'operational_new_order';\n              const title = isOrder\n                ? operationalText.orderTitle\n                : operationalText.messageTitle;\n              const body = isOrder\n                ? formatNotificationText(operationalText.orderBody, {\n                    order: notification.order_id,\n                  })\n                : operationalText.messageBody;\n              const openLabel = isOrder\n                ? operationalText.orderOpen\n                : operationalText.messageOpen;",
    "              const isOrder = notification.type === 'operational_new_order';\n              const isPaymentConflict =\n                notification.type === 'operational_payment_conflict';\n              const title = isPaymentConflict\n                ? operationalText.conflictTitle\n                : isOrder\n                  ? operationalText.orderTitle\n                  : operationalText.messageTitle;\n              const body = isPaymentConflict\n                ? formatNotificationText(operationalText.conflictBody, {\n                    order: notification.order_id,\n                  })\n                : isOrder\n                  ? formatNotificationText(operationalText.orderBody, {\n                      order: notification.order_id,\n                    })\n                  : operationalText.messageBody;\n              const openLabel = isPaymentConflict\n                ? operationalText.conflictOpen\n                : isOrder\n                  ? operationalText.orderOpen\n                  : operationalText.messageOpen;",
    marker="const isPaymentConflict =",
)
replace_once(
    "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx",
    "                      {isOrder ? <Package className=\"h-5 w-5\" /> : <MessageCircle className=\"h-5 w-5\" />}",
    "                      {isPaymentConflict ? (\n                        <AlertTriangle className=\"h-5 w-5\" />\n                      ) : isOrder ? (\n                        <Package className=\"h-5 w-5\" />\n                      ) : (\n                        <MessageCircle className=\"h-5 w-5\" />\n                      )}",
    marker="isPaymentConflict ? (",
)

# ---------------------------------------------------------------------------
# Legacy auth notification type/validation compatibility. This only teaches
# the legacy serializer the new shape; PostgreSQL remains the authority.
# ---------------------------------------------------------------------------
replace_once(
    "artifacts/api-server/src/routes/auth.ts",
    'type MerchantOperationalNotificationRecord =\n  | MerchantOperationalOrderNotificationRecord\n  | MerchantOperationalCustomerMessageNotificationRecord;',
    '''type MerchantOperationalPaymentConflictNotificationRecord = {\n  id: string;\n  merchant_id: string;\n  type: "operational_payment_conflict";\n  order_id: string;\n  conversation_id?: string;\n  provider?: string;\n  action_url: string;\n  dedupe_key: string;\n  created_at: string;\n  read_at?: string;\n};\n\ntype MerchantOperationalNotificationRecord =\n  | MerchantOperationalOrderNotificationRecord\n  | MerchantOperationalCustomerMessageNotificationRecord\n  | MerchantOperationalPaymentConflictNotificationRecord;''',
    marker="MerchantOperationalPaymentConflictNotificationRecord",
)
replace_once(
    "artifacts/api-server/src/routes/auth.ts",
    '  if (item.type === "operational_customer_message") {\n    return (\n      typeof item.conversation_id === "string" &&\n      typeof item.action_url === "string" &&\n      typeof item.dedupe_key === "string"\n    );\n  }',
    '  if (item.type === "operational_customer_message") {\n    return (\n      typeof item.conversation_id === "string" &&\n      typeof item.action_url === "string" &&\n      typeof item.dedupe_key === "string"\n    );\n  }\n\n  if (item.type === "operational_payment_conflict") {\n    return (\n      typeof item.order_id === "string" &&\n      typeof item.action_url === "string" &&\n      typeof item.dedupe_key === "string"\n    );\n  }',
    marker='item.type === "operational_payment_conflict"',
)

print("MERCHANT_CUSTOMER_PAYMENT_PATCH_APPLIED")
