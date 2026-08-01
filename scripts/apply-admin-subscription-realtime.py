from pathlib import Path

FILES = {
    "auth": Path("artifacts/api-server/src/routes/auth.ts"),
    "admin": Path("artifacts/fawri/src/pages/AdminPage.tsx"),
    "test": Path("artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs"),
}


def replace_exact(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}, found {count}")
    return text.replace(before, after, 1)


auth = FILES["auth"].read_text(encoding="utf-8")

auth = replace_exact(
    auth,
    '''const merchantRealtimeClients = new Map<
  string,
  Map<string, MerchantRealtimeClient>
>();

function buildMerchantRealtimePayload(
''',
    '''const merchantRealtimeClients = new Map<
  string,
  Map<string, MerchantRealtimeClient>
>();

type AdminSubscriptionRealtimeEventName =
  | "snapshot"
  | "subscription_updated";

type AdminSubscriptionRealtimePayload = {
  merchant_id: string | null;
  subscription?: SubscriptionRecord | null;
  subscriptions?: SubscriptionRecord[];
  emitted_at: string;
};

type AdminSubscriptionRealtimeClient = {
  id: string;
  admin_id: string;
  response: Response;
};

const adminSubscriptionRealtimeClients = new Map<
  string,
  AdminSubscriptionRealtimeClient
>();

function buildAdminSubscriptionSnapshot(
  db: AuthDb,
): AdminSubscriptionRealtimePayload {
  const subscriptions = db.subscriptions
    .map((subscription) => recalculateSubscriptionTotals(subscription))
    .sort(
      (left, right) =>
        new Date(right.start_date).getTime() -
        new Date(left.start_date).getTime(),
    );

  return {
    merchant_id: null,
    subscriptions,
    emitted_at: now(),
  };
}

function buildAdminSubscriptionUpdate(
  db: AuthDb,
  merchantId: string,
): AdminSubscriptionRealtimePayload {
  const subscription = db.subscriptions.find(
    (item) => item.merchant_id === merchantId,
  );
  if (subscription) recalculateSubscriptionTotals(subscription);

  return {
    merchant_id: merchantId,
    subscription: subscription || null,
    emitted_at: now(),
  };
}

function writeAdminSubscriptionRealtimeEvent(
  response: Response,
  eventName: AdminSubscriptionRealtimeEventName,
  payload: AdminSubscriptionRealtimePayload,
): boolean {
  if (response.writableEnded) return false;

  try {
    response.write(
      `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`,
    );
    const flush = (response as Response & { flush?: () => void }).flush;
    if (typeof flush === "function") flush.call(response);
    return true;
  } catch {
    return false;
  }
}

function emitAdminSubscriptionRealtimeState(
  db: AuthDb,
  merchantId: string,
): void {
  if (adminSubscriptionRealtimeClients.size === 0) return;

  const payload = buildAdminSubscriptionUpdate(db, merchantId);
  for (const [clientId, client] of adminSubscriptionRealtimeClients) {
    const admin = db.merchants.find(
      (item) =>
        item.id === client.admin_id &&
        item.is_admin === true &&
        item.status === "approved" &&
        item.admin_enabled !== false,
    );
    if (
      !admin ||
      !isAdminRole(admin.admin_role) ||
      !adminHasPermission(admin, "manage_subscriptions") ||
      !writeAdminSubscriptionRealtimeEvent(
        client.response,
        "subscription_updated",
        payload,
      )
    ) {
      adminSubscriptionRealtimeClients.delete(clientId);
      if (!client.response.writableEnded) client.response.end();
    }
  }
}

function buildMerchantRealtimePayload(
''',
    "admin subscription realtime definitions",
)

auth = replace_exact(
    auth,
    '''function emitMerchantRealtimeState(
  db: AuthDb,
  merchantId: string,
  eventName: Exclude<MerchantRealtimeEventName, "snapshot">,
): void {
  const clients = merchantRealtimeClients.get(merchantId);
  if (!clients || clients.size === 0) return;
''',
    '''function emitMerchantRealtimeState(
  db: AuthDb,
  merchantId: string,
  eventName: Exclude<MerchantRealtimeEventName, "snapshot">,
): void {
  if (eventName === "subscription_updated") {
    emitAdminSubscriptionRealtimeState(db, merchantId);
  }

  const clients = merchantRealtimeClients.get(merchantId);
  if (!clients || clients.size === 0) return;
''',
    "admin broadcast from merchant subscription updates",
)

auth = replace_exact(
    auth,
    '''router.get("/notifications", requireMerchantSession, (req: Request, res: Response) => {
''',
    '''router.get(
  "/admin/subscriptions/events",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_subscriptions");
    if (!admin) return;

    const clientId = makeId("admin-subscription-realtime");

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    req.socket.setTimeout(0);
    req.socket.setKeepAlive(true);

    adminSubscriptionRealtimeClients.set(clientId, {
      id: clientId,
      admin_id: admin.id,
      response: res,
    });

    writeAdminSubscriptionRealtimeEvent(
      res,
      "snapshot",
      buildAdminSubscriptionSnapshot(ensureDb()),
    );

    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(": heartbeat\n\n");
        const flush = (res as Response & { flush?: () => void }).flush;
        if (typeof flush === "function") flush.call(res);
      } catch {
        // The close handler removes disconnected clients.
      }
    }, 25_000);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      adminSubscriptionRealtimeClients.delete(clientId);
      if (!res.writableEnded) res.end();
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  },
);

router.get("/notifications", requireMerchantSession, (req: Request, res: Response) => {
''',
    "admin subscription SSE route",
)

FILES["auth"].write_text(auth, encoding="utf-8")

