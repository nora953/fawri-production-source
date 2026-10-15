import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/pages/SignupPage.tsx', import.meta.url),
  'utf8',
);

test('signup activity and currency selects share the approved country-chevron geometry', () => {
  assert.match(source, /const signupSelectClass = `\$\{fieldInputClass\} w-full appearance-none/);
  assert.match(source, /bg-\[length:14px_14px\]/);
  assert.match(source, /rtl:bg-\[position:left_0\.65rem_center\]/);
  assert.match(source, /ltr:bg-\[position:right_0\.65rem_center\]/);
  assert.match(source, /width='14' height='14'/);
  assert.match(source, /stroke-width='2\.2'/);

  assert.match(
    source,
    /SelectTrigger className=\{`\$\{signupSelectClass\} !h-12 \[&>svg\]:hidden`\} style=\{signupSelectChevronStyle\} data-testid="select-activity"/,
  );
  assert.match(
    source,
    /className=\{signupSelectClass\}\s+style=\{signupSelectChevronStyle\}\s+data-testid="select-currency"/,
  );
});

test('signup activity select explicitly overrides the shared Radix h-9 trigger height', () => {
  assert.match(
    source,
    /data-testid="select-activity"/,
  );
  assert.match(
    source,
    /signupSelectClass\} !h-12/,
  );
});
