import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const imageSource = await readFile(
  new URL('../src/components/catalog/CatalogImageUploadEditor.tsx', import.meta.url),
  'utf8',
);
const authSource = await readFile(
  new URL('../../api-server/src/middleware/authSession.ts', import.meta.url),
  'utf8',
);

test('protected catalog images are fetched through authenticated fetch before img rendering', () => {
  assert.match(imageSource, /function protectedPreviewRequest/);
  assert.match(imageSource, /fetch\(protectedRequest/);
  assert.match(imageSource, /credentials: 'same-origin'/);
  assert.match(imageSource, /URL\.createObjectURL\(blob\)/);
  assert.match(imageSource, /src=\{source\}/);
  assert.doesNotMatch(imageSource, /<img[^>]+src=\{catalogImagePreviewUrl/);
});

test('a lost concurrent rotation race does not clear an already validated browser session', () => {
  const rotationStart = authSource.indexOf('if (validated.needsRotation)');
  const nextCall = authSource.indexOf('\n  next();', rotationStart);
  assert.ok(rotationStart >= 0 && nextCall > rotationStart);
  const rotationBlock = authSource.slice(rotationStart, nextCall);

  assert.match(rotationBlock, /rotateSession/);
  assert.match(rotationBlock, /if \(rotated\)/);
  assert.match(rotationBlock, /setAuthSessionCookie/);
  assert.doesNotMatch(rotationBlock, /clearAuthSessionCookie/);
  assert.doesNotMatch(rotationBlock, /SESSION_ROTATION_FAILED/);
});
