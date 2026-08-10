#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, content): p(rel).write_text(content, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel)
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{rel}: expected {count}, found {actual}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))

# Meta worker core: reserve + release must use the same authority switch.
replace(
    "artifacts/api-server/src/services/metaWebhookWorkerCore.ts",
    'import { reserveMerchantAutoReply } from "./merchantReplyEntitlement";\nimport {\n  releaseMerchantAutoReplyReservation,\n  type MerchantReplyReleaseCode,\n} from "./merchantReplyReservationRelease";',
    'import { reserveMerchantAutoReplyAuthoritative } from "./merchantReplyEntitlementAuthority";\nimport {\n  releaseMerchantAutoReplyReservationAuthoritative,\n  type MerchantReplyReleaseCode,\n} from "./merchantReplyReservationReleaseAuthority";',
)
replace(
    "artifacts/api-server/src/services/metaWebhookWorkerCore.ts",
    'function releaseAndSuppress(input: {',
    'async function releaseAndSuppress(input: {',
)
replace(
    "artifacts/api-server/src/services/metaWebhookWorkerCore.ts",
    '}): Record<string, unknown> {\n  const released = releaseMerchantAutoReplyReservation(input.eventId, input.code);',
    '}): Promise<Record<string, unknown>> {\n  const released = await releaseMerchantAutoReplyReservationAuthoritative(\n    input.eventId,\n    input.code,\n  );',
)
replace(
    "artifacts/api-server/src/services/metaWebhookWorkerCore.ts",
    '    reservation = reserveMerchantAutoReply(merchantId, eventId);',
    '    reservation = await reserveMerchantAutoReplyAuthoritative(merchantId, eventId);',
)
# Every releaseAndSuppress call is in async processMetaReplyJob.
text = read("artifacts/api-server/src/services/metaWebhookWorkerCore.ts")
text = text.replace("return releaseAndSuppress({", "return await releaseAndSuppress({")
write("artifacts/api-server/src/services/metaWebhookWorkerCore.ts", text)

# Worker refund path and expired-job reconciliation become async-safe.
replace(
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
    'import { refundMerchantAutoReply } from "./merchantReplyRefund";',
    'import { refundMerchantAutoReplyAuthoritative } from "./merchantReplyRefundAuthority";',
)
replace(
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
    'function processMetaReplyRefundJob(job: DurableJob): Record<string, unknown> {',
    'async function processMetaReplyRefundJob(\n  job: DurableJob,\n): Promise<Record<string, unknown>> {',
)
replace(
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
    '    refund = refundMerchantAutoReply(eventId, "META_REPLY_FAILED");',
    '    refund = await refundMerchantAutoReplyAuthoritative(\n      eventId,\n      "META_REPLY_FAILED",\n    );',
)
replace(
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
    'function reconcileExpiredMetaJob(\n  job: DurableJob,\n  replyTransport: MetaWebhookReplyTransport,\n): ExpiredJobResolution {',
    'async function reconcileExpiredMetaJob(\n  job: DurableJob,\n  replyTransport: MetaWebhookReplyTransport,\n): Promise<ExpiredJobResolution> {',
)
replace(
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
    '      return { action: "complete", result: processMetaReplyRefundJob(job) };',
    '      return { action: "complete", result: await processMetaReplyRefundJob(job) };',
)

# Legacy webhook guard is a second live entitlement consumer. Route it through
# the same fail-closed authority and await the result.
replace(
    "artifacts/api-server/src/middleware/merchantWebhookSubscriptionAccess.ts",
    'import { reserveMerchantAutoReply } from "../services/merchantReplyEntitlement";',
    'import { reserveMerchantAutoReplyAuthoritative } from "../services/merchantReplyEntitlementAuthority";',
)
replace(
    "artifacts/api-server/src/middleware/merchantWebhookSubscriptionAccess.ts",
    'export function enforceMerchantWebhookSubscriptionAccess(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): void {',
    'export async function enforceMerchantWebhookSubscriptionAccess(\n  req: Request,\n  res: Response,\n  next: NextFunction,\n): Promise<void> {',
)
replace(
    "artifacts/api-server/src/middleware/merchantWebhookSubscriptionAccess.ts",
    '        const decision = reserveMerchantAutoReply(merchantId, eventId);',
    '        const decision = await reserveMerchantAutoReplyAuthoritative(\n          merchantId,\n          eventId,\n        );',
)

print("subscription entitlement PG wiring patch applied")
