import { spawnSync } from 'node:child_process';

const steps = [
  {
    label: 'Store currency runtime and commerce delivery tests',
    command: 'pnpm',
    args: [
      'exec',
      'tsx',
      '--test',
      '--test-concurrency=1',
      'artifacts/api-server/tests/currency-money-runtime.test.ts',
      'artifacts/api-server/tests/catalog-fact-currency-formatting.test.ts',
      'artifacts/api-server/tests/postgres-catalog-fact-disclosure.test.ts',
      'artifacts/api-server/tests/commerce-delivery-pricing.test.ts',
      'artifacts/api-server/tests/delivery-fee-per-area.test.ts',
      'artifacts/api-server/tests/knowledge-delivery-area-rates.test.ts',
      'artifacts/api-server/tests/knowledge-postgres-operational-facts.test.ts',
      'artifacts/api-server/tests/knowledge-multilocation-stock-routing.test.ts',
      'artifacts/api-server/tests/merchant-regional-runtime.test.ts',
      'artifacts/fawri/tests/merchant-currency-options.test.ts',
    ],
  },
  {
    label: 'Store currency delivery and UI authority contracts',
    command: 'node',
    args: [
      '--test',
      'artifacts/api-server/tests/delivery-order-authority-static.test.mjs',
      'artifacts/api-server/tests/orders-settings-static-contract.test.mjs',
    ],
  },
];

for (const step of steps) {
  process.stdout.write(`\n=== ${step.label} ===\n`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`\nFAILED: ${step.label}\n`);
    process.exit(result.status || 1);
  }
}

process.stdout.write('\nSTORE_CURRENCY_VALIDATION_PASS\n');
