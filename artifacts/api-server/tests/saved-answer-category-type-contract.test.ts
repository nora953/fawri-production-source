import assert from "node:assert/strict";
import test from "node:test";

import {
  SAVED_ANSWER_CATEGORIES,
  isSavedAnswerCategory,
} from "../src/services/knowledge/types.ts";

test("saved-answer category contract exposes exactly the PostgreSQL enum values", () => {
  assert.deepEqual([...SAVED_ANSWER_CATEGORIES], [
    "delivery",
    "payment",
    "return_exchange",
    "product",
    "warranty",
    "custom",
  ]);
});

test("saved-answer category guard rejects drift values", () => {
  for (const category of SAVED_ANSWER_CATEGORIES) {
    assert.equal(isSavedAnswerCategory(category), true);
  }
  assert.equal(isSavedAnswerCategory("shipping"), false);
  assert.equal(isSavedAnswerCategory("returns"), false);
  assert.equal(isSavedAnswerCategory(""), false);
  assert.equal(isSavedAnswerCategory(null), false);
});
