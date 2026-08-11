import { logger } from "./lib/logger";
import { getFawriDataDir } from "./lib/dataPaths";
import type { DurableJobWorker } from "./services/durableJobQueue";
import { assertProductionRuntimeConfiguration } from "./services/productionReleaseReadiness";
import { bootstrapRuntimeAndLoadApplication } from "./services/runtimeProviderBootstrap";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function safeStartupErrorCode(error: unknown): string {
  const raw =
    error && typeof error === "object"
      ? String((error as { code?: unknown }).code || "").trim()
      : "";
  return /^[A-Z][A-Z0-9_]{2,159}$/.test(raw)
    ? raw
    : "RUNTIME_PROVIDER_INITIALIZATION_FAILED";
}

async function main(): Promise<void> {
  // The release gate is opt-in until the production environment is populated.
  // Once FAWRI_PRODUCTION_RELEASE_GATE=required is set, startup fails closed
  // before any provider bootstrap, listener, worker, or application traffic.
  assertProductionRuntimeConfiguration(process.env);

  const { application, runtime } = await bootstrapRuntimeAndLoadApplication({
    loadApplication: async () => {
      const [{ default: app }, { startMetaWebhookWorker }] = await Promise.all([
        import("./app"),
        import("./services/metaWebhookWorker"),
      ]);
      return { app, startMetaWebhookWorker };
    },
  });
  const { app, startMetaWebhookWorker } = application;

  let metaWebhookWorker: DurableJobWorker | null = null;
  let shuttingDown = false;

  const server = app.listen(port, () => {
    logger.info({ port, dataDir: getFawriDataDir() }, "Server listening");

    const workersExplicitlyDisabled = process.env.FAWRI_DISABLE_JOB_WORKERS === "1";
    const metaCutoverReady = process.env.FAWRI_META_CUTOVER_READY === "1";

    if (!workersExplicitlyDisabled && metaCutoverReady) {
      try {
        metaWebhookWorker = startMetaWebhookWorker(port);
        logger.info("Meta webhook durable worker started");
      } catch (error) {
        logger.fatal({ err: error }, "Meta webhook durable worker failed to start");
        runtime.dispose();
        server.close(() => process.exit(1));
      }
    } else if (workersExplicitlyDisabled) {
      logger.warn("Background job workers are disabled by configuration");
    } else {
      logger.warn(
        "Meta webhook worker is activation-gated until encrypted OAuth/send-path and PostgreSQL cutover are complete",
      );
    }
  });

  server.on("error", (error) => {
    runtime.dispose();
    logger.fatal({ err: error, port }, "Error listening on port");
    process.exit(1);
  });

  function shutdown(signal: NodeJS.Signals): void {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down API server");
    metaWebhookWorker?.stop();
    runtime.dispose();

    const forcedExit = setTimeout(() => {
      logger.error({ signal }, "Forced API server shutdown after timeout");
      process.exit(1);
    }, 10_000);
    forcedExit.unref();

    server.close((error) => {
      clearTimeout(forcedExit);
      if (error) {
        logger.error({ err: error, signal }, "API server shutdown failed");
        process.exit(1);
      }
      logger.info({ signal }, "API server stopped");
      process.exit(0);
    });
  }

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

void main().catch((error) => {
  logger.fatal(
    { code: safeStartupErrorCode(error) },
    "Production runtime provider bootstrap failed",
  );
  process.exit(1);
});
