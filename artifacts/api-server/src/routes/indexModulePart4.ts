import { Router, type IRouter, type Request, type Response } from "express";
import fs from "node:fs";
import { getFawriDataDir, getFawriDataFilePath } from "../lib/dataPaths";
import healthRouter from "./health";
import botTrainingRouter from "./bot-training";
import {
  formatDeliveryQuoteText,
  type DeliveryQuote,
} from "../services/deliveryPricing";
import { getMerchantDeliveryQuote } from "../services/merchantSettingsRuntime";
import { registerMerchantRuntimeDeletion } from "../services/merchantRuntime";
import {
  connectMetaChannel,
  readMetaChannelCredential,
} from "../services/metaChannelRuntime";
import {
  connectMetaChannelAuthoritative,
  listMetaChannelsAuthoritative,
} from "../services/postgresMetaChannelAuthority";
import {
  getMerchantOperationalDecisionAuthoritative,
} from "../services/merchantOperationalAccess";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  BotCatalogAuthorityError,
  readBotCatalogProducts,
  type BotCatalogProduct,
} from "../services/botCatalogAuthority";
import authRouter, {
  createMerchantOAuthState,
  getMerchantIdFromSession,
  merchantSessionAccountExists,
  notifyMerchantNewCustomerMessage,
  notifyMerchantNewOrder,
  requireMerchantSession,
  verifyMerchantOAuthState,
} from "./auth";
import savedAnswersRouter from "./saved-answers";
import { getMetaWebhookEventId } from "../middleware/metaWebhookSecurity";
import './indexModulePart3';
import { BOT_DEBUG, GRAPH_VERSION, META_REDIRECT_URI, getBusinessContextForPage, getPageAccessTokenForPage, getQueryString, metaPagesByPageId, router, safeErrorCode, saveMessengerConversation, saveRuntimeDb, sendMessengerText } from './indexModulePart1';
import type { MetaPageConnection } from './indexModulePart1';
import { resolveBusinessContextForMessage } from './indexModulePart2';
import { generateTrainedBotReply } from './indexModulePart3';

router.post("/meta/webhook", async (req: Request, res: Response) => {
  if (operationalPostgresAuthorityRequired()) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(410).json({
      ok: false,
      code: "LEGACY_META_WEBHOOK_DISABLED",
      error: "legacy Meta webhook runtime is disabled",
    });
  }
  try {
    const body = req.body;
    if (body.object !== "page") return res.sendStatus(200);

    for (const entry of body.entry || []) {
      const pageId = entry.id;
      if (!pageId) continue;
      const pageAccessToken = await getPageAccessTokenForPage(pageId);
      if (!pageAccessToken) continue;
      const baseBusinessContext = await getBusinessContextForPage(pageId);
      if (!baseBusinessContext) {
        console.error("No merchant mapping found for page:", pageId);
        continue;
      }

      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        const messageText = event.message?.text;
        const messageId = event.message?.mid;
        const eventId = getMetaWebhookEventId(pageId, event);
        if (event.message?.is_echo) continue;
        if (!senderId || !messageText) continue;

        const businessContext = resolveBusinessContextForMessage(
          pageId,
          messageText,
          baseBusinessContext,
        );
        const trainedReply = await generateTrainedBotReply({
          userText: messageText,
          context: businessContext,
          customerId: senderId,
        });
        const reply = trainedReply.text;

        if (BOT_DEBUG) {
          console.log(
            "[FAWRI_BOT_DEBUG]",
            JSON.stringify(
              {
                pageId,
                contextDebug: businessContext.debug,
                merchantId: businessContext.merchantId,
                productsCount: businessContext.products.length,
                productNames: businessContext.products
                  .slice(0, 20)
                  .map((p) => p.name),
                senderId,
                messageText,
                intent: trainedReply.debug?.intent,
                matchedProduct: trainedReply.debug?.matchedProduct,
                reply,
              },
              null,
              2,
            ),
          );
        }

        try {
          await sendMessengerText(senderId, reply, pageAccessToken);
          saveMessengerConversation({
            merchantId: businessContext.merchantId,
            customerId: senderId,
            userText: messageText,
            botReply: reply,
            externalMessageId: messageId || eventId,
            sourceEventId: eventId,
            replyStatus: "sent",
            replyType: trainedReply.replyType,
            needsTraining: trainedReply.needsTraining,
            assignedToHuman: trainedReply.assignedToHuman,
          });
        } catch {
          console.error("Meta reply send failed", {
            pageId,
            code: "META_SEND_FAILED",
          });
          saveMessengerConversation({
            merchantId: businessContext.merchantId,
            customerId: senderId,
            userText: messageText,
            botReply: reply,
            externalMessageId: messageId || eventId,
            sourceEventId: eventId,
            replyStatus: "failed",
            replyType: trainedReply.replyType,
            needsTraining: trainedReply.needsTraining,
            assignedToHuman: trainedReply.assignedToHuman,
          });
        }
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    if (error instanceof BotCatalogAuthorityError) {
      console.error("Bot catalog authority unavailable:", error.code);
      res.setHeader("Cache-Control", "no-store");
      return res.status(error.status).json({
        ok: false,
        code: error.code,
        error: error.message,
      });
    }
    console.error("Webhook error:", error);
    return res.sendStatus(200);
  }
});

