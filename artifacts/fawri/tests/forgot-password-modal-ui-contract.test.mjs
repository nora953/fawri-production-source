import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/components/ForgotPasswordModal.tsx', import.meta.url),
  'utf8',
);

test('password reset step stays compact without an internal scrolling modal', () => {
  assert.match(
    source,
    /step === 'reset' \? 'py-3' : 'py-5'/,
  );
  assert.match(
    source,
    /step === 'reset' \? 'space-y-3 py-3' : 'space-y-5 py-5'/,
  );
  assert.doesNotMatch(source, /overflow-y-auto/);
});

test('password recovery phone stays ASCII-preserved and LTR in every locale', () => {
  assert.match(
    source,
    /dir="ltr"\s+data-fawri-preserve-digits="true"/,
  );
  assert.match(source, /tabular-nums/);
});
