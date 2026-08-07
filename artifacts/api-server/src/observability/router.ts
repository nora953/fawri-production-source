import { Router, type Request, type Response } from "express";
import { createHealthSnapshot, type HealthOptions } from "./health";
import { MetricsRegistry } from "./metrics";
import { createReadinessSnapshot } from "./readiness";
import type { ReadinessCheck } from "./types";

export type ObservabilityRouterOptions = HealthOptions & {
  readinessChecks: readonly ReadinessCheck[];
  metrics: MetricsRegistry;
};

export function createObservabilityRouter(options: ObservabilityRouterOptions): Router {
  const router = Router();

  router.get("/health", (_request: Request, response: Response) => {
    response.status(200).json(createHealthSnapshot(options));
  });

  router.get("/readiness", async (_request: Request, response: Response) => {
    const snapshot = await createReadinessSnapshot(options.readinessChecks, options.now);
    response.status(snapshot.status === "ready" ? 200 : 503).json(snapshot);
  });

  router.get("/metrics", (_request: Request, response: Response) => {
    response
      .status(200)
      .type("text/plain; version=0.0.4; charset=utf-8")
      .send(options.metrics.toPrometheusText());
  });

  return router;
}
