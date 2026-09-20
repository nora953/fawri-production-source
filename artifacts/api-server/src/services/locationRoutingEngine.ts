export type RoutingOperationalStatus =
  | "open"
  | "temporarily_unavailable"
  | "closed";

export type RoutingStaleInventoryPolicy =
  | "reroute_then_pending"
  | "allow_stale"
  | "fresh_only";

export type RoutingRequestedItem = {
  product_id: string;
  variant_id?: string;
  quantity: number;
};

export type RoutingInventoryItem = {
  product_id: string;
  variant_id?: string;
  quantity: number;
};

export type RoutingCandidate = {
  location_id: string;
  service_area_eligible: boolean;
  online_fulfillment_enabled: boolean;
  operational_status: RoutingOperationalStatus;
  accept_online_orders_while_closed: boolean;
  inventory_fresh: boolean;
  merchant_priority: number;
  distance_meters?: number;
  inventory: readonly RoutingInventoryItem[];
};

export type LocationRoutingDecision =
  | {
      status: "routed";
      location_id: string;
      reason: "nearest_eligible" | "merchant_priority";
    }
  | {
      status: "pending_fulfillment_confirmation";
      candidate_location_ids: string[];
      reason: "inventory_stale";
    }
  | {
      status: "unfulfillable";
      reason:
        | "outside_service_area"
        | "online_fulfillment_disabled"
        | "location_unavailable"
        | "insufficient_single_location_inventory"
        | "inventory_stale";
    };

function itemKey(productId: string, variantId?: string): string {
  return `${productId}\0${variantId || ""}`;
}

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function canOperate(candidate: RoutingCandidate): boolean {
  if (candidate.operational_status === "open") return true;
  if (candidate.operational_status === "temporarily_unavailable") return false;
  return candidate.accept_online_orders_while_closed;
}

function requestedTotals(
  requestedItems: readonly RoutingRequestedItem[],
): Map<string, number> | null {
  const totals = new Map<string, number>();
  for (const item of requestedItems) {
    if (!item.product_id || !validQuantity(item.quantity)) return null;
    const key = itemKey(item.product_id, item.variant_id);
    const next = (totals.get(key) || 0) + item.quantity;
    if (!Number.isSafeInteger(next) || next <= 0) return null;
    totals.set(key, next);
  }
  return totals;
}

function canFulfillEntireOrder(
  candidate: RoutingCandidate,
  requestedItems: readonly RoutingRequestedItem[],
): boolean {
  const required = requestedTotals(requestedItems);
  if (!required) return false;

  const available = new Map<string, number>();
  for (const item of candidate.inventory) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 0) return false;
    const key = itemKey(item.product_id, item.variant_id);
    available.set(key, item.quantity);
  }
  return [...required.entries()].every(
    ([key, quantity]) => (available.get(key) || 0) >= quantity,
  );
}

function normalizedDistance(candidate: RoutingCandidate): number | null {
  if (
    candidate.distance_meters === undefined ||
    !Number.isFinite(candidate.distance_meters) ||
    candidate.distance_meters < 0
  ) {
    return null;
  }
  return candidate.distance_meters;
}

function sortEligible(
  left: RoutingCandidate,
  right: RoutingCandidate,
): number {
  const leftDistance = normalizedDistance(left);
  const rightDistance = normalizedDistance(right);

  if (leftDistance !== null && rightDistance !== null) {
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  } else if (leftDistance !== null) {
    return -1;
  } else if (rightDistance !== null) {
    return 1;
  }

  if (left.merchant_priority !== right.merchant_priority) {
    return right.merchant_priority - left.merchant_priority;
  }
  return left.location_id.localeCompare(right.location_id);
}

export function routeOrderToLocation(input: {
  requested_items: readonly RoutingRequestedItem[];
  candidates: readonly RoutingCandidate[];
  stale_inventory_policy?: RoutingStaleInventoryPolicy;
}): LocationRoutingDecision {
  if (requestedTotals(input.requested_items) === null) {
    throw new Error("routing request items are invalid");
  }

  const areaEligible = input.candidates.filter(
    (candidate) => candidate.service_area_eligible,
  );
  if (areaEligible.length === 0) {
    return { status: "unfulfillable", reason: "outside_service_area" };
  }

  const onlineEnabled = areaEligible.filter(
    (candidate) => candidate.online_fulfillment_enabled,
  );
  if (onlineEnabled.length === 0) {
    return { status: "unfulfillable", reason: "online_fulfillment_disabled" };
  }

  const operational = onlineEnabled.filter(canOperate);
  if (operational.length === 0) {
    return { status: "unfulfillable", reason: "location_unavailable" };
  }

  const requiresInventory = input.requested_items.length > 0;
  const stockEligible = requiresInventory
    ? operational.filter((candidate) =>
        canFulfillEntireOrder(candidate, input.requested_items),
      )
    : operational;
  if (stockEligible.length === 0) {
    return {
      status: "unfulfillable",
      reason: "insufficient_single_location_inventory",
    };
  }

  const fresh = requiresInventory
    ? stockEligible.filter((candidate) => candidate.inventory_fresh)
    : stockEligible;
  if (fresh.length === 0) {
    const stalePolicy = input.stale_inventory_policy || "reroute_then_pending";
    if (stalePolicy === "fresh_only") {
      return {
        status: "unfulfillable",
        reason: "inventory_stale",
      };
    }
    if (stalePolicy === "allow_stale") {
      const rankedStale = [...stockEligible].sort(sortEligible);
      const selectedStale = rankedStale[0];
      const staleDistance = normalizedDistance(selectedStale);
      return {
        status: "routed",
        location_id: selectedStale.location_id,
        reason:
          staleDistance === null ? "merchant_priority" : "nearest_eligible",
      };
    }
    return {
      status: "pending_fulfillment_confirmation",
      candidate_location_ids: stockEligible
        .map((candidate) => candidate.location_id)
        .sort(),
      reason: "inventory_stale",
    };
  }

  const ranked = [...fresh].sort(sortEligible);
  const selected = ranked[0];
  const distance = normalizedDistance(selected);
  return {
    status: "routed",
    location_id: selected.location_id,
    reason: distance === null ? "merchant_priority" : "nearest_eligible",
  };
}
