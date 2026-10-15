import ReceiptReplayControls from './ReceiptReplayControls';
import React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { getAdminAuthHeaders } from '@/lib/store';
import { fetchVerifiedReceiptPage, ReceiptReadFailure, type VerifiedReceipt } from '@/lib/verifiedReceiptClient';
import { VERIFIED_RECEIPT_REVIEW_COPY } from '@/lib/translations/features/admin/VerifiedReceiptReview';

export default function VerifiedReceiptReview() {
  const {lang} = useI18n();
  const text = VERIFIED_RECEIPT_REVIEW_COPY[lang];
  const [cursors, setCursors] = React.useState<(string | null)[]>([null]);
  const [actionBusy,setActionBusy]=React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const [page, setPage] = React.useState<{receipts: VerifiedReceipt[]; next_cursor: string | null} | null>(null);
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading');
  React.useEffect(() => {
    const controller = new AbortController();
    setPage(null); setStatus('loading');
    void fetchVerifiedReceiptPage(getAdminAuthHeaders(), cursors[cursors.length-1], controller.signal)
      .then(result => { if (!controller.signal.aborted) { setPage(result); setStatus('ready'); } })
      .catch(error => { if (!controller.signal.aborted) { setPage(null); setStatus(error instanceof ReceiptReadFailure ? error.kind : 'unavailable'); } });
    return () => controller.abort();
  }, [cursors, revision]);
  return <section className="space-y-4" dir={lang === 'en' ? 'ltr' : 'rtl'} aria-labelledby="receipt-review-title">
    <h2 id="receipt-review-title" className="text-lg font-bold">{text.title}</h2>
    <p className="text-sm text-muted-foreground">{text.description}</p>
    <Button variant="outline" disabled={status === 'loading'||actionBusy} onClick={() => { setPage(null); setCursors([null]); setRevision(value => value+1); }}>{text.refresh}</Button>
    <div aria-live="polite" role="status">{status !== 'ready' ? text[status] : page?.receipts.length === 0 ? text.empty : null}</div>
    {status === 'ready' && page && <>
      <ul className="grid gap-3 md:grid-cols-2">
        {page.receipts.map(receipt => <li key={`${receipt.provider}:${receipt.provider_event_id}`} className="min-w-0 rounded-xl border bg-card p-4">
          <dl className="space-y-2 text-sm">
            {[[text.provider,receipt.provider],[text.event,receipt.provider_event_id],[text.type,receipt.event_type],
              [text.amount,receipt.amount_iqd.toLocaleString(lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ')],
              [text.received,receipt.first_received_at],[text.payment,receipt.payment_ref_suffix ? `…${receipt.payment_ref_suffix}` : '—'],
              [text.request,receipt.request_ref_suffix ? `…${receipt.request_ref_suffix}` : '—']].map(([label,value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd dir="ltr" data-fawri-preserve-digits={label === text.amount ? undefined : "true"} className="break-all font-medium">{value}</dd></div>)}
          </dl>
          {receipt.provider==='superqi_sandbox'&&receipt.event_type==='payment_succeeded'&&<ReceiptReplayControls eventId={receipt.provider_event_id} disabled={actionBusy} onBusyChange={setActionBusy} />}
        </li>)}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" disabled={cursors.length === 1||actionBusy} onClick={() => { setPage(null); setCursors(values => values.slice(0,-1)); }}>{text.previous}</Button>
        <Button variant="outline" disabled={!page.next_cursor||actionBusy} onClick={() => { const cursor = page.next_cursor; if (cursor) { setPage(null); setCursors(values => [...values,cursor]); } }}>{text.next}</Button>
      </div>
    </>}
  </section>;
}
