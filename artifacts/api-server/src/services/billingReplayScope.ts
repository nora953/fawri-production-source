import type {OperationalQueryTarget} from './operationalPostgresAuthority';
import type {SubscriptionPlanCycleTransaction} from './subscriptionPlanCycleAuthority';
// Server-only scope from the authenticated bounded receipt capability, never HTTP input.
export type BillingReplayScope={merchantId:string;requestId:string;firstReceivedAt:string;transaction<T>(work:(client:OperationalQueryTarget)=>Promise<T>):Promise<T>;authorize(client:SubscriptionPlanCycleTransaction):Promise<void>};