admin = FILES["admin"].read_text(encoding="utf-8")
admin = replace_exact(
    admin,
    '''  ]);

  const getSub = (id: string) =>
    subscriptions.find((s) => s.merchant_id === id);
''',
    '''  ]);

  useEffect(() => {
    if (!canManageSubscriptions) return;

    let active = true;
    let reconnectTimer: number | undefined;
    let controller: AbortController | null = null;

    const applySnapshot = (serverSubscriptions: Subscription[]) => {
      saveSubscriptions(serverSubscriptions);
      setSubscriptions(serverSubscriptions);
    };

    const applyUpdate = (
      merchantId: string,
      subscription: Subscription | null,
    ) => {
      setSubscriptions((current) => {
        const next = current.filter(
          (item) => item.merchant_id !== merchantId,
        );
        if (subscription) next.push(subscription);
        saveSubscriptions(next);
        return next;
      });
    };

    const connect = async (): Promise<void> => {
      controller = new AbortController();

      try {
        const response = await fetch(
          "/api/auth/admin/subscriptions/events",
          {
            headers: getAdminAuthHeaders(),
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (handleUnauthorizedAdminResponse(response)) return;
        if (!response.ok || !response.body) {
          throw new Error("Could not connect to admin subscription updates");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (active) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            if (!block || block.startsWith(":")) continue;
            const lines = block.split("\n");
            const eventName = lines
              .find((line) => line.startsWith("event:"))
              ?.slice("event:".length)
              .trim();
            const data = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice("data:".length).trimStart())
              .join("\n");
            if (!eventName || !data) continue;

            const payload = JSON.parse(data) as {
              merchant_id?: string | null;
              subscription?: Subscription | null;
              subscriptions?: Subscription[];
            };

            if (
              eventName === "snapshot" &&
              Array.isArray(payload.subscriptions)
            ) {
              applySnapshot(payload.subscriptions);
            } else if (
              eventName === "subscription_updated" &&
              typeof payload.merchant_id === "string"
            ) {
              applyUpdate(
                payload.merchant_id,
                payload.subscription || null,
              );
            }
          }
        }
      } catch (error) {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          console.error("Admin subscription realtime connection failed:", error);
        }
      }

      if (active) {
        reconnectTimer = window.setTimeout(() => void connect(), 1_500);
      }
    };

    void connect();

    return () => {
      active = false;
      controller?.abort();
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, [
    canManageSubscriptions,
    handleUnauthorizedAdminResponse,
  ]);

  const getSub = (id: string) =>
    subscriptions.find((s) => s.merchant_id === id);
''',
    "admin subscription realtime frontend effect",
)
FILES["admin"].write_text(admin, encoding="utf-8")

test = FILES["test"].read_text(encoding="utf-8")
test = replace_exact(
    test,
    '''  const exhaustedA = await subscriptionAction("merchant-a", "deduct_replies", 4000);
  assert.equal(exhaustedA.response.status, 200);
  assert.equal(exhaustedA.body.subscription.replies_remaining, 0);

  const emergencyA = await json(await fetch(`${baseUrl}/api/auth/subscription/emergency`, {
''',
    '''  const exhaustedA = await subscriptionAction("merchant-a", "deduct_replies", 4000);
  assert.equal(exhaustedA.response.status, 200);
  assert.equal(exhaustedA.body.subscription.replies_remaining, 0);

  const adminRealtimeController = new AbortController();
  const adminRealtimeResponse = await fetch(
    `${baseUrl}/api/auth/admin/subscriptions/events`,
    {
      headers: adminHeaders,
      signal: adminRealtimeController.signal,
    },
  );
  assert.equal(adminRealtimeResponse.status, 200);
  assert.match(
    adminRealtimeResponse.headers.get("content-type") || "",
    /text\/event-stream/,
  );
  const adminRealtimeEvents = createSseEventReader(adminRealtimeResponse.body);
  const adminRealtimeSnapshot = await adminRealtimeEvents.next("snapshot");
  const snapshotMerchantA = adminRealtimeSnapshot.subscriptions.find(
    (subscription) => subscription.merchant_id === "merchant-a",
  );
  assert.ok(snapshotMerchantA);
  assert.equal(snapshotMerchantA.replies_remaining, 0);

  const emergencyA = await json(await fetch(`${baseUrl}/api/auth/subscription/emergency`, {
''',
    "admin realtime test setup",
)

test = replace_exact(
    test,
    '''  assert.equal(emergencyA.body.subscription.addon_reply_batches[0].source, "emergency");
  assert.equal(emergencyA.body.subscription.replies_remaining, 400);

  const secondEmergency = await fetch(`${baseUrl}/api/auth/subscription/emergency`, {
''',
    '''  assert.equal(emergencyA.body.subscription.addon_reply_batches[0].source, "emergency");
  assert.equal(emergencyA.body.subscription.replies_remaining, 400);

  const adminEmergencyUpdate = await adminRealtimeEvents.next(
    "subscription_updated",
  );
  assert.equal(adminEmergencyUpdate.merchant_id, "merchant-a");
  assert.equal(adminEmergencyUpdate.subscription.merchant_id, "merchant-a");
  assert.equal(adminEmergencyUpdate.subscription.addon_replies_remaining, 400);
  assert.equal(adminEmergencyUpdate.subscription.emergency_debt, 400);
  adminRealtimeController.abort();
  await adminRealtimeEvents.cancel().catch(() => undefined);

  const secondEmergency = await fetch(`${baseUrl}/api/auth/subscription/emergency`, {
''',
    "admin realtime emergency assertion",
)
FILES["test"].write_text(test, encoding="utf-8")

print("Admin subscription balances now update automatically through authenticated realtime events.")
