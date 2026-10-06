import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = name => fs.readFileSync(new URL(`../src/components/${name}`, import.meta.url), "utf8");

for (const name of ["ChangePasswordModal.tsx", "ForgotPasswordModal.tsx"]) {
  test(`${name} uses the shared accessible dialog primitive`, () => {
    const source = read(name);
    assert.match(source, /<Dialog open=\{open\}/);
    assert.match(source, /<DialogContent/);
    assert.match(source, /<DialogTitle/);
    assert.match(source, /<DialogDescription/);
    assert.match(source, /onEscapeKeyDown=/);
    assert.match(source, /onPointerDownOutside=/);
  });
}

test("password recovery relies on the shared dialog close control", () => {
  const source = read("ForgotPasswordModal.tsx");
  assert.doesNotMatch(source, /import \{ X,/);
  assert.doesNotMatch(source, /aria-label=\{t\.forgot_close\}/);
});
