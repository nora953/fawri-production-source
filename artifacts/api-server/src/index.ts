import { logger } from "./lib/logger";
import { getFawriDataDir } from "./lib/dataPaths";
import type { DurableJobWorker } from "./services/durableJobQueue";
import type { EarlyWarningIncidentMonitor } from "./services/earlyWarningIncidentMonitor";
import type { MerchantPhysicalMediaCleanupReconciler } from "./services/merchantPhysicalMediaCleanup";
import { assertProductionRuntimeConfiguration } from "./services/productionReleaseReadiness";
import { assertProductionOwnerAdminReady } from "./services/postgresOwnerAdminProvisioning";
import { assertProductionCashierStreamStorageReady } from "./services/cashierStreamStorageReadiness";
import { assertProductionDatabaseRlsReady } from "./services/postgresRuntimeRlsSecurity";
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

type StartupStage = "runtime_configuration" | "database_rls" | "cashier_storage" | "owner_admin" | "provider_initialization" | "application_import" | "listener";
let startupStage: StartupStage = "runtime_configuration";

async function main(): Promise<void> {
  // Production fails closed before any provider bootstrap, listener, worker,
  // or application traffic. Staging/development must opt out explicitly.
  assertProductionRuntimeConfiguration(process.env);
  startupStage = "database_rls";
  await assertProductionDatabaseRlsReady(process.env);
  startupStage = "cashier_storage";
  await assertProductionCashierStreamStorageReady(process.env);
  startupStage = "owner_admin";
  await assertProductionOwnerAdminReady(process.env);

  startupStage = "provider_initialization";
  const { application, runtime } = await bootstrapRuntimeAndLoadApplication({
    loadApplication: async () => {
      startupStage = "application_import";
      const [
        { default: app },
        { startMetaWebhookWorker },
        { startEarlyWarningIncidentMonitor },
        { startMerchantPhysicalMediaCleanupReconciler },
      ] = await Promise.all([
        import("./app"),
        import("./services/metaWebhookWorker"),
        import("./services/earlyWarningIncidentMonitor"),
        import("./services/merchantPhysicalMediaCleanup"),
      ]);
      return {
        app,
        startMetaWebhookWorker,
        startEarlyWarningIncidentMonitor,
        startMerchantPhysicalMediaCleanupReconciler,
      };
    },
  });
  const {
    app,
    startMetaWebhookWorker,
    startEarlyWarningIncidentMonitor,
    startMerchantPhysicalMediaCleanupReconciler,
  } = application;

  let metaWebhookWorker: DurableJobWorker | null = null;
  let earlyWarningMonitor: EarlyWarningIncidentMonitor | null = null;
  let merchantMediaCleanupReconciler: MerchantPhysicalMediaCleanupReconciler | null = null;
  let shuttingDown = false;

  startupStage = "listener";
  const server = app.listen(port, () => {
    logger.info({ port, dataDir: getFawriDataDir() }, "Server listening");

    try {
      earlyWarningMonitor = startEarlyWarningIncidentMonitor();
      logger.info("Early warning incident monitor started");
    } catch (error) {
      logger.warn(
        { code: safeStartupErrorCode(error) },
        "Early warning incident monitor failed to start",
      );
    }

    const workersExplicitlyDisabled = process.env.FAWRI_DISABLE_JOB_WORKERS === "1";
    const metaCutoverReady = process.env.FAWRI_META_CUTOVER_READY === "1";

    if (!workersExplicitlyDisabled) {
      try {
        merchantMediaCleanupReconciler =
          startMerchantPhysicalMediaCleanupReconciler();
        logger.info("Merchant physical media cleanup reconciler started");
      } catch (error) {
        logger.warn(
          { code: safeStartupErrorCode(error) },
          "Merchant physical media cleanup reconciler failed to start",
        );
      }
    }

    if (!workersExplicitlyDisabled && metaCutoverReady) {
      try {
        metaWebhookWorker = startMetaWebhookWorker(port);
        logger.info("Meta webhook durable worker started");
      } catch (error) {
        logger.fatal({ err: error }, "Meta webhook durable worker failed to start");
        merchantMediaCleanupReconciler?.stop();
        earlyWarningMonitor?.stop();
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
    merchantMediaCleanupReconciler?.stop();
    earlyWarningMonitor?.stop();
    runtime.dispose();
    logger.fatal({ err: error, port }, "Error listening on port");
    process.exit(1);
  });

  function shutdown(signal: NodeJS.Signals): void {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down API server");
    metaWebhookWorker?.stop();
    merchantMediaCleanupReconciler?.stop();
    earlyWarningMonitor?.stop();
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
    { code: safeStartupErrorCode(error), startupStage },
    "Production runtime provider bootstrap failed",
  );
  process.exit(1);
});
