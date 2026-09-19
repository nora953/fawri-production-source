import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const routeWrapper = await readFile(
  new URL("../src/pages/dashboard/SavedAnswersPage.ts", import.meta.url),
  "utf8",
);
const compatibilityWrapper = await readFile(
  new URL("../src/pages/dashboard/SavedAnswersPage.tsx", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../src/pages/dashboard/ServerSavedAnswersPage.tsx", import.meta.url),
  "utf8",
);
const serverRoute = await readFile(
  new URL("../../api-server/src/routes/saved-answer-operations.ts", import.meta.url),
  "utf8",
);
const managementRuntime = await readFile(
  new URL("../../api-server/src/services/knowledge/postgresKnowledgeManagementRuntime.ts", import.meta.url),
  "utf8",
);
const knowledgeTypes = await readFile(
  new URL("../../api-server/src/services/knowledge/types.ts", import.meta.url),
  "utf8",
);

test("dashboard routes saved answers to the active canonical server page", () => {
  assert.match(app, /import\("@\/pages\/dashboard\/SavedAnswersPage\.ts"\)/);
  assert.match(routeWrapper, /ServerSavedAnswersPage/);
  assert.match(compatibilityWrapper, /ServerSavedAnswersPage/);
  assert.doesNotMatch(page, /getCurrentMerchant/);
  assert.doesNotMatch(page, /\/api\/saved-answers/);
  assert.match(page, /\/api\/knowledge\/saved-answers/);
});

test("saved answers authority is session-derived and responses are validated", () => {
  assert.match(serverRoute, /router\.use\(requireMerchantSession\)/);
  assert.match(serverRoute, /getMerchantIdFromSession\(res\)/);
  assert.match(page, /credentials:\s*"same-origin"/);
  assert.match(page, /cache:\s*"no-store"/);
  assert.match(page, /body\?\.ok !== true/);
  assert.match(page, /Array\.isArray\(result\.answers\)/);
  assert.match(page, /result\.answers\.every\(isSavedAnswer\)/);
});

test("saved answers never represent authority failure as an empty list", () => {
  assert.match(page, /type LoadStatus = "loading" \| "ready" \| "unavailable"/);
  assert.match(page, /setLoadStatus\("unavailable"\)/);
  assert.match(
    page,
    /const unavailableWithoutData = loadStatus === "unavailable" && answers\.length === 0/,
  );
  assert.match(
    page,
    /loadStatus === "ready" && filtered\.length === 0/,
  );
  assert.match(
    page,
    /const mutationsAllowed =\s*loadStatus === "ready" && !saving && !loadingMore && !searchPending/,
  );
  assert.match(page, /disabled={!mutationsAllowed}/);
});

test("saved answer mutations retain optimistic version protection", () => {
  assert.match(page, /method: editing \? "PATCH" : "POST"/);
  assert.match(page, /expectedVersion: editing\?\.version/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /expectedVersion: answer\.version/);
  assert.match(page, /VERSION_CONFLICT/);
});


test("saved answer category choices match the canonical PostgreSQL enum contract", () => {
  assert.match(page, /const CATEGORY_VALUES = \[/);
  assert.match(knowledgeTypes, /export const SAVED_ANSWER_CATEGORIES = \[/);
  for (const category of [
    "delivery",
    "payment",
    "return_exchange",
    "product",
    "warranty",
    "custom",
  ]) {
    assert.match(page, new RegExp(`"${category}"`));
    assert.match(knowledgeTypes, new RegExp(`"${category}"`));
  }
  assert.match(page, /CATEGORY_VALUES\.includes\(answer\.category as Category\)/);
  assert.match(page, /CATEGORY_VALUES\.map\(\(value\) =>/);
  assert.match(page, /categoryLabels\[answer\.category\]/);
  assert.match(serverRoute, /isSavedAnswerCategory/);
  assert.match(managementRuntime, /isSavedAnswerCategory/);
  assert.doesNotMatch(
    serverRoute,
    /const SAVED_ANSWER_CATEGORIES = new Set/,
    "route must not maintain a second backend category list",
  );
  assert.doesNotMatch(
    managementRuntime,
    /const SAVED_ANSWER_CATEGORIES = new Set/,
    "PostgreSQL runtime must not maintain a second backend category list",
  );
  assert.doesNotMatch(
    page,
    /<Input[^>]*value=\{form\.category\}/,
    "category must not return to an unrestricted text input",
  );
});

test("saved answer writes reject invalid categories instead of silently converting them to custom", () => {
  assert.match(serverRoute, /INVALID_SAVED_ANSWER_CATEGORY/);
  assert.match(serverRoute, /readSavedAnswerCategory/);
  assert.match(managementRuntime, /function inputCategory/);
  assert.match(managementRuntime, /INVALID_SAVED_ANSWER_CATEGORY/);
  assert.doesNotMatch(
    managementRuntime,
    /SAVED_ANSWER_CATEGORIES\.has\(result\) \? result : "custom"/,
  );
});


test("duplicate create and duplicate edit keep drafts while same-record version conflicts load current state", () => {
  assert.match(page, /const currentAnswer = apiError\.current/);
  assert.match(
    page,
    /const sameRecordConflict = Boolean\(editing && currentAnswer\.id === editing\.id\)/,
  );
  assert.match(page, /setEditing\(currentAnswer\)/);
  assert.match(page, /setForm\(\{/);
  assert.match(page, /setNotice\(copy\.conflict\)/);
  assert.match(page, /\} else \{\s*setNotice\(copy\.duplicate\);\s*\}/);
  assert.match(page, /current\.some\(\(item\) => item\.id === currentAnswer\.id\)/);
});


test("saved-answer management pagination keeps records reachable beyond the first 500", () => {
  assert.match(serverRoute, /listMerchantSavedAnswersPage/);
  assert.match(serverRoute, /nextCursor: page\.nextCursor/);
  assert.match(serverRoute, /beforeUpdatedAt/);
  assert.match(serverRoute, /beforeId/);
  assert.match(managementRuntime, /async listSavedAnswersPage/);
  assert.match(managementRuntime, /LIMIT \$6/);
  assert.match(managementRuntime, /result\.rows\.length > limit/);
  assert.match(page, /const \[nextCursor, setNextCursor\]/);
  assert.match(page, /const \[loadingMore, setLoadingMore\]/);
  assert.match(page, /beforeUpdatedAt: nextCursor\.updatedAt/);
  assert.match(page, /beforeId: nextCursor\.id/);
  assert.match(page, /copy\.loadMore/);
  assert.match(page, /copy\.loadingMore/);
  assert.match(page, /!saving && !loadingMore/);
});


test("saved-answer search is server-authoritative across all paged records", () => {
  assert.match(serverRoute, /req\.query\.q/);
  assert.match(serverRoute, /req\.query\.categories/);
  assert.match(serverRoute, /isSavedAnswerCategory/);
  assert.match(managementRuntime, /question_pattern ILIKE \$4 ESCAPE '!'/);
  assert.match(managementRuntime, /answer_text ILIKE \$4 ESCAPE '!'/);
  assert.match(managementRuntime, /category::text = ANY\(\$5::text\[\]\)/);
  assert.match(page, /const \[serverQuery, setServerQuery\]/);
  assert.match(page, /window\.setTimeout/);
  assert.match(page, /params\.set\("q", serverQuery\)/);
  assert.match(page, /params\.set\("categories", searchCategories\.join\(","\)\)/);
  assert.match(page, /categoryLabels\[value\]\.toLowerCase\(\)\.includes\(normalized\)/);
  assert.match(page, /const filtered = answers/);
  assert.doesNotMatch(
    page,
    /const filtered = useMemo/,
    "search must not regress to filtering only the locally loaded pages",
  );
  assert.match(page, /!searchPending/);
});


test("saved-answer conflicts keep active server-search results authoritative", () => {
  assert.match(page, /setLoadStatus\("ready"\);\s*return true/);
  assert.match(page, /setLoadStatus\("unavailable"\);\s*return false/);
  assert.match(page, /const sameRecordConflict = Boolean\(editing && currentAnswer\.id === editing\.id\)/);
  assert.match(page, /if \(serverQuery\) \{\s*const reloaded = await load\(\)/);
  assert.match(
    page,
    /reloaded\s*\? sameRecordConflict\s*\? copy\.conflict\s*:\s*copy\.duplicate\s*:\s*copy\.loadFailed/,
  );
  assert.match(
    page,
    /if \(serverQuery\) \{\s*const reloaded = await load\(\);\s*setNotice\(reloaded \? copy\.conflict : copy\.loadFailed\)/,
  );
});
