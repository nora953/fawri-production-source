import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const overview = read("../src/pages/dashboard/OverviewPage.tsx");
const channelsEntry = read("../src/pages/dashboard/ChannelsPage.tsx");
const serverChannels = read("../src/pages/dashboard/ServerChannelsPage.tsx");
const landing = read("../src/pages/LandingPage.tsx");
const landingTruthCopy = read("../src/lib/translations/features/pages/LandingPage.ts");

test("overview metrics come from independent server authorities", () => {
  assert.match(overview, /Promise\.allSettled/);
  assert.match(overview, /loadServerCount\('\/api\/conversations'\)/);
  assert.match(overview, /loadServerCount\('\/api\/orders'\)/);
  assert.match(overview, /loadServerCount\('\/api\/catalog\/products'\)/);
  assert.doesNotMatch(overview, /\bgetConversations\b/);
  assert.doesNotMatch(overview, /\bgetOrders\b/);
  assert.doesNotMatch(overview, /\bgetProducts\b/);
  assert.match(overview, /status: 'unavailable'/);
  assert.match(overview, /Unavailable/);
  assert.match(overview, /غير متاح/);
  assert.match(overview, /بەردەست نییە/);
});

test("channels use server state and versioned canonical disconnect", () => {
  assert.match(channelsEntry, /ServerChannelsPage/);
  assert.doesNotMatch(channelsEntry, /\/api\/meta\/login/);
  assert.doesNotMatch(channelsEntry, /localStorage/);

  assert.match(serverChannels, /fetch\("\/api\/channels"/);
  assert.match(serverChannels, /\/api\/channels\/meta\/\$\{encodeURIComponent\(channel\.platform\)\}\/\$\{encodeURIComponent\(channel\.page_id\)\}\/disconnect/);
  assert.match(serverChannels, /expected_version:\s*channel\.connection_version/);
  assert.match(serverChannels, /response\.status === 409/);
  assert.match(serverChannels, /channel\.status === "active"/);
  assert.match(serverChannels, /activation_pending/);
  assert.doesNotMatch(serverChannels, /\/api\/meta\/login/);
  assert.doesNotMatch(serverChannels, /localStorage/);
});

test("landing does not advertise unavailable Meta or Android activation", () => {
  const pendingStatuses = landing.match(/status: 'activation_pending'/g) || [];
  assert.ok(pendingStatuses.length >= 2, "Instagram and Messenger must both be activation pending");
  assert.doesNotMatch(landing, /href=["']#["']/);
  assert.doesNotMatch(landing, /t\.download_now/);
  assert.match(landing, /truth\.activationPending/);
  assert.match(landing, /truth\.inDevelopment/);

  assert.match(landingTruthCopy, /Activation pending/);
  assert.match(landingTruthCopy, /التفعيل قيد الانتظار/);
  assert.match(landingTruthCopy, /چالاککردن چاوەڕوانە/);
  assert.match(landingTruthCopy, /In development/);
  assert.match(landingTruthCopy, /قيد التطوير/);
  assert.match(landingTruthCopy, /لە ژێر پەرەپێدان/);
});
