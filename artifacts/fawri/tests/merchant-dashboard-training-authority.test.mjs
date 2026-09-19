import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const appSource = await readFile(new URL("src/App.tsx", root), "utf8");
const wrapperSource = await readFile(
  new URL("src/pages/dashboard/TrainingPage.ts", root),
  "utf8",
);
const pageSource = await readFile(
  new URL("src/pages/dashboard/ServerTrainingPage.tsx", root),
  "utf8",
);
const copySource = await readFile(
  new URL(
    "src/lib/translations/features/pages/dashboard/ServerTrainingPage.ts",
    root,
  ),
  "utf8",
);
const knowledgeRouteSource = await readFile(
  new URL("../api-server/src/routes/knowledge-operations.ts", root),
  "utf8",
);
const trainingRouteSource = await readFile(
  new URL("../api-server/src/routes/training-operations.ts", root),
  "utf8",
);

test("dashboard routes training to the active canonical server page", () => {
  assert.match(appSource, /import\("@\/pages\/dashboard\/TrainingPage\.ts"\)/);
  assert.match(wrapperSource, /ServerTrainingPage/);
  assert.doesNotMatch(pageSource, /\/api\/bot-training/);
  assert.match(pageSource, /\/api\/knowledge\/training-requests/);
});

test("training authority is session-derived and response records are validated", () => {
  assert.match(knowledgeRouteSource, /router\.use\(requireMerchantSession\)/);
  assert.match(knowledgeRouteSource, /router\.use\("\/training-requests", trainingOperationsRouter\)/);
  assert.match(trainingRouteSource, /router\.use\(requireMerchantSession\)/);
  assert.match(trainingRouteSource, /getMerchantIdFromSession\(res\)/);
  assert.doesNotMatch(pageSource, /merchantId/);
  assert.match(pageSource, /cache: "no-store"/);
  assert.match(pageSource, /headers: \{ Accept: "application\/json" \}/);
  assert.match(pageSource, /result\.requests\.every\(isTrainingRequest\)/);
  assert.match(pageSource, /Training authority returned an invalid response/);
});

test("training reads are race-safe and never represent authority failure as empty", () => {
  assert.match(pageSource, /type LoadStatus = "loading" \| "ready" \| "unavailable"/);
  assert.match(pageSource, /loadRequestIdRef = useRef\(0\)/);
  assert.match(pageSource, /requestId !== loadRequestIdRef\.current/);
  assert.match(pageSource, /setLoadStatus\("unavailable"\)/);
  assert.match(pageSource, /loadStatus === "ready" && filtered\.length === 0/);
  assert.match(pageSource, /staleData/);
  assert.doesNotMatch(pageSource, /catch[^]*setRequests\(\[\]\)/);
});

test("training mutations fail closed and retain optimistic version protection", () => {
  assert.match(pageSource, /loadStatus === "ready"[^]*savingId === null[^]*!loadingMore[^]*!searchPending/);
  assert.match(pageSource, /if \(!mutationsAllowed\) return/);
  assert.match(pageSource, /expectedVersion: request\.version/);
  assert.match(pageSource, /result\.request[^]*isTrainingRequest/);
  assert.match(pageSource, /apiError\.code === "VERSION_CONFLICT"/);
  assert.match(pageSource, /isTrainingRequest\(apiError\.current\)/);
  assert.match(trainingRouteSource, /readExpectedVersion\(req\)/);
});

test("training authority failure copy exists in Arabic, Sorani Kurdish, and English", () => {
  for (const language of ["ar", "ku", "en"]) {
    assert.match(copySource, new RegExp(`${language}: \\{`));
  }
  assert.match(copySource, /unavailableTitle/);
  assert.match(copySource, /unavailableBody/);
  assert.match(copySource, /staleBody/);
  assert.match(copySource, /retry/);
});


test("training management search and pagination are server-authoritative", () => {
  assert.match(pageSource, /const \[serverQuery, setServerQuery\]/);
  assert.match(pageSource, /const \[nextCursor, setNextCursor\]/);
  assert.match(pageSource, /const \[loadingMore, setLoadingMore\]/);
  assert.match(pageSource, /params\.set\("q", serverQuery\)/);
  assert.match(pageSource, /params\.set\("status", filter\)/);
  assert.match(pageSource, /beforeUpdatedAt: nextCursor\.updatedAt/);
  assert.match(pageSource, /beforeId: nextCursor\.id/);
  assert.match(pageSource, /copy\.loadMore/);
  assert.match(pageSource, /copy\.loadingMore/);
  assert.doesNotMatch(pageSource, /requests\.filter\(/);

  assert.match(trainingRouteSource, /listMerchantTrainingRequestsPage/);
  assert.match(trainingRouteSource, /INVALID_TRAINING_REQUEST_PAGE/);
  assert.match(trainingRouteSource, /nextCursor: page\.nextCursor/);
  assert.match(trainingRouteSource, /req\.query\.q/);
  assert.match(trainingRouteSource, /req\.query\.status/);
});
