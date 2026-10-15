export type VerifiedReceipt = {
  provider: string; provider_event_id: string; event_type: string; amount_iqd: number;
  first_received_at: string; payment_ref_suffix: string | null; request_ref_suffix: string | null;
};
export class ReceiptReadFailure extends Error {
  constructor(readonly kind: 'denied' | 'unavailable') { super(kind); }
}
export async function fetchVerifiedReceiptPage(headers: Record<string,string>, cursor: string | null, signal: AbortSignal, request: typeof fetch = fetch): Promise<{receipts: VerifiedReceipt[]; next_cursor: string | null}> {
  const query = new URLSearchParams({limit: '20'});
  if (cursor !== null) query.set('cursor', cursor);
  const response = await request(`/api/auth/admin/billing/verified-receipts?${query}`, {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', headers, signal,
  });
  if (!response.ok) throw new ReceiptReadFailure(response.status === 401 || response.status === 403 ? 'denied' : 'unavailable');
  const data = await response.json();
  if (data?.ok !== true || !Array.isArray(data.receipts) || data.receipts.length > 20 ||
      !(data.next_cursor === null || typeof data.next_cursor === 'string' && data.next_cursor.length <= 1024)) throw new ReceiptReadFailure('unavailable');
  const receipts = data.receipts.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new ReceiptReadFailure('unavailable');
    const value = row as Record<string,unknown>;
    if (typeof value.provider !== 'string' || typeof value.provider_event_id !== 'string' || typeof value.event_type !== 'string' ||
        !Number.isSafeInteger(value.amount_iqd) || Number(value.amount_iqd) < 0 || typeof value.first_received_at !== 'string' ||
        !Number.isFinite(Date.parse(value.first_received_at)) ||
        ![value.payment_ref_suffix,value.request_ref_suffix].every(ref => ref === null || typeof ref === 'string' && ref.length <= 8)) throw new ReceiptReadFailure('unavailable');
    return {provider: value.provider, provider_event_id: value.provider_event_id, event_type: value.event_type,
      amount_iqd: value.amount_iqd as number, first_received_at: value.first_received_at,
      payment_ref_suffix: value.payment_ref_suffix as string | null, request_ref_suffix: value.request_ref_suffix as string | null};
  });
  return {receipts, next_cursor: data.next_cursor};
}
