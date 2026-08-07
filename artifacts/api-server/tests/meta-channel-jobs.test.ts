import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createMetaChannelDisconnectHandler } from "../src/services/metaChannelJobs";
import { connectMetaChannel, listMetaChannels } from "../src/services/metaChannelRuntime";
import type { DurableJob } from "../src/services/durableJobQueue";
import type { MetaCredentialKeyProvider } from "../src/services/metaCredentialVault";

const key = { id: "test-key", key: crypto.randomBytes(32) };
const keyProvider: MetaCredentialKeyProvider = {
  current: () => key,
  resolve: (id) => (id === key.id ? key : null),
};

function job(): DurableJob {
  return {
    id: "job-1",
    type: "meta.channel.disconnect",
    dedupe_key: "disconnect-1",
    merchant_id: "merchant-1",
    payload: {
      merchant_id: "merchant-1",
      platform: "messenger",
      page_id: "page-1",
    },
    priority: 1,
    status: "processing",
    attempts: 1,
    max_attempts: 5,
    available_at: "2026-08-07T00:00:00.000Z",
    created_at: "2026-08-07T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
  };
}

test("channel disconnect uses an injected fake Meta transport and never exposes the token", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fawri-meta-job-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  try {
    connectMetaChannel({
      merchantId: "merchant-1",
      platform: "messenger",
      pageId: "page-1",
      pageName: "Page One",
      accessToken: "private-token",
      webhookSubscribed: true,
      keyProvider,
    });

    let authorization = "";
    const handler = createMetaChannelDisconnectHandler({
      keyProvider,
      fetchImpl: async (_input, init) => {
        authorization = String((init?.headers as Record<string, string>)?.Authorization || "");
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    const result = await handler(job());
    assert.equal(authorization, "Bearer private-token");
    assert.equal(JSON.stringify(result).includes("private-token"), false);
    assert.equal(listMetaChannels("merchant-1")[0].status, "disconnected");
    assert.equal(listMetaChannels("merchant-1")[0].credential_configured, false);
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
