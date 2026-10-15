import assert from "node:assert/strict";
import test from "node:test";
import {
  configureMetaAudioUnderstandingService,
  getMetaAudioUnderstandingService,
  releaseMetaAudioUnderstandingService,
  resetMetaAudioUnderstandingServiceForTests,
} from "../src/services/metaAudioUnderstandingRuntime.js";

test("audio runtime owns one configured service and releases only the same instance", () => {
  resetMetaAudioUnderstandingServiceForTests();
  const service = {
    understand: async () => null,
  };

  configureMetaAudioUnderstandingService(service);
  assert.equal(getMetaAudioUnderstandingService(), service);
  assert.throws(() => configureMetaAudioUnderstandingService(service));
  assert.equal(releaseMetaAudioUnderstandingService({ understand: async () => null }), false);
  assert.equal(releaseMetaAudioUnderstandingService(service), true);
  assert.equal(getMetaAudioUnderstandingService(), null);
});
