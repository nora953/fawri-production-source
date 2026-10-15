import { Router, type Request, type Response } from "express";
import { createHealthSnapshot, type HealthOptions } from "./health";
import { MetricsRegistry } from "./metrics";
import { createReadinessSnapshot } from "./readiness";
import type { ReadinessCheck } from "./types";

export type ObservabilityRouterOptions = HealthOptions & {
  readinessChecks: readonly ReadinessCheck[];
  metrics: MetricsRegistry;
  allowMetrics?: (request: Request) => boolean;
};

function setProbeHeaders(response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

export function createObservabilityRouter(options: ObservabilityRouterOptions): Router {
  const router = Router();

  router.get("/health", (_request: Request, response: Response) => {
    setProbeHeaders(response);
    try {
      const snapshot = createHealthSnapshot(options);
      response.status(snapshot.status === "ok" ? 200 : 503).json(snapshot);
    } catch {
      response.status(503).json({ status: "unhealthy" });
    }
  });

  router.get("/readiness", async (_request: Request, response: Response) => {
    setProbeHeaders(response);
    try {
      const snapshot = await createReadinessSnapshot(options.readinessChecks, options.now);
      response.status(snapshot.status === "ready" ? 200 : 503).json(snapshot);
    } catch {
      response.status(503).json({ status: "not_ready", checks: [] });
    }
  });

  router.get("/metrics", (request: Request, response: Response) => {
    setProbeHeaders(response);
    try {
      if (!options.allowMetrics?.(request)) {
        response.status(503).type("text/plain; version=0.0.4; charset=utf-8").send("");
        return;
      }
      response
        .status(200)
        .type("text/plain; version=0.0.4; charset=utf-8")
        .send(options.metrics.toPrometheusText());
    } catch {
      response.status(503).type("text/plain; version=0.0.4; charset=utf-8").send("");
    }
  });

  return router;
}
