export type StreamReadinessClient={query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>};
export function assertCashierStreamStorageCandidateReady(client:StreamReadinessClient,roles:{primaryRole:string;authenticationRole:string}):Promise<{ok:true;statementSnapshotOnly:true;releaseAccepted:false}>;
export const assertCashierStreamStorageReady:typeof assertCashierStreamStorageCandidateReady;
