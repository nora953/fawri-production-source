import fs from "node:fs";
import path from "node:path";

const outputDirectory = path.resolve(process.argv[2] || "");
if (!process.argv[2]) {
  throw new Error("fixture output directory is required");
}
fs.mkdirSync(outputDirectory, { recursive: true });

function writeJson(fileName, value) {
  fs.writeFileSync(
    path.join(outputDirectory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

writeJson("fawri-runtime-db.json", {
  productsByMerchant: {},
  conversationsByMerchant: {},
  metaPagesByPageId: {
    "page-1": {
      page_id: "page-1",
      page_name: "Merchant Page",
      merchant_id: "merchant-1",
      platform: "messenger",
      status: "connected",
      connected_at: "2026-08-01T00:00:00.000Z",
    },
  },
  ordersByMerchant: {},
  orderDraftsByConversation: {},
  lastSyncedMerchantId: null,
});

writeJson("processed-meta-events.json", { events: {} });
writeJson("reply-reservations.json", { reservations: {} });
writeJson("background-jobs.json", { version: 1, jobs: [] });
writeJson("manual-conversation-operations.json", {
  version: 1,
  conversations: {},
});

process.stdout.write(`${outputDirectory}\n`);
