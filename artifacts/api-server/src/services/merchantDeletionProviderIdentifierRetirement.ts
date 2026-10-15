import type { OperationalQueryTarget } from "./operationalPostgresAuthority";

/**
 * Replace provider-scoped identifiers in retained deletion evidence with
 * deletion-safe internal linkage. This runs only after deletion quiescence has
 * proved there are no active durable jobs, uncertain sends, or unresolved
 * reply refunds.
 *
 * The retained tokens intentionally derive from Fawri-owned row identifiers,
 * not from Meta/provider identifiers. They therefore preserve uniqueness and
 * historical joins without leaving a reversible Page/message namespace behind.
 */
export async function retireMerchantProviderIdentifiers(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<void> {
  // Inbound rows remain as FK anchors. Their internal row IDs are globally
  // unique, so provider + external_event_id uniqueness remains valid.
  await target.query(
    `UPDATE channel_inbound_events
        SET external_event_id = 'deleted:event:' || id
      WHERE merchant_id = $1`,
    [merchantId],
  );

  // Reservations retain the same deletion-safe event token as their inbound
  // anchor so historical debit/refund linkage can still be followed internally.
  await target.query(
    `UPDATE reply_reservations
        SET external_event_id = 'deleted:event:' || inbound_event_id
      WHERE merchant_id = $1`,
    [merchantId],
  );

  // Ledger rows linked to reservations/refunds inherit the same internal event
  // token. Any other retained ledger row receives a token from its own internal
  // ledger ID. The external-event/direction uniqueness invariant is preserved.
  await target.query(
    `UPDATE reply_ledger l
        SET external_event_id = CASE
              WHEN l.external_event_id IS NULL THEN NULL
              ELSE COALESCE(
                (
                  SELECT 'deleted:event:' || r.inbound_event_id
                    FROM reply_reservations r
                   WHERE r.merchant_id = $1
                     AND r.debit_ledger_id = l.id
                   LIMIT 1
                ),
                (
                  SELECT 'deleted:event:' || r.inbound_event_id
                    FROM reply_refunds f
                    JOIN reply_reservations r
                      ON r.id = f.reservation_id
                     AND r.merchant_id = f.merchant_id
                   WHERE f.merchant_id = $1
                     AND f.credit_ledger_id = l.id
                   LIMIT 1
                ),
                'deleted:ledger:' || l.id
              )
            END
      WHERE l.merchant_id = $1`,
    [merchantId],
  );

  // Terminal durable jobs can remain as exactly-once anchors when referenced by
  // inbound evidence. Their dedupe key no longer needs the provider namespace.
  await target.query(
    `UPDATE background_jobs
        SET dedupe_key = 'deleted:job:' || id
      WHERE merchant_id = $1`,
    [merchantId],
  );

  // Confirmed provider message IDs are not required for internal accounting or
  // refund linkage once irreversible deletion is allowed to proceed.
  await target.query(
    `UPDATE outbound_deliveries
        SET provider_message_id = NULL
      WHERE merchant_id = $1`,
    [merchantId],
  );
}
