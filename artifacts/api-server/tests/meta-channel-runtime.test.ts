import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  completeMetaChannelDisconnect,
  connectMetaChannel,
  listMetaChannels,
  readMetaChannelCredential,
  requestMetaChannelDisconnect,
} from "../src/services/metaChannelRuntime";
import type { MetaCredentialKeyProvider } from "../src/services/metaCredentialVault";

const key = { id: "test-key", key: crypto.randomBytes(32) };
const keyProvider: MetaCredentialKeyProvider = {
  current: () => key,
  resolve: (id) => (id === key.id ? key : null),
};

test("Meta channel lifecycle is tenant-scoped and tokens never appear in summaries", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fawri-meta-channel-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  try {
    const connected = connectMetaChannel({
      merchantId: "merchant-1",
      platform: "messenger",
      pageId: "page-1",
      pageName: "Page One",
      accessToken: "private-token",
      webhookSubscribed: true,
      keyProvider,
      now: new Date("2026-08-07T00:00:00.000Z"),
    });
    assert.equal(connected.status, "active");
    assert.equal(connected.credential_configured, true);
    assert.equal(JSON.stringify(connected).includes("private-token"), false);
    assert.equal(listMetaChannels("merchant-2").length, 0);
    assert.equal(
      readMetaChannelCredential({
        merchantId: "merchant-1",
        platform: "messenger",
        pageId: "page-1",
        keyProvider,
      }),
      "private-token",
    );

    assert.throws(() =>
      requestMetaChannelDisconnect({
        merchantId: "merchant-1",
        platform: "messenger",
        pageId: "page-1",
        expectedVersion: connected.connection_version + 1,
      }),
    );
    const disconnecting = requestMetaChannelDisconnect({
      merchantId: "merchant-1",
      platform: "messenger",
      pageId: "page-1",
      expectedVersion: connected.connection_version,
    });
    assert.equal(disconnecting.status, "disconnecting");
    const disconnected = completeMetaChannelDisconnect({
      merchantId: "merchant-1",
      platform: "messenger",
      pageId: "page-1",
    });
    assert.equal(disconnected.status, "disconnected");
    assert.equal(disconnected.credential_configured, false);

    const stored = await readFile(path.join(directory, "meta-channels.json"), "utf8");
    assert.equal(stored.includes("private-token"), false);
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
