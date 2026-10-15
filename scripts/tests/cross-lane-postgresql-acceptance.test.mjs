import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here,"../..");
function disposable(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["localhost","127.0.0.1"].includes(url.hostname) && ["fawri_ci","fawri_complete_ci"].includes(url.pathname.replace(/^\//,""));
  } catch { return false; }
}

test("cross-lane PostgreSQL contracts hold on disposable PostgreSQL", { skip: !disposable(process.env.DATABASE_URL), timeout: 120000 }, () => {
  const result = spawnSync(process.execPath,[path.join(root,"lib","db","scripts","cross-lane-acceptance.mjs")],{
    cwd: root,
    encoding:"utf8",
    env:process.env,
    timeout:110000,
  });
  assert.equal(result.status,0,[result.stdout,result.stderr].filter(Boolean).join("\n"));
  const lines = String(result.stdout||"").trim().split(/\r?\n/).filter(Boolean);
  const report = JSON.parse(lines.at(-1));
  assert.equal(report.ok,true);
  assert.equal(report.production_contacted,false);
});
