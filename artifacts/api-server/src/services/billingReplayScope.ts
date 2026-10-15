import type {SubscriptionPlanCycleTransaction} from './subscriptionPlanCycleAuthority';
// Server-only scope from the authenticated bounded receipt capability, never HTTP input.
export type BillingReplayScope={merchantId:string;requestId:string;firstReceivedAt:string;authorize(client:SubscriptionPlanCycleTransaction):Promise<void>};
