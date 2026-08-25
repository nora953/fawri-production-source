import { spawnSync } from 'node:child_process';

const steps = [
  {
    label: 'Catalog editor logic tests',
    command: 'pnpm',
    args: [
      'exec',
      'tsx',
      '--tsconfig',
      'artifacts/fawri/tsconfig.json',
      '--test',
      'artifacts/fawri/tests/product-catalog-ui-cutover.test.ts',
      'artifacts/fawri/tests/catalog-editor-logic-hardening.test.ts',
      'artifacts/fawri/tests/catalog-editor-ux-hardening.test.ts',
      'artifacts/fawri/tests/fawri-language-ui-authority.test.ts',
      'artifacts/fawri/tests/catalog-product-card-layout.test.ts',
    ],
  },
  {
    label: 'Catalog backend runtime tests',
    command: 'pnpm',
    args: [
      'exec',
      'tsx',
      '--test',
      'artifacts/api-server/tests/catalog-inventory.test.ts',
      'artifacts/api-server/tests/bot-catalog-authority.test.ts',
    ],
  },
  {
    label: 'Catalog backend contracts',
    command: 'node',
    args: [
      '--test',
      'artifacts/api-server/tests/catalog-server-contract.test.mjs',
      'artifacts/api-server/tests/catalog-operation-error-classification-static.test.mjs',
      'artifacts/api-server/tests/catalog-variant-signature-guard-static.test.mjs',
      'artifacts/api-server/tests/catalog-variant-signature-apply-guard-static.test.mjs',
    ],
  },
  ...(process.env.DATABASE_URL
    ? [{
        label: 'PostgreSQL catalog readiness (read only)',
        command: 'node',
        args: ['lib/db/scripts/catalog-variant-signature-readiness.mjs'],
      }]
    : []),
  {
    label: 'Fawri typecheck',
    command: 'pnpm',
    args: ['--filter', '@workspace/fawri', 'run', 'typecheck'],
  },
  {
    label: 'API typecheck',
    command: 'pnpm',
    args: ['--filter', '@workspace/api-server', 'run', 'typecheck'],
  },
  {
    label: 'API production build',
    command: 'pnpm',
    args: ['--filter', '@workspace/api-server', 'run', 'build'],
  },
  {
    label: 'Fawri production build',
    command: 'pnpm',
    args: ['--filter', '@workspace/fawri', 'run', 'build'],
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

process.stdout.write('\nCATALOG_EDITOR_VALIDATION_PASS\n');
