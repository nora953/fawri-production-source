import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const controller = path.join(
  root,
  "artifacts",
  "fawri",
  "src",
  "pages",
  "admin",
  "useAdminPageController.tsx",
);

test("retired legacy subscription migration is terminal on 410", () => {
  const source = fs.readFileSync(controller, "utf8");
  assert.match(source, /fetch\("\/api\/auth\/admin\/subscriptions\/migrate"/);
  assert.match(source, /response\.status === 410/);
  assert.match(
    source,
    /localStorage\.setItem\(migrationKey, "done"\);[\s\S]*?return;/,
  );
});
