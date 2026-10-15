import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helperSource = await readFile(
  new URL('../src/lib/internationalPhone.ts', import.meta.url),
  'utf8',
);
const fieldSource = await readFile(
  new URL('../src/components/InternationalPhoneField.tsx', import.meta.url),
  'utf8',
);
const signupSource = await readFile(
  new URL('../src/pages/SignupPage.tsx', import.meta.url),
  'utf8',
);

test('international phone input UI caps typed digits at 15', () => {
  assert.match(helperSource, /digits\.length <= 15/);
  assert.match(helperSource, /let remaining = 15/);
  assert.doesNotMatch(helperSource, /15 - callingCodeDigits\.length/);
});

test('shared international phone field applies the 15-digit input limiter', () => {
  assert.match(
    fieldSource,
    /limitInternationalPhoneInput\(event\.target\.value\)/,
  );
});


test('signup requests equal phone columns', async () => {
  const signupSource = await readFile(
    new URL('../src/pages/SignupPage.tsx', import.meta.url),
    'utf8',
  );
  assert.match(signupSource, /phoneError={phoneInlineError}\s+equalColumns/);
});
