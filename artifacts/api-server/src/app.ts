import fs from "node:fs";
import path from "node:path";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import authSecurityRouter from "./routes/auth-security";
import channelOperationsRouter from "./routes/channel-operations";
import { createChannelDurableJobAdminRouter } from "./routes/channel-durable-job-admin";
import catalogOperationsRouter from "./routes/catalog-operations";
import knowledgeOperationsRouter from "./routes/knowledge-operations";
import conversationOperationsRouter from "./routes/conversation-operations";
import orderOperationsRouter from "./routes/order-operations";
import merchantSettingsRouter from "./routes/merchant-settings";
import retentionGuardRouter from "./routes/retention-guard";
import supportPreviewRouter from "./routes/support-preview";
import supportImagesRouter from "./routes/support-images";
import emergencyOwnerSnapshotRouter from "./routes/emergency-owner-snapshot";
import emergencyReadAccessRouter from "./routes/emergency-read-access";
import emergencyReadDirectoryRouter from "./routes/emergency-read-directory";
import emergencyMerchantNoticesRouter from "./routes/emergency-merchant-notices";
import { createObservabilityRouter } from "./observability/router";
import {
  allowInternalMetricsRequest,
  createPostgresAuthorityReadinessCheck,
  observabilityService,
  observabilityVersion,
  processMetricsRegistry,
} from "./observability/runtime";
import { enforceAuthCutoverCompatibility } from "./middleware/authCutoverCompatibility";
import { enforceLegacyAuthProductionCutoverGate } from "./middleware/legacyProductionFallbackGuard";
import {
  enforceAuthOrigin,
  getAuthContext,
  requireSecureAdminSession,
  requireSecureMerchantSession,
  sendAuthError,
} from "./middleware/authSession";
import { enforceMerchantRetentionAccess } from "./middleware/merchantRetentionAccess";
import {
  enforceMerchantOAuthCallbackOperationalAccess,
  enforceMerchantOperationalAccess,
} from "./middleware/merchantOperationalAccess";
import { enforceMerchantWebhookOperationalAccess } from "./middleware/merchantWebhookAccess";
import { enforceManualConversationWebhookAccess } from "./middleware/manualConversationWebhookAccess";
import { enforceMerchantWebhookSubscriptionAccess } from "./middleware/merchantWebhookSubscriptionAccess";
import { enqueueMetaWebhookEvents } from "./middleware/metaWebhookQueueIngress";
import {
  enforceMetaWebhookSecurity,
  type MetaRawBodyRequest,
} from "./middleware/metaWebhookSecurity";
import { logger } from "./lib/logger";
import { hasAdminPermission } from "./services/authPolicy";
import {
  refreshMerchantRetentionPolicy,
  startMerchantRetentionPolicyScheduler,
} from "./services/merchantRetentionPolicy";
import {
  assertProductionRuntimeConfiguration,
  metaConnectionActivationConfigured,
} from "./services/productionReleaseReadiness";
import "./services/manualConversationDeletion";

const app: Express = express();

function authorizeChannelDurableJobAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireSecureAdminSession(req, res, () => {
    const profile = getAuthContext(res)?.adminProfile;
    if (!profile) {
      sendAuthError(res, 403, "ADMIN_PERMISSION_REQUIRED", "admin permission is required");
      return;
    }

    const canManage = hasAdminPermission(
      profile.role,
      profile.permissions,
      "manage_channels",
    );
    const canView = canManage || hasAdminPermission(
      profile.role,
      profile.permissions,
      "view_logs",
    );
    const allowed = req.method === "GET" ? canView : canManage;

    if (!allowed) {
      sendAuthError(
        res,
        403,
        "ADMIN_PERMISSION_REQUIRED",
        req.method === "GET"
          ? "view_logs or manage_channels permission is required"
          : "manage_channels permission is required",
      );
      return;
    }

    next();
  });
}

const channelDurableJobAdminRouter = createChannelDurableJobAdminRouter(
  authorizeChannelDurableJobAdmin,
);

function enforceMetaConnectionActivationGate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isConnectionPath =
    req.method === "GET" &&
    (req.path === "/api/meta/login" || req.path === "/api/meta/callback");

  if (!isConnectionPath || metaConnectionActivationConfigured(process.env)) {
    next();
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({
    ok: false,
    code: "META_CHANNEL_CONNECTION_CUTOVER_PENDING",
    error: "Meta channel connection is disabled until production-safe OAuth configuration is complete",
  });
}

function enforceLegacyKnowledgeCutoverGate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isLegacyKnowledgePath =
    req.path === "/api/saved-answers" ||
    req.path.startsWith("/api/saved-answers/") ||
    req.path === "/api/bot-training" ||
    req.path.startsWith("/api/bot-training/");

  if (!isLegacyKnowledgePath) {
    next();
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(410).json({
    ok: false,
    code: "LEGACY_KNOWLEDGE_AUTHORITY_DISABLED",
    error: "legacy knowledge authority is disabled; use /api/knowledge",
  });
}

function enforceCatalogSecureSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const catalogPath =
    req.path === "/api/catalog" ||
    req.path.startsWith("/api/catalog/") ||
    req.path === "/api/inventory" ||
    req.path.startsWith("/api/inventory/");

  if (!catalogPath) {
    next();
    return;
  }

  requireSecureMerchantSession(req, res, next);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, service: "fawri" });
});
app.use(
  "/ops",
  createObservabilityRouter({
    service: observabilityService,
    version: observabilityVersion(),
    readinessChecks: [
      createPostgresAuthorityReadinessCheck(),
      {
        name: "production_release_configuration",
        check() {
          assertProductionRuntimeConfiguration(process.env);
        },
      },
    ],
    metrics: processMetricsRegistry,
    allowMetrics: allowInternalMetricsRequest,
  }),
);
app.use(
  express.json({
    verify(req, _res, buffer) {
      if (req.originalUrl?.startsWith("/api/meta/webhook")) {
        (req as MetaRawBodyRequest).rawBody = Buffer.from(buffer);
      }
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(enforceMetaWebhookSecurity);
app.use(enforceMerchantWebhookOperationalAccess);
app.use(enforceManualConversationWebhookAccess);
app.use(enqueueMetaWebhookEvents);
app.use(enforceMerchantWebhookSubscriptionAccess);

// Auth cutover order is deliberate: the v2 router owns every new auth/session
// endpoint first. Any remaining legacy business handler receives only a
// server-derived compatibility credential after v2 session validation.
app.use("/api/auth", authSecurityRouter);
// Legacy Support images are mounted only after the PostgreSQL Support
// interceptor. In required mode any unresolved fallthrough is retired before
// the JSON-backed compatibility router can execute.
app.use(
  "/api/auth/support-images",
  enforceLegacyAuthProductionCutoverGate,
  supportImagesRouter,
);
app.use("/api/auth", enforceAuthOrigin);
app.use(enforceAuthCutoverCompatibility);

app.use((req, res, next) => {
  const inspectionRequestPath =
    /^\/api\/auth\/admin\/support\/tickets\/[^/]+\/inspection-requests$/;
  if (
    req.method === "POST" &&
    inspectionRequestPath.test(req.path) &&
    req.body?.mode !== "independent_read_only"
  ) {
    return res.status(400).json({
      ok: false,
      error: "only independent read-only inspection sessions are supported",
      code: "INSPECTION_MODE_UNSUPPORTED",
    });
  }
  return next();
});

startMerchantRetentionPolicyScheduler();
app.use((_req, _res, next) => {
  try {
    refreshMerchantRetentionPolicy();
  } catch (error) {
    logger.error({ err: error }, "Retention policy refresh failed");
  }
  next();
});
app.use(enforceMerchantRetentionAccess);
app.use(enforceMerchantOAuthCallbackOperationalAccess);
app.use(enforceMerchantOperationalAccess);
app.use(enforceCatalogSecureSession);
app.use("/api", retentionGuardRouter);
app.use(
  "/api/auth/admin/emergency-read-access",
  enforceLegacyAuthProductionCutoverGate,
  emergencyReadDirectoryRouter,
);
app.use(
  "/api/auth/admin/emergency-read-access",
  enforceLegacyAuthProductionCutoverGate,
  emergencyOwnerSnapshotRouter,
);
app.use(
  "/api/auth/admin/emergency-read-access",
  enforceLegacyAuthProductionCutoverGate,
  emergencyReadAccessRouter,
);
app.use(
  "/api/auth/emergency-read-access",
  enforceLegacyAuthProductionCutoverGate,
  emergencyMerchantNoticesRouter,
);
app.use(
  "/api/auth/admin/support-preview",
  enforceLegacyAuthProductionCutoverGate,
  supportPreviewRouter,
);
app.use("/api", conversationOperationsRouter);
app.use("/api", orderOperationsRouter);
app.use("/api", merchantSettingsRouter);
app.use("/api", channelOperationsRouter);
app.use("/api", channelDurableJobAdminRouter);
app.use("/api", catalogOperationsRouter);
app.use("/api/knowledge", knowledgeOperationsRouter);

// Meta OAuth remains fail-closed by default. It is reachable only when the
// explicit PostgreSQL/KMS/live-send activation contract is configured.
app.use(enforceMetaConnectionActivationGate);

// The corrected Knowledge/AI router is now the sole merchant-facing knowledge
// authority. Legacy saved-answer/training routes are blocked before the shared
// legacy router so two authorities cannot remain active at once.
app.use(enforceLegacyKnowledgeCutoverGate);

// In PostgreSQL-required mode every supported /api/auth surface must have been
// handled above. Anything still falling through is legacy authority and is
// retired rather than allowed to consult JSON/session compatibility stores.
app.use(enforceLegacyAuthProductionCutoverGate);

app.use("/api", router);

const configuredWebDistDir = process.env["FAWRI_WEB_DIST_DIR"]?.trim();

if (configuredWebDistDir) {
  const webDistDir = path.resolve(configuredWebDistDir);
  const webIndexPath = path.join(webDistDir, "index.html");

  if (!fs.existsSync(webIndexPath)) {
    throw new Error(
      `FAWRI_WEB_DIST_DIR does not contain index.html: ${webDistDir}`,
    );
  }

  app.use(express.static(webDistDir, { index: false, fallthrough: true }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    if (
      req.path === "/healthz" ||
      req.path === "/ops" ||
      req.path.startsWith("/ops/") ||
      req.path === "/api" ||
      req.path.startsWith("/api/") ||
      path.extname(req.path)
    ) {
      next();
      return;
    }

    res.sendFile(webIndexPath);
  });

  logger.info({ webDistDir }, "Serving built Fawri frontend");
}

export default app;
