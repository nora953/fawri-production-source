import assert from "node:assert/strict";
import test from "node:test";
import { requireNotificationSourceReference } from "../src/services/postgresNotificationSourceReference";

test("FIELD002-R2 requires both new notification source reference fields", () => {
  assert.deepEqual(requireNotificationSourceReference("subscription", "sub-1"), {
    sourceEntityType: "subscription", sourceEntityId: "sub-1",
  });
  assert.deepEqual(requireNotificationSourceReference(" subscription ", " sub-1 "), {
    sourceEntityType: "subscription", sourceEntityId: "sub-1",
  });
  for (const [type, id] of [
    [undefined, undefined], [null, "sub-1"], ["subscription", null],
    ["", "sub-1"], ["subscription", ""], ["  ", "sub-1"],
    ["subscription", "  "], [2, "sub-1"], ["subscription", 2],
  ]) {
    assert.throws(() => requireNotificationSourceReference(type, id), (error: unknown) =>
      error instanceof Error &&
      (error as Error & { code?: string }).code === "NOTIFICATION_SOURCE_REFERENCE_REQUIRED",
    );
  }
});
