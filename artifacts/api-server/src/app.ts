import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import retentionGuardRouter from "./routes/retention-guard";
import { enforceMerchantRetentionAccess } from "./middleware/merchantRetentionAccess";
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api", retentionGuardRouter);
app.use("/api", router);

export default app;
