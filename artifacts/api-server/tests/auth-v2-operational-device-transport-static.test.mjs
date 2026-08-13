import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("Auth v2 browser transport sends the stable device id to every same-origin API request", async () => {
  const source = await read("../fawri/src/lib/authClientCutover.ts");

  assert.match(
    source,
    /!url\.pathname\.startsWith\('\/api\/'\)/,
    "the cutover boundary must continue to scope credential transport to same-origin API requests",
  );
  assert.match(
    source,
    /headers\.set\('X-Fawri-Device-Id', getStableAuthDeviceId\(\)\);/,
    "same-origin API requests must carry the stable Auth v2 device id",
  );
  assert.doesNotMatch(
    source,
    /if \(url\.pathname\.startsWith\('\/api\/auth'\)\)\s*\{\s*headers\.set\('X-Fawri-Device-Id'/,
    "device-bound Auth v2 validation also protects operational routes outside /api/auth",
  );
});

test("merchant realtime SSE uses the Auth v2 fetch transport instead of native EventSource", async () => {
  const source = await read("../fawri/src/hooks/useMerchantRealtime.ts");

  assert.match(
    source,
    /fetch\('\/api\/auth\/events'/,
    "merchant realtime must flow through the wrapped same-origin fetch boundary",
  );
  assert.match(
    source,
    /Accept:\s*'text\/event-stream'/,
    "merchant realtime must keep the SSE media type",
  );
  assert.doesNotMatch(
    source,
    /new EventSource\(/,
    "native EventSource cannot carry the device header required by device-bound Auth v2 sessions",
  );
});

test("operational routes remain behind the global Auth v2 compatibility boundary", async () => {
  const app = await read("src/app.ts");
  const compatibilityIndex = app.indexOf("app.use(enforceAuthCutoverCompatibility);");
  const conversationIndex = app.indexOf('app.use("/api", conversationOperationsRouter);');
  const orderIndex = app.indexOf('app.use("/api", orderOperationsRouter);');
  const catalogIndex = app.indexOf('app.use("/api", catalogOperationsRouter);');

  assert.ok(compatibilityIndex >= 0, "Auth v2 compatibility middleware must remain mounted");
  for (const [name, index] of [
    ["conversation", conversationIndex],
    ["order", orderIndex],
    ["catalog", catalogIndex],
  ]) {
    assert.ok(index >= 0, `${name} operational router must remain mounted`);
    assert.ok(
      index > compatibilityIndex,
      `${name} operational routes must remain behind Auth v2 validation`,
    );
  }
});
