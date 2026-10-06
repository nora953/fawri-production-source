export type DeliveryLifecycleStatus =
  | "not_requested"
  | "ready"
  | "submitted"
  | "accepted"
  | "pickup_scheduled"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "delivery_failed"
  | "return_requested"
  | "return_in_transit"
  | "returned"
  | "cancelled";

export type DeliveryProviderCapability =
  | "create_shipment"
  | "cancel_shipment"
  | "track_shipment"
  | "webhooks"
  | "cash_on_delivery"
  | "cod_settlement";

export type DeliveryAddress = {
  country_code?: string | null;
  governorate?: string | null;
  city?: string | null;
  area?: string | null;
  address_line: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type DeliveryContact = {
  name: string;
  phone: string;
};

export type DeliveryMoney = {
  amount_iqd: number;
  currency: "IQD";
};

export type DeliveryShipmentDraft = {
  merchant_id: string;
  order_id: string;
  order_reference: string;
  recipient: DeliveryContact;
  destination: DeliveryAddress;
  cash_on_delivery?: DeliveryMoney | null;
  notes?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type DeliveryShipmentReference = {
  provider: string;
  external_shipment_id: string;
  tracking_number?: string | null;
  tracking_url?: string | null;
};

export type DeliveryShipmentSnapshot = DeliveryShipmentReference & {
  status: DeliveryLifecycleStatus;
  provider_status?: string | null;
  occurred_at?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type DeliveryProviderWebhookEvent = {
  provider: string;
  provider_event_id: string;
  external_shipment_id: string;
  authenticity_verified: true;
  status: DeliveryLifecycleStatus;
  provider_status?: string | null;
  occurred_at: string;
  cod_collected_iqd?: number | null;
  payload_sha256: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type DeliveryProviderAdapter = {
  readonly provider: string;
  readonly capabilities: ReadonlySet<DeliveryProviderCapability>;

  createShipment?(
    draft: DeliveryShipmentDraft,
  ): Promise<DeliveryShipmentSnapshot>;

  cancelShipment?(
    shipment: DeliveryShipmentReference,
  ): Promise<DeliveryShipmentSnapshot>;

  trackShipment?(
    shipment: DeliveryShipmentReference,
  ): Promise<DeliveryShipmentSnapshot>;

  parseWebhook?(
    input: {
      headers: Readonly<Record<string, string | string[] | undefined>>;
      raw_body: string;
    },
  ): Promise<DeliveryProviderWebhookEvent>;
};

export class DeliveryProviderBoundaryError extends Error {
  readonly code:
    | "DELIVERY_PROVIDER_INVALID"
    | "DELIVERY_PROVIDER_DUPLICATE"
    | "DELIVERY_PROVIDER_NOT_REGISTERED"
    | "DELIVERY_PROVIDER_CAPABILITY_UNAVAILABLE";

  constructor(
    code: DeliveryProviderBoundaryError["code"],
    message: string,
  ) {
    super(message);
    this.name = "DeliveryProviderBoundaryError";
    this.code = code;
  }
}

function normalizeProviderKey(value: unknown): string {
  const provider = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(provider)) {
    throw new DeliveryProviderBoundaryError(
      "DELIVERY_PROVIDER_INVALID",
      "delivery provider key is invalid",
    );
  }
  return provider;
}

function assertAdapterShape(adapter: DeliveryProviderAdapter): void {
  const provider = normalizeProviderKey(adapter.provider);
  if (adapter.capabilities.size === 0) {
    throw new DeliveryProviderBoundaryError(
      "DELIVERY_PROVIDER_INVALID",
      `delivery provider ${provider} must declare at least one capability`,
    );
  }

  const requiredMethodForCapability: Partial<
    Record<DeliveryProviderCapability, keyof DeliveryProviderAdapter>
  > = {
    create_shipment: "createShipment",
    cancel_shipment: "cancelShipment",
    track_shipment: "trackShipment",
    webhooks: "parseWebhook",
  };

  for (const capability of adapter.capabilities) {
    const method = requiredMethodForCapability[capability];
    if (method && typeof adapter[method] !== "function") {
      throw new DeliveryProviderBoundaryError(
        "DELIVERY_PROVIDER_INVALID",
        `delivery provider ${provider} declares ${capability} without implementing ${String(method)}`,
      );
    }
  }
}

export class DeliveryProviderRegistry {
  private readonly adapters = new Map<string, DeliveryProviderAdapter>();

  register(adapter: DeliveryProviderAdapter): void {
    assertAdapterShape(adapter);
    const provider = normalizeProviderKey(adapter.provider);
    if (this.adapters.has(provider)) {
      throw new DeliveryProviderBoundaryError(
        "DELIVERY_PROVIDER_DUPLICATE",
        `delivery provider ${provider} is already registered`,
      );
    }
    this.adapters.set(provider, adapter);
  }

  has(provider: string): boolean {
    return this.adapters.has(normalizeProviderKey(provider));
  }

  get(provider: string): DeliveryProviderAdapter {
    const key = normalizeProviderKey(provider);
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new DeliveryProviderBoundaryError(
        "DELIVERY_PROVIDER_NOT_REGISTERED",
        `delivery provider ${key} is not registered`,
      );
    }
    return adapter;
  }

  list(): readonly DeliveryProviderAdapter[] {
    return [...this.adapters.values()];
  }

  requireCapability(
    provider: string,
    capability: DeliveryProviderCapability,
  ): DeliveryProviderAdapter {
    const adapter = this.get(provider);
    if (!adapter.capabilities.has(capability)) {
      throw new DeliveryProviderBoundaryError(
        "DELIVERY_PROVIDER_CAPABILITY_UNAVAILABLE",
        `delivery provider ${adapter.provider} does not support ${capability}`,
      );
    }
    return adapter;
  }
}

export const deliveryProviderRegistry = new DeliveryProviderRegistry();
