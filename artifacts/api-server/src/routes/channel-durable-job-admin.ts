import { Router, type NextFunction, type Request, type Response } from "express";
import {
  listDurableJobSummaries,
  requeueDeadLetterJob,
  type DurableJobStatus,
} from "../services/durableJobQueue";

export type ChannelDurableJobAdminAuthorize = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

const statuses = new Set<DurableJobStatus>([
  "queued",
  "processing",
  "retry",
  "completed",
  "dead_letter",
]);

/**
 * The integration coordinator must bind this factory to the existing
 * `view_logs`/`manage_channels` admin authorization middleware.
 */
export function createChannelDurableJobAdminRouter(
  authorize: ChannelDurableJobAdminAuthorize,
): Router {
  const router = Router();

  router.get("/admin/background-jobs", authorize, (req: Request, res: Response) => {
    const requested = String(req.query.status || "").trim();
    const status = statuses.has(requested as DurableJobStatus)
      ? (requested as DurableJobStatus)
      : undefined;
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(500, requestedLimit))
      : 100;

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      jobs: listDurableJobSummaries(status).slice(0, limit),
      payloads_included: false,
    });
  });

  router.post("/admin/background-jobs/:jobId/requeue", authorize, (req: Request, res: Response) => {
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) {
      return res.status(400).json({
        ok: false,
        code: "DURABLE_JOB_ID_REQUIRED",
        error: "durable job ID is required",
      });
    }
    try {
      const job = requeueDeadLetterJob(jobId);
      return res.json({
        ok: true,
        job: listDurableJobSummaries().find((item) => item.id === job.id),
        payloads_included: false,
      });
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException).code || "").trim();
      return res.status(code === "DURABLE_JOB_REQUEUE_BLOCKED" ? 409 : 400).json({
        ok: false,
        code: code || "DURABLE_JOB_REQUEUE_FAILED",
        error:
          code === "DURABLE_JOB_REQUEUE_BLOCKED"
            ? "dead-letter outcome is uncertain and cannot be requeued safely"
            : "durable job could not be requeued",
      });
    }
  });

  return router;
}
