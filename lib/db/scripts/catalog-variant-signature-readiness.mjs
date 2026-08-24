import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;
const connectionString = String(process.env.DATABASE_URL || '').trim();
assert.ok(connectionString, 'DATABASE_URL is required');

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('BEGIN READ ONLY');

  const [{ current_database: database }] = (
    await client.query('SELECT current_database() AS current_database')
  ).rows;

  const signatureStats = (
    await client.query(`
      SELECT
        COUNT(*)::int AS variant_count,
        COUNT(*) FILTER (
          WHERE char_length(option_signature) NOT BETWEEN 16 AND 256
        )::int AS invalid_signature_count,
        MIN(char_length(option_signature))::int AS min_signature_length,
        MAX(char_length(option_signature))::int AS max_signature_length
      FROM product_variants
    `)
  ).rows[0];

  const guard = (
    await client.query(`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'product_variants_option_signature_guard'
            AND NOT tgisinternal
        ) AS trigger_present,
        EXISTS (
          SELECT 1
          FROM pg_proc
          WHERE proname = 'fawri_normalize_catalog_variant_signature'
        ) AS normalizer_present
    `)
  ).rows[0];

  const [{ product_count }] = (
    await client.query(`
      SELECT COUNT(*)::int AS product_count
      FROM products
      WHERE deleted_at IS NULL
    `)
  ).rows;

  await client.query('ROLLBACK');

  const invalidSignatureCount = Number(signatureStats.invalid_signature_count);
  const triggerPresent = Boolean(guard.trigger_present);
  const normalizerPresent = Boolean(guard.normalizer_present);
  const ready = invalidSignatureCount === 0 && triggerPresent && normalizerPresent;

  process.stdout.write(`${JSON.stringify({
    ok: ready,
    mode: 'read_only_catalog_variant_signature_readiness',
    database,
    product_count: Number(product_count),
    variant_count: Number(signatureStats.variant_count),
    invalid_signature_count: invalidSignatureCount,
    min_signature_length: signatureStats.min_signature_length === null ? null : Number(signatureStats.min_signature_length),
    max_signature_length: signatureStats.max_signature_length === null ? null : Number(signatureStats.max_signature_length),
    signature_guard_trigger_present: triggerPresent,
    signature_normalizer_present: normalizerPresent,
    database_writes_performed: false,
  }, null, 2)}\n`);

  if (!ready) process.exitCode = 2;
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
