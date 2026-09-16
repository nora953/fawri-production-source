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
    /const mutationsAllowed = loadStatus === "ready" && !saving/,
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
