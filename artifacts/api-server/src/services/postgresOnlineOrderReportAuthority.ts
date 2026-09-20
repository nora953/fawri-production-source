import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";

const MAX_TOP_PRODUCTS = 10;

export class OnlineOrderReportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OnlineOrderReportError";
    this.code = code;
    this.status = status;
  }
}

type ReportRange = {
  from?: string;
  to?: string;
};

type ChannelReceivedRow = {
  source_channel: string;
  order_count: number | string;
  active_order_count: number | string;
};

type ChannelDeliveredRow = {
  source_channel: string;
  delivered_order_count: number | string;
  delivered_sales_iqd: number | string;
  delivered_delivery_fees_iqd: number | string;
  delivered_order_value_iqd: number | string;
};

type LocationDeliveredRow = {
  location_id: string | null;
  location_name: string | null;
  delivered_order_count: number | string;
  delivered_sales_iqd: number | string;
  delivered_order_value_iqd: number | string;
};

type CountRow = {
  count: number | string;
};

type ProductRow = {
  product_id: string | null;
  product_name: string;
  units: number | string;
  revenue_iqd: number | string;
};

export type OnlineOrderReportChannel = {
  source_channel: string;
  order_count: number;
  active_order_count: number;
  delivered_order_count: number;
  delivered_sales_iqd: number;
  delivered_order_value_iqd: number;
};

export type OnlineOrderReportLocation = {
  location_id: string | null;
  location_name: string;
  delivered_order_count: number;
  delivered_sales_iqd: number;
  delivered_order_value_iqd: number;
};

export type OnlineOrderReportProduct = {
  product_id?: string;
  product_name: string;
  units: number;
  revenue_iqd: number;
};

export type OnlineOrderReportResult = {
  from?: string;
  to?: string;
  generated_at: string;
  received_order_count: number;
  active_order_count: number;
  delivered_order_count: number;
  cancelled_order_count: number;
  delivered_sales_iqd: number;
  delivered_delivery_fees_iqd: number;
  delivered_order_value_iqd: number;
  average_delivered_order_iqd: number;
  paid_electronic_count: number;
  by_channel: OnlineOrderReportChannel[];
  by_location: OnlineOrderReportLocation[];
  top_products: OnlineOrderReportProduct[];
};

function merchantIdentifier(value: unknown): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > 200) {
    throw new OnlineOrderReportError(
      "ONLINE_REPORT_MERCHANT_INVALID",
      "merchant identifier is invalid",
      400,
    );
  }
  return normalized;
}

function rangeInstant(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new OnlineOrderReportError(
      "ONLINE_REPORT_RANGE_INVALID",
      field + " must be a valid timestamp",
      400,
    );
  }
  return parsed.toISOString();
}

function parseRange(input: { from?: unknown; to?: unknown }): ReportRange {
  const from = rangeInstant(input.from, "from");
  const to = rangeInstant(input.to, "to");
  if (from && to && from >= to) {
    throw new OnlineOrderReportError(
      "ONLINE_REPORT_RANGE_INVALID",
      "from must be earlier than to",
      400,
    );
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

function safeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new OnlineOrderReportError(
      "ONLINE_REPORT_EVIDENCE_INVALID",
      "online report contains invalid " + field,
      409,
    );
  }
  return parsed;
}

function channelName(value: unknown): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized || normalized.length > 100) {
    throw new OnlineOrderReportError(
      "ONLINE_REPORT_EVIDENCE_INVALID",
      "online report contains invalid source channel",
      409,
    );
  }
  return normalized;
}

function countOf(rows: CountRow[]): number {
  return safeInteger(rows[0]?.count ?? 0, "count");
}

