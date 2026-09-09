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
  console.log('[cashier] discount policy schema ready');
}

main().catch((error) => {
  console.error('[cashier] discount policy schema failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
