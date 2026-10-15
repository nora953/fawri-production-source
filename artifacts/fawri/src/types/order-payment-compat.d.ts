import type { OrderPaymentStatus } from "@/lib/types";

declare module "@/lib/types" {
  /** Temporary coordinator compatibility alias; canonical type remains OrderPaymentStatus. */
  export type PaymentStatus = OrderPaymentStatus;
}
