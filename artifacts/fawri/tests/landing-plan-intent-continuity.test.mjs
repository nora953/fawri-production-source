import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("pricing CTAs carry exact requested plan while generic CTAs remain generic", async () => {
  const landing = await source("src/pages/LandingPage.tsx");
  assert.match(landing, /id: 'silver'/);
  assert.match(landing, /id: 'gold'/);
  assert.match(landing, /id: 'diamond'/);
  assert.match(landing, /href=\{`\/signup\?plan=\$\{plan\.id\}`\}/);
  assert.ok((landing.match(/href="\/signup"/g) || []).length >= 2);
});

test("signup accepts only canonical query plans and sends no invented generic plan", async () => {
  const signup = await source("src/pages/SignupPage.tsx");
  assert.match(signup, /type RequestedPlan = 'silver' \| 'gold' \| 'diamond'/);
  assert.match(signup, /new URLSearchParams\(search\)\.get\('plan'\)/);
  assert.match(signup, /plan === 'silver' \|\| plan === 'gold' \|\| plan === 'diamond' \? plan : null/);
  assert.match(signup, /\.\.\.\(requestedPlan \? \{ requested_plan: requestedPlan \} : \{\}\)/);
  assert.match(signup, /data-testid="requested-plan"/);
  assert.doesNotMatch(signup, /localStorage[^\n]*requested[_-]?plan/i);
});
