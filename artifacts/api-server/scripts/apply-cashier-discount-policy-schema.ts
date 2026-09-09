import { operationalDatabasePool } from '../src/services/operationalPostgresAuthority';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  const pool = await operationalDatabasePool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_cashier_staff_discount_policies (
      merchant_id text NOT NULL,
      staff_id text NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      max_percentage_bps integer NOT NULL DEFAULT 0,
      max_amount_minor bigint NULL,
      can_approve_override boolean NOT NULL DEFAULT false,
      version bigint NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (merchant_id, staff_id),
      CONSTRAINT cashier_discount_percentage_range
        CHECK (max_percentage_bps >= 0 AND max_percentage_bps <= 10000),
      CONSTRAINT cashier_discount_amount_nonnegative
        CHECK (max_amount_minor IS NULL OR max_amount_minor >= 0)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS merchant_cashier_staff_discount_policies_merchant_idx
      ON merchant_cashier_staff_discount_policies (merchant_id, staff_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_cashier_discount_override_approvals (
      id text PRIMARY KEY,
      merchant_id text NOT NULL,
      station_id text NOT NULL,
      operator_staff_id text NOT NULL,
      approver_staff_id text NOT NULL,
      operation_id text NOT NULL,
      manual_discount_minor bigint NOT NULL,
      manual_discount_reason text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT cashier_discount_override_amount_positive
        CHECK (manual_discount_minor > 0),
      CONSTRAINT cashier_discount_override_reason_nonempty
        CHECK (char_length(btrim(manual_discount_reason)) BETWEEN 1 AND 200),
      CONSTRAINT cashier_discount_override_not_self_approved
        CHECK (operator_staff_id <> approver_staff_id),
      UNIQUE (merchant_id, operation_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS merchant_cashier_discount_override_approvals_lookup_idx
      ON merchant_cashier_discount_override_approvals (merchant_id, operation_id, id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS merchant_cashier_discount_override_approvals_approver_idx
      ON merchant_cashier_discount_override_approvals (merchant_id, approver_staff_id, created_at DESC)
  `);
  console.log('[cashier] discount policy and override schema ready');
}

main().catch((error) => {
  console.error('[cashier] discount policy schema failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
