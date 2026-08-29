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

  const commerceSchema = (
    await client.query(`
      SELECT
        to_regclass('public.commerce_promotions') IS NOT NULL AS promotions_table_present,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'merchants'
            AND column_name = 'country_code'
        ) AS country_code_column_present,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'merchants'
            AND column_name = 'timezone'
        ) AS timezone_column_present,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'merchants'
            AND column_name = 'currency_code'
        ) AS currency_code_column_present,
        EXISTS (
          SELECT 1
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = 'commerce_promotions'
            AND policyname = 'commerce_promotions_tenant_boundary'
        ) AS promotions_tenant_policy_present
    `)
  ).rows[0];

  const commerceColumnsReady =
    Boolean(commerceSchema.country_code_column_present) &&
    Boolean(commerceSchema.timezone_column_present) &&
    Boolean(commerceSchema.currency_code_column_present);

  let merchantRegionalStats = {
    merchant_count: null,
    invalid_country_count: null,
    invalid_timezone_count: null,
    invalid_currency_count: null,
  };

  if (commerceColumnsReady) {
    merchantRegionalStats = (
      await client.query(`
        SELECT
          COUNT(*)::int AS merchant_count,
          COUNT(*) FILTER (
            WHERE country_code !~ '^[A-Z]{2}$'
          )::int AS invalid_country_count,
          COUNT(*) FILTER (
            WHERE timezone = ''
               OR NOT EXISTS (
                 SELECT 1
                 FROM pg_timezone_names AS known_timezone
                 WHERE known_timezone.name = merchants.timezone
               )
          )::int AS invalid_timezone_count,
          COUNT(*) FILTER (
            WHERE currency_code !~ '^[A-Z]{3}$'
          )::int AS invalid_currency_count
        FROM merchants
      `)
    ).rows[0];
  }

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
  const promotionsTablePresent = Boolean(commerceSchema.promotions_table_present);
  const promotionsTenantPolicyPresent = Boolean(
    commerceSchema.promotions_tenant_policy_present,
  );
  const invalidCountryCount = commerceColumnsReady
    ? Number(merchantRegionalStats.invalid_country_count)
    : null;
  const invalidTimezoneCount = commerceColumnsReady
    ? Number(merchantRegionalStats.invalid_timezone_count)
    : null;
  const invalidCurrencyCount = commerceColumnsReady
    ? Number(merchantRegionalStats.invalid_currency_count)
    : null;

  const commerceReady =
    commerceColumnsReady &&
    promotionsTablePresent &&
    promotionsTenantPolicyPresent &&
    invalidCountryCount === 0 &&
    invalidTimezoneCount === 0 &&
    invalidCurrencyCount === 0;
  const variantSignatureReady =
    invalidSignatureCount === 0 && triggerPresent && normalizerPresent;
  const ready = commerceReady && variantSignatureReady;

  process.stdout.write(`${JSON.stringify({
    ok: ready,
    mode: 'read_only_catalog_commerce_readiness',
    database,
    product_count: Number(product_count),
    variant_count: Number(signatureStats.variant_count),
    invalid_signature_count: invalidSignatureCount,
    min_signature_length: signatureStats.min_signature_length === null ? null : Number(signatureStats.min_signature_length),
    max_signature_length: signatureStats.max_signature_length === null ? null : Number(signatureStats.max_signature_length),
    signature_guard_trigger_present: triggerPresent,
    signature_normalizer_present: normalizerPresent,
    commerce_promotions_table_present: promotionsTablePresent,
    commerce_promotions_tenant_policy_present: promotionsTenantPolicyPresent,
    merchant_country_code_column_present: Boolean(commerceSchema.country_code_column_present),
    merchant_timezone_column_present: Boolean(commerceSchema.timezone_column_present),
    merchant_currency_code_column_present: Boolean(commerceSchema.currency_code_column_present),
    merchant_count: commerceColumnsReady ? Number(merchantRegionalStats.merchant_count) : null,
    invalid_merchant_country_count: invalidCountryCount,
    invalid_merchant_timezone_count: invalidTimezoneCount,
    invalid_merchant_currency_count: invalidCurrencyCount,
    commerce_schema_ready: commerceReady,
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
