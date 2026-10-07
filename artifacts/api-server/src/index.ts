import { logger } from "./lib/logger";
import { getFawriDataDir } from "./lib/dataPaths";
import type { DurableJobWorker } from "./services/durableJobQueue";
import type { EarlyWarningIncidentMonitor } from "./services/earlyWarningIncidentMonitor";
import type { MerchantPhysicalMediaCleanupReconciler } from "./services/merchantPhysicalMediaCleanup";
import { assertProductionRuntimeConfiguration } from "./services/productionReleaseReadiness";
import { assertProductionOwnerAdminReady } from "./services/postgresOwnerAdminProvisioning";
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

async function main(): Promise<void> {
  // Production fails closed before any provider bootstrap, listener, worker,
  // or application traffic. Staging/development must opt out explicitly.
  assertProductionRuntimeConfiguration(process.env);
  await assertProductionDatabaseRlsReady(process.env);
  await assertProductionOwnerAdminReady(process.env);

  const { application, runtime } = await bootstrapRuntimeAndLoadApplication({
    loadApplication: async () => {
      async function loadStartupModule<T>(
        code: string,
        loader: () => Promise<T>,
      ): Promise<T> {
        try {
          return await loader();
        } catch {
          throw Object.assign(new Error("startup module load failed"), { code });
        }
      }

      await loadStartupModule(
        "STARTUP_PART1_HEALTH_ROUTE_LOAD_FAILED",
        () => import("./routes/health"),
      );
      await loadStartupModule(
        "STARTUP_BOT_TRAINING_SERVICE_LOAD_FAILED",
        () => import("./services/merchantBotTraining"),
      );
      await loadStartupModule(
        "STARTUP_BOT_TRAINING_AUTH_ROUTE_LOAD_FAILED",
        () => import("./routes/auth"),
      );
      await loadStartupModule(
        "STARTUP_PART1_BOT_TRAINING_ROUTE_ASSEMBLY_LOAD_FAILED",
        () => import("./routes/bot-training"),
      );
      await loadStartupModule(
        "STARTUP_PART1_DELIVERY_PRICING_LOAD_FAILED",
        () => import("./services/deliveryPricing"),
      );
      await loadStartupModule(
        "STARTUP_PART1_MERCHANT_SETTINGS_RUNTIME_LOAD_FAILED",
        () => import("./services/merchantSettingsRuntime"),
      );
      await loadStartupModule(
        "STARTUP_PART1_MERCHANT_RUNTIME_LOAD_FAILED",
        () => import("./services/merchantRuntime"),
      );
      await loadStartupModule(
        "STARTUP_PART1_META_CHANNEL_RUNTIME_LOAD_FAILED",
        () => import("./services/metaChannelRuntime"),
      );
      await loadStartupModule(
        "STARTUP_PART1_POSTGRES_META_CHANNEL_LOAD_FAILED",
        () => import("./services/postgresMetaChannelAuthority"),
      );
      await loadStartupModule(
        "STARTUP_PART1_MERCHANT_OPERATIONAL_ACCESS_LOAD_FAILED",
        () => import("./services/merchantOperationalAccess"),
      );
      await loadStartupModule(
        "STARTUP_PART1_OPERATIONAL_POSTGRES_LOAD_FAILED",
        () => import("./services/operationalPostgresAuthority"),
      );
      await loadStartupModule(
        "STARTUP_PART1_BOT_CATALOG_AUTHORITY_LOAD_FAILED",
        () => import("./services/botCatalogAuthority"),
      );
      await loadStartupModule(
        "STARTUP_PART1_AUTH_ROUTE_LOAD_FAILED",
        () => import("./routes/auth"),
      );
      await loadStartupModule(
        "STARTUP_PART1_SAVED_ANSWERS_ROUTE_LOAD_FAILED",
        () => import("./routes/saved-answers"),
      );
      await loadStartupModule(
        "STARTUP_PART1_META_WEBHOOK_SECURITY_LOAD_FAILED",
        () => import("./middleware/metaWebhookSecurity"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_INDEX_PART1_ASSEMBLY_LOAD_FAILED",
        () => import("./routes/indexModulePart1"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_LEGACY_DEBUG_GUARD_LOAD_FAILED",
        () => import("./routes/legacyBotDebugRouteGuard"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_INDEX_PART4_LOAD_FAILED",
        () => import("./routes/indexModulePart4"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_INDEX_PART3_LOAD_FAILED",
        () => import("./routes/indexModulePart3"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_INDEX_ASSEMBLY_LOAD_FAILED",
        () => import("./routes"),
      );
      await loadStartupModule(
        "STARTUP_AUTH_SECURITY_SUPPORT_CUTOVER_LOAD_FAILED",
        () => import("./services/postgresSupportRuntimeCutover"),
      );
      await loadStartupModule(
        "STARTUP_AUTH_SESSION_MIDDLEWARE_LOAD_FAILED",
        () => import("./middleware/authSession"),
      );
      await loadStartupModule(
        "STARTUP_OWNER_RECOVERY_REAUTH_LOAD_FAILED",
        () => import("./middleware/ownerRecoveryReauth"),
      );
      await loadStartupModule(
        "STARTUP_ADMIN_AUTH_POSTGRES_CUTOVER_LOAD_FAILED",
        () => import("./services/adminAuthPostgresCutover"),
      );
      await loadStartupModule(
        "STARTUP_AUTH_SECURITY_CORE_ROUTES_LOAD_FAILED",
        () =>
          Promise.all([
            import("./routes/auth-public-routes"),
            import("./routes/auth-session-routes"),
            import("./routes/auth-admin-postgres-routes"),
            import("./routes/auth-admin-routes"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_AUTH_SECURITY_ADMIN_SUPPORT_ROUTES_LOAD_FAILED",
        () =>
          Promise.all([
            import("./routes/auth-admin-device-otp-pg-routes"),
            import("./routes/auth-owner-recovery-postgres-routes"),
            import("./routes/auth-early-warning-postgres-routes"),
            import("./routes/auth-provider-cost-postgres-routes"),
            import("./routes/auth-emergency-postgres-routes"),
            import("./routes/auth-merchant-management-postgres-routes"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_AUTH_SECURITY_SUPPORT_ROUTES_LOAD_FAILED",
        () =>
          Promise.all([
            import("./routes/auth-support-admin-lifecycle-postgres-routes"),
            import("./routes/auth-support-image-alias-postgres-routes"),
            import("./routes/auth-support-inspection-decision-postgres-routes"),
            import("./routes/auth-support-message-postgres-routes"),
            import("./routes/auth-support-postgres-routes"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_AUTH_SECURITY_BILLING_REALTIME_ROUTES_LOAD_FAILED",
        () =>
          Promise.all([
            import("./routes/merchant-notifications-pg"),
            import("./routes/merchant-realtime-pg"),
            import("./routes/subscription-entitlement-pg"),
            import("./routes/saas-billing"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_AUTH_SECURITY_ASSEMBLY_LOAD_FAILED",
        () => import("./routes/auth-security"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_CHANNEL_OPERATIONS_LOAD_FAILED",
        () => import("./routes/channel-operations"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_CHANNEL_DURABLE_ADMIN_LOAD_FAILED",
        () => import("./routes/channel-durable-job-admin"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_CATALOG_OPERATIONS_LOAD_FAILED",
        () => import("./routes/catalog-operations"),
      );
      await loadStartupModule(
        "STARTUP_ROUTE_KNOWLEDGE_OPERATIONS_LOAD_FAILED",
        () => import("./routes/knowledge-operations"),
      );
      await loadStartupModule(
        "STARTUP_ROUTES_COMMERCE_GROUP_LOAD_FAILED",
        () =>
          Promise.all([
            import("./routes/conversation-operations"),
            import("./routes/order-operations"),
            import("./routes/reports-operations"),
            import("./routes/cashier-staff-operations"),
            import("./routes/cashier-discount-policy-operations"),
            import("./routes/cashier-operator-commerce"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_ROUTES_CASHIER_MERCHANT_GROUP_LOAD_FAILED",
        () =>
          Promise.all([
            import("./routes/cashier-sync-operations"),
            import("./routes/cashier-subscription-operations"),
            import("./routes/merchant-settings"),
            import("./routes/merchant-regional"),
            import("./routes/retention-guard"),
            import("./routes/support-preview"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_ROUTES_SUPPORT_EMERGENCY_GROUP_LOAD_FAILED",
        () =>
          Promise.all([
            import("./routes/support-images"),
            import("./routes/emergency-owner-snapshot"),
            import("./routes/emergency-read-access"),
            import("./routes/emergency-read-directory"),
            import("./routes/emergency-merchant-notices"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_OBSERVABILITY_GROUP_LOAD_FAILED",
        () =>
          Promise.all([
            import("./observability/router"),
            import("./observability/requestTelemetry"),
            import("./observability/runtime"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_MIDDLEWARE_GROUP_LOAD_FAILED",
        () =>
          Promise.all([
            import("./middleware/authCutoverCompatibility"),
            import("./middleware/legacyProductionFallbackGuard"),
            import("./middleware/authSession"),
            import("./middleware/merchantRetentionAccess"),
            import("./middleware/merchantOperationalAccess"),
            import("./middleware/merchantWebhookAccess"),
            import("./middleware/manualConversationWebhookAccess"),
            import("./middleware/merchantWebhookSubscriptionAccess"),
            import("./middleware/metaWebhookQueueIngress"),
            import("./middleware/metaWebhookPath"),
            import("./middleware/metaWebhookSecurity"),
          ]),
      );
      await loadStartupModule(
        "STARTUP_APP_SERVICES_GROUP_LOAD_FAILED",
        () =>
          Promise.all([
            import("./services/authPolicy"),
            import("./services/merchantRetentionPolicy"),
            import("./services/productionReleaseReadiness"),
            import("./services/manualConversationDeletion"),
          ]),
      );
      const { default: app } = await loadStartupModule(
        "STARTUP_APP_ASSEMBLY_LOAD_FAILED",
        () => import("./app"),
      );
      const { startMetaWebhookWorker } = await loadStartupModule(
        "STARTUP_META_WORKER_MODULE_LOAD_FAILED",
        () => import("./services/metaWebhookWorker"),
      );
      const { startEarlyWarningIncidentMonitor } = await loadStartupModule(
        "STARTUP_EARLY_WARNING_MODULE_LOAD_FAILED",
        () => import("./services/earlyWarningIncidentMonitor"),
      );
      const { startMerchantPhysicalMediaCleanupReconciler } =
        await loadStartupModule(
          "STARTUP_MEDIA_CLEANUP_MODULE_LOAD_FAILED",
          () => import("./services/merchantPhysicalMediaCleanup"),
        );

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
    { code: safeStartupErrorCode(error) },
    "Production runtime provider bootstrap failed",
  );
  process.exit(1);
});
