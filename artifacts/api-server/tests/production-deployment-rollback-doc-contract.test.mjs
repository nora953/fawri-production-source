import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const policy = fs.readFileSync(path.join(root, 'docs/production-deployment-rollback.md'), 'utf8');

test('production rollback policy keeps database recovery fail-safe and provider-neutral', () => {
  assert.match(policy, /forward-only by default/i);
  assert.match(policy, /Do not run destructive automatic down-migrations/i);
  assert.match(policy, /expand\/contract/i);
  assert.match(policy, /previous application version is demonstrably compatible/i);
  assert.match(policy, /stop affected writes/i);
  assert.match(policy, /point-in-time recovery/i);
  assert.match(policy, /RPO and RTO are deployment decisions/i);
  assert.match(policy, /does \*\*not\*\* prove that production backups/i);
});