export async function buildOnlineOrderReportAuthoritative(input: {
  merchantId: unknown;
  from?: unknown;
  to?: unknown;
}): Promise<OnlineOrderReportResult> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OnlineOrderReportError(
      "ONLINE_REPORT_POSTGRES_REQUIRED",
      "online reporting requires PostgreSQL authority",
      503,
    );
  }

  const merchantId = merchantIdentifier(input.merchantId);
  const range = parseRange(input);
  const from = range.from || null;
  const to = range.to || null;

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const [
      receivedRows,
      deliveredRows,
      cancelledRows,
      paidElectronicRows,
      locationRows,
      topProductRows,
    ] = await Promise.all([
      operationalQueryRows<ChannelReceivedRow>(
        client,
        `SELECT source_channel,
                count(*)::bigint AS order_count,
                count(*) FILTER (
                  WHERE status NOT IN ('delivered','cancelled','out_of_stock')
                )::bigint AS active_order_count
           FROM orders
          WHERE merchant_id = $1
            AND lower(source_channel) <> 'cashier'
            AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
          GROUP BY source_channel
          ORDER BY source_channel`,
        [merchantId, from, to],
      ),
      operationalQueryRows<ChannelDeliveredRow>(
        client,
        `SELECT source_channel,
                count(*)::bigint AS delivered_order_count,
                COALESCE(sum(subtotal_iqd), 0)::bigint AS delivered_sales_iqd,
                COALESCE(sum(delivery_fee_iqd), 0)::bigint AS delivered_delivery_fees_iqd,
                COALESCE(sum(total_iqd), 0)::bigint AS delivered_order_value_iqd
           FROM orders
          WHERE merchant_id = $1
            AND lower(source_channel) <> 'cashier'
            AND status = 'delivered'
            AND delivered_at IS NOT NULL
            AND ($2::timestamptz IS NULL OR delivered_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR delivered_at < $3::timestamptz)
          GROUP BY source_channel
          ORDER BY source_channel`,
        [merchantId, from, to],
      ),
      operationalQueryRows<CountRow>(
        client,
        `SELECT count(*)::bigint AS count
           FROM orders
          WHERE merchant_id = $1
            AND lower(source_channel) <> 'cashier'
            AND status = 'cancelled'
            AND cancelled_at IS NOT NULL
            AND ($2::timestamptz IS NULL OR cancelled_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR cancelled_at < $3::timestamptz)`,
        [merchantId, from, to],
      ),
      operationalQueryRows<CountRow>(
        client,
        `SELECT count(*)::bigint AS count
           FROM orders
          WHERE merchant_id = $1
            AND lower(source_channel) <> 'cashier'
            AND payment_method <> 'cash_on_delivery'
            AND payment_status = 'paid'
            AND payment_verified_at IS NOT NULL
            AND ($2::timestamptz IS NULL OR payment_verified_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR payment_verified_at < $3::timestamptz)`,
        [merchantId, from, to],
      ),
      operationalQueryRows<LocationDeliveredRow>(
        client,
        `SELECT o.fulfillment_location_id AS location_id,
                l.name AS location_name,
                count(*)::bigint AS delivered_order_count,
                COALESCE(sum(o.subtotal_iqd), 0)::bigint AS delivered_sales_iqd,
                COALESCE(sum(o.total_iqd), 0)::bigint AS delivered_order_value_iqd
           FROM orders o
           LEFT JOIN merchant_locations l
             ON l.merchant_id = o.merchant_id
            AND l.id = o.fulfillment_location_id
          WHERE o.merchant_id = $1
            AND lower(o.source_channel) <> 'cashier'
            AND o.status = 'delivered'
            AND o.delivered_at IS NOT NULL
            AND ($2::timestamptz IS NULL OR o.delivered_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR o.delivered_at < $3::timestamptz)
          GROUP BY o.fulfillment_location_id, l.name
          ORDER BY delivered_sales_iqd DESC, location_name NULLS LAST`,
        [merchantId, from, to],
      ),
      operationalQueryRows<ProductRow>(
        client,
        `SELECT i.product_id,
                i.product_name_snapshot AS product_name,
                COALESCE(sum(i.quantity), 0)::bigint AS units,
                COALESCE(sum(i.line_total_iqd), 0)::bigint AS revenue_iqd
           FROM orders o
           JOIN order_items i
             ON i.merchant_id = o.merchant_id
            AND i.order_id = o.id
          WHERE o.merchant_id = $1
            AND lower(o.source_channel) <> 'cashier'
            AND o.status = 'delivered'
            AND o.delivered_at IS NOT NULL
            AND ($2::timestamptz IS NULL OR o.delivered_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR o.delivered_at < $3::timestamptz)
          GROUP BY i.product_id, i.product_name_snapshot
          ORDER BY revenue_iqd DESC, units DESC, product_name
          LIMIT $4`,
        [merchantId, from, to, MAX_TOP_PRODUCTS],
      ),
    ]);

    const receivedByChannel = new Map<
      string,
      { order_count: number; active_order_count: number }
    >();
    for (const row of receivedRows) {
      receivedByChannel.set(channelName(row.source_channel), {
        order_count: safeInteger(row.order_count, "channel order count"),
        active_order_count: safeInteger(
          row.active_order_count,
          "channel active order count",
        ),
      });
    }

    const deliveredByChannel = new Map<
      string,
      {
        delivered_order_count: number;
        delivered_sales_iqd: number;
        delivered_delivery_fees_iqd: number;
        delivered_order_value_iqd: number;
      }
    >();
    for (const row of deliveredRows) {
      deliveredByChannel.set(channelName(row.source_channel), {
        delivered_order_count: safeInteger(
          row.delivered_order_count,
          "channel delivered order count",
        ),
        delivered_sales_iqd: safeInteger(
          row.delivered_sales_iqd,
          "channel delivered sales",
        ),
        delivered_delivery_fees_iqd: safeInteger(
          row.delivered_delivery_fees_iqd,
          "channel delivered delivery fees",
        ),
        delivered_order_value_iqd: safeInteger(
          row.delivered_order_value_iqd,
          "channel delivered order value",
        ),
      });
    }

    const channels = [...new Set([
      ...receivedByChannel.keys(),
      ...deliveredByChannel.keys(),
    ])].sort();

    const byChannel = channels.map((sourceChannel) => {
      const received = receivedByChannel.get(sourceChannel);
      const delivered = deliveredByChannel.get(sourceChannel);
      return {
        source_channel: sourceChannel,
        order_count: received?.order_count ?? 0,
        active_order_count: received?.active_order_count ?? 0,
        delivered_order_count: delivered?.delivered_order_count ?? 0,
        delivered_sales_iqd: delivered?.delivered_sales_iqd ?? 0,
        delivered_order_value_iqd: delivered?.delivered_order_value_iqd ?? 0,
      };
    });

    const receivedOrderCount = byChannel.reduce(
      (sum, row) => sum + row.order_count,
      0,
    );
    const activeOrderCount = byChannel.reduce(
      (sum, row) => sum + row.active_order_count,
      0,
    );
    const deliveredOrderCount = byChannel.reduce(
      (sum, row) => sum + row.delivered_order_count,
      0,
    );
    const deliveredSalesIqd = byChannel.reduce(
      (sum, row) => sum + row.delivered_sales_iqd,
      0,
    );
    const deliveredDeliveryFeesIqd = [...deliveredByChannel.values()].reduce(
      (sum, row) => sum + row.delivered_delivery_fees_iqd,
      0,
    );
    const deliveredOrderValueIqd = byChannel.reduce(
      (sum, row) => sum + row.delivered_order_value_iqd,
      0,
    );

    return {
      ...range,
      generated_at: new Date().toISOString(),
      received_order_count: receivedOrderCount,
      active_order_count: activeOrderCount,
      delivered_order_count: deliveredOrderCount,
      cancelled_order_count: countOf(cancelledRows),
      delivered_sales_iqd: deliveredSalesIqd,
      delivered_delivery_fees_iqd: deliveredDeliveryFeesIqd,
      delivered_order_value_iqd: deliveredOrderValueIqd,
      average_delivered_order_iqd:
        deliveredOrderCount > 0
          ? Math.round(deliveredOrderValueIqd / deliveredOrderCount)
          : 0,
      paid_electronic_count: countOf(paidElectronicRows),
      by_channel: byChannel,
      by_location: locationRows.map((row) => ({
        location_id: row.location_id,
        location_name: String(row.location_name || "Unattributed location"),
        delivered_order_count: safeInteger(
          row.delivered_order_count,
          "location delivered order count",
        ),
        delivered_sales_iqd: safeInteger(
          row.delivered_sales_iqd,
          "location delivered sales",
        ),
        delivered_order_value_iqd: safeInteger(
          row.delivered_order_value_iqd,
          "location delivered order value",
        ),
      })),
      top_products: topProductRows.map((row) => ({
        ...(row.product_id ? { product_id: row.product_id } : {}),
        product_name: String(row.product_name || "").trim() || "Unnamed product",
        units: safeInteger(row.units, "product units"),
        revenue_iqd: safeInteger(row.revenue_iqd, "product revenue"),
      })),
    };
  });
}
