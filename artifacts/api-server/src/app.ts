import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import retentionGuardRouter from "./routes/retention-guard";
import supportPreviewRouter from "./routes/support-preview";
import supportImagesRouter from "./routes/support-images";
import emergencyOwnerSnapshotRouter from "./routes/emergency-owner-snapshot";
import emergencyReadAccessRouter from "./routes/emergency-read-access";
import emergencyReadDirectoryRouter from "./routes/emergency-read-directory";
import emergencyMerchantNoticesRouter from "./routes/emergency-merchant-notices";
import { enforceMerchantRetentionAccess } from "./middleware/merchantRetentionAccess";
import {
  enforceMerchantOAuthCallbackOperationalAccess,
  enforceMerchantOperationalAccess,
} from "./middleware/merchantOperationalAccess";
import { enforceMerchantWebhookOperationalAccess } from "./middleware/merchantWebhookAccess";
import { logger } from "./lib/logger";
import {
  refreshMerchantRetentionPolicy,
  startMerchantRetentionPolicyScheduler,
} from "./services/merchantRetentionPolicy";

const app: Express = express();

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
app.use("/api/auth/support-images", supportImagesRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use(enforceMerchantWebhookOperationalAccess);
app.use(enforceMerchantOAuthCallbackOperationalAccess);
app.use(enforceMerchantOperationalAccess);
app.use("/api", retentionGuardRouter);
app.use(
  "/api/auth/admin/emergency-read-access",
  emergencyReadDirectoryRouter,
);
app.use(
  "/api/auth/admin/emergency-read-access",
  emergencyOwnerSnapshotRouter,
);
app.use(
  "/api/auth/admin/emergency-read-access",
  emergencyReadAccessRouter,
);
app.use(
  "/api/auth/emergency-read-access",
  emergencyMerchantNoticesRouter,
);
app.use("/api/auth/admin/support-preview", supportPreviewRouter);
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
