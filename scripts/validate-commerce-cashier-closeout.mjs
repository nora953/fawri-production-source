import { spawnSync } from 'node:child_process';

const steps = [
  {
    label: 'Cashier sales, pricing and manual discount runtime tests',
    command: 'pnpm',
    args: [
      'exec',
      'tsx',
      '--tsconfig',
      'artifacts/fawri/tsconfig.json',
      '--test',
      'artifacts/fawri/tests/cashier-sales-report-runtime.test.ts',
      'artifacts/fawri/tests/cashier-sales-report-corruption.test.ts',
      'artifacts/fawri/tests/cashier-sale-pricing-duplicate-lines.test.ts',
      'artifacts/fawri/tests/cashier-manual-discount-runtime.test.ts',
    ],
  },
  {
    label: 'Merchant money and cashier refresh UX tests',
    command: 'pnpm',
    args: [
      'exec',
      'tsx',
      '--tsconfig',
      'artifacts/fawri/tsconfig.json',
      '--test',
      'artifacts/fawri/tests/merchant-money-ui.test.ts',
      'artifacts/fawri/tests/cashier-refresh-ux-contract.test.mjs',
      'artifacts/fawri/tests/catalog-measurement-alignment-contract.test.mjs',
    ],
  },
  {
    label: 'Cashier reporting cost, discount policy runtime and disclosure tests',
    command: 'pnpm',
    args: [
      'exec',
      'tsx',
      '--test',
      'artifacts/api-server/tests/cashier-reporting-cost-runtime.test.ts',
      'artifacts/api-server/tests/cashier-discount-policy-runtime.test.ts',
      'artifacts/api-server/tests/catalog-reporting-cost-postgres-guard.test.ts',
      'artifacts/api-server/tests/postgres-catalog-reporting-cost-disclosure.test.ts',
      'artifacts/api-server/tests/catalog-commerce-metadata.test.ts',
    ],
  },
  {
    label: 'Cashier reporting, sync and manager override contracts',
    command: 'node',
    args: [
      '--test',
      'artifacts/api-server/tests/cashier-reporting-cost-contract.test.mjs',
      'artifacts/api-server/tests/cashier-sync-contract.test.mjs',
      'artifacts/api-server/tests/cashier-compensation-sync-contract.test.mjs',
      'artifacts/api-server/tests/cashier-order-separation-contract.test.mjs',
      'artifacts/api-server/tests/cashier-http-route-reachability.test.mjs',
      'artifacts/api-server/tests/cashier-discount-override-authority.test.mjs',
      'artifacts/fawri/tests/cashier-manager-override-checkout.test.mjs',
    ],
  },
  {
    label: 'Store currency validation gate',
    command: 'node',
    args: ['scripts/validate-store-currency.mjs'],
  },
  {
    label: 'Catalog editor and production build gate',
    command: 'node',
    args: ['scripts/validate-catalog-editor.mjs'],
  },
];

for (const step of steps) {
  process.stdout.write(`\n=== ${step.label} ===\n`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`\nFAILED: ${step.label}\n`);
    process.exit(result.status || 1);
  }
}

process.stdout.write('\nCOMMERCE_CASHIER_CLOSEOUT_VALIDATION_PASS\n');