router.get(
  "/meta/login",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const appId = process.env.META_APP_ID;
    const configId = process.env.META_CONFIG_ID;
    const requestedPlatform =
      getQueryString(req.query.platform) || "messenger";
    const merchantId = getMerchantIdFromSession(res);

    if (
      requestedPlatform !== "messenger" &&
      requestedPlatform !== "instagram"
    ) {
      return res.status(400).send("Unsupported Meta platform");
    }
    if (!appId) return res.status(500).send("META_APP_ID is not configured");
    if (!configId)
      return res.status(500).send("META_CONFIG_ID is not configured");
    if (!META_REDIRECT_URI)
      return res.status(503).send("META_REDIRECT_URI is not configured");

    const state = createMerchantOAuthState(
      merchantId,
      requestedPlatform,
    );
    const loginUrl =
      `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}` +
      `&config_id=${encodeURIComponent(configId)}` +
      `&state=${encodeURIComponent(state)}` +
      `&response_type=code`;
    return res.redirect(loginUrl);
  },
);

router.get("/meta/callback", async (req: Request, res: Response) => {
  const code = getQueryString(req.query.code);
  const error = getQueryString(req.query.error);
  const errorDescription = getQueryString(req.query.error_description);
  const rawState = getQueryString(req.query.state);
  const state = verifyMerchantOAuthState(rawState);

  if (error)
    return res
      .status(400)
      .send(`Meta login error: ${errorDescription || error}`);
  if (!code) return res.status(400).send("Missing code from Meta");
  if (!state) return res.status(400).send("Invalid or expired Meta state");
  if (operationalPostgresAuthorityRequired()) {
    const decision = await getMerchantOperationalDecisionAuthoritative(state.merchantId);
    if (!decision.allowed) {
      return res.status(decision.statusCode).send("Merchant account is unavailable");
    }
  } else if (!merchantSessionAccountExists(state.merchantId)) {
    return res.status(401).send("Merchant account is unavailable");
  }

  const merchantId = state.merchantId;
  const platform = state.platform || "messenger";

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId) return res.status(500).send("META_APP_ID is not configured");
  if (!appSecret)
    return res.status(500).send("META_APP_SECRET is not configured");
  if (!META_REDIRECT_URI)
    return res.status(503).send("META_REDIRECT_URI is not configured");

  try {
    const tokenUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData: any = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenData?.access_token) {
      console.error("Meta token exchange failed:", {
        status: tokenResponse.status,
        code: String(tokenData?.error?.code || "") || undefined,
      });
      return res.status(400).send("Failed to exchange Meta OAuth code");
    }

    const accountsUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts` +
      `?fields=id,name,access_token` +
      `&access_token=${encodeURIComponent(tokenData.access_token)}`;
    const accountsResponse = await fetch(accountsUrl);
    const accountsData: any = await accountsResponse.json().catch(() => null);
    if (!accountsResponse.ok || !Array.isArray(accountsData?.data)) {
      console.error("Failed to fetch Meta pages:", {
        status: accountsResponse.status,
        code: String(accountsData?.error?.code || "") || undefined,
      });
      return res.status(400).send("Failed to fetch Meta pages");
    }

    const connectedPages: MetaPageConnection[] = [];

    for (const page of accountsData.data.filter(
      (item: any) => item?.id && item?.access_token,
    )) {
      const pageId = String(page.id);
      const pageAccessToken = String(page.access_token);

      const connection: MetaPageConnection = {
        merchant_id: merchantId,
        page_id: pageId,
        page_name: String(page.name || "Facebook Page"),
        connected_at: new Date().toISOString(),
        platform: platform === "instagram" ? "instagram" : "messenger",
      };

      if (operationalPostgresAuthorityRequired()) {
        const activationDecision =
          await getMerchantOperationalDecisionAuthoritative(merchantId);
        if (!activationDecision.allowed) {
          return res
            .status(activationDecision.statusCode)
            .send("Merchant account is unavailable");
        }
      }

      // Install the app on this Page so Meta can deliver Page events
      // to the Webhook configured for the Fawri app.
      try {
        const subscribeUrl =
          `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/subscribed_apps`;

        const subscribeBody = new URLSearchParams({
          subscribed_fields: [
            "messages",
            "messaging_postbacks",
            "message_deliveries",
            "message_reads",
            "feed",
          ].join(","),
          access_token: pageAccessToken,
        });

        const subscribeResponse = await fetch(subscribeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: subscribeBody,
        });

        const subscribeData: any = await subscribeResponse
          .json()
          .catch(() => null);

        connection.webhook_subscribed =
          subscribeResponse.ok && subscribeData?.success === true;

        if (!connection.webhook_subscribed) {
          connection.webhook_subscription_error = String(
            subscribeData?.error?.message ||
              `Meta subscription failed with status ${subscribeResponse.status}`,
          );

          console.error("Meta Page webhook subscription failed:", {
            pageId,
            status: subscribeResponse.status,
            code: String(subscribeData?.error?.code || "") || undefined,
          });
        }
      } catch (subscriptionError) {
        connection.webhook_subscribed = false;
        connection.webhook_subscription_error =
          "Meta Page webhook subscription request failed";
        console.error("Meta Page webhook subscription request failed:", {
          pageId,
          code: safeErrorCode(subscriptionError, "META_SUBSCRIPTION_FAILED"),
        });
      }

      // Discover the Instagram professional account connected to this Page.
      try {
        const pageDetailsUrl =
          `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}` +
          `?fields=instagram_business_account` +
          `&access_token=${encodeURIComponent(pageAccessToken)}`;

        const pageDetailsResponse = await fetch(pageDetailsUrl);
        const pageDetails: any = await pageDetailsResponse
          .json()
          .catch(() => null);

        const instagramAccountId = String(
          pageDetails?.instagram_business_account?.id || "",
        );

        if (pageDetailsResponse.ok && instagramAccountId) {
          const instagramDetailsUrl =
            `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(instagramAccountId)}` +
            `?fields=id,username,name` +
            `&access_token=${encodeURIComponent(pageAccessToken)}`;

          const instagramDetailsResponse = await fetch(instagramDetailsUrl);
          const instagramDetails: any = await instagramDetailsResponse
            .json()
            .catch(() => null);

          if (instagramDetailsResponse.ok && instagramDetails?.id) {
            connection.instagram_account_id = String(instagramDetails.id);
            connection.instagram_username = String(
              instagramDetails.username || "",
            );
            connection.instagram_name = String(instagramDetails.name || "");
          } else {
            console.error("Failed to fetch connected Instagram account:", {
              pageId,
              instagramAccountId,
              status: instagramDetailsResponse.status,
              code: String(instagramDetails?.error?.code || "") || undefined,
            });
          }
        }
      } catch (instagramError) {
        console.error("Connected Instagram account discovery failed:", {
          pageId,
          code: safeErrorCode(instagramError, "META_INSTAGRAM_DISCOVERY_FAILED"),
        });
      }

      try {
        await connectMetaChannelAuthoritative({
          merchantId,
          platform: connection.platform,
          pageId: connection.page_id,
          pageName: connection.page_name,
          accessToken: pageAccessToken,
          webhookSubscribed: connection.webhook_subscribed,
          instagramAccountId: connection.instagram_account_id,
          instagramUsername: connection.instagram_username,
        });
      } catch (connectionError) {
        const connectionCode = safeErrorCode(
          connectionError,
          "META_CHANNEL_CONNECT_FAILED",
        );
        const operationalCutoff =
          connectionCode === "MERCHANT_APPROVAL_REQUIRED" ||
          connectionCode === "MERCHANT_REJECTED" ||
          connectionCode === "MERCHANT_SUSPENDED" ||
          connectionCode === "MERCHANT_ACCESS_STATE_UNAVAILABLE";

        if (operationalCutoff && connection.webhook_subscribed === true) {
          try {
            const unsubscribeUrl =
              `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/subscribed_apps`;
            const unsubscribeBody = new URLSearchParams({
              access_token: pageAccessToken,
            });
            const unsubscribeResponse = await fetch(unsubscribeUrl, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: unsubscribeBody,
            });
            if (!unsubscribeResponse.ok) {
              console.error("Meta Page webhook cutoff compensation failed:", {
                pageId,
                status: unsubscribeResponse.status,
                code: "META_SUBSCRIPTION_CUTOFF_CLEANUP_FAILED",
              });
            }
          } catch (unsubscribeError) {
            console.error("Meta Page webhook cutoff compensation failed:", {
              pageId,
              code: safeErrorCode(
                unsubscribeError,
                "META_SUBSCRIPTION_CUTOFF_CLEANUP_FAILED",
              ),
            });
          }
        }

        throw connectionError;
      }

      connectedPages.push(connection);
      if (!operationalPostgresAuthorityRequired()) {
        metaPagesByPageId.set(connection.page_id, connection);
      }
    }

    if (!operationalPostgresAuthorityRequired()) saveRuntimeDb();

    return res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding-top: 60px; direction: rtl;">
          <h2>تم ربط Meta بنجاح ✅</h2>
          <p>تم ربط ${connectedPages.length} صفحة بهذا التاجر.</p>
          <p>جاري الرجوع إلى لوحة التحكم...</p>
          <script>
            localStorage.setItem('fawri_${platform}_connected', 'true');
            setTimeout(function () { window.location.href = '/dashboard/channels'; }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (callbackError) {
    const callbackCode = safeErrorCode(callbackError, "META_CALLBACK_FAILED");
    console.error("Meta callback failed:", {
      code: callbackCode,
    });
    if (
      callbackCode === "MERCHANT_APPROVAL_REQUIRED" ||
      callbackCode === "MERCHANT_REJECTED" ||
      callbackCode === "MERCHANT_SUSPENDED" ||
      callbackCode === "MERCHANT_ACCESS_STATE_UNAVAILABLE"
    ) {
      const statusCode =
        Number((callbackError as { statusCode?: unknown })?.statusCode) === 503
          ? 503
          : 403;
      return res.status(statusCode).send("Merchant account is unavailable");
    }
    return res.status(500).send("Meta callback failed");
  }
});

router.use("/bot-training", botTrainingRouter);

router.use("/saved-answers", savedAnswersRouter);