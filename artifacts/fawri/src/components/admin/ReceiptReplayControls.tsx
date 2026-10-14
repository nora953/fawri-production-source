import React from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useI18n} from '@/lib/i18n';
import {getAdminAuthHeaders} from '@/lib/store';
import {sendReceiptReplayAction,ReceiptReplayFailure,type ReceiptReplayIntent} from '@/lib/receiptReplayClient';
import {RECEIPT_REPLAY_COPY} from '@/lib/translations/features/admin/ReceiptReplayControls';
export default function ReceiptReplayControls({eventId,disabled,onBusyChange}:{eventId:string;disabled:boolean;onBusyChange:(busy:boolean)=>void}) {
  const {lang}=useI18n(),text=RECEIPT_REPLAY_COPY[lang],id=React.useId();
  const [open,setOpen]=React.useState(false),[authority,setAuthority]=React.useState(''),[order,setOrder]=React.useState('');
  const [status,setStatus]=React.useState<'idle'|'busy'|'verified'|'applied'|'duplicate'|'denied'|'conflict'|'unavailable'|'uncertain'>('idle');
  const [reviewed,setReviewed]=React.useState<ReceiptReplayIntent|null>(null),[confirm,setConfirm]=React.useState(false);
  const active=React.useRef<AbortController|null>(null);
  React.useEffect(()=>()=>{active.current?.abort();},[]);
  const invalidate=()=>{setReviewed(null);setConfirm(false);setStatus('idle');};
  const valid=(authority==='bot_subscription'||authority==='cashier_subscription')&&order.trim().length>0&&order.trim().length<=180;
  const act=async(action:'replay-review'|'replay')=>{
    if(active.current||!valid||disabled)return;
    const intent={authority:authority as ReceiptReplayIntent['authority'],order_id:order.trim()};
    if(action==='replay'&&(!reviewed||reviewed.authority!==intent.authority||reviewed.order_id!==intent.order_id))return;
    const controller=new AbortController();active.current=controller;onBusyChange(true);setStatus('busy');setConfirm(false);setReviewed(null);
    try {
      const result=await sendReceiptReplayAction(action,eventId,intent,getAdminAuthHeaders(),controller.signal);
      if(!controller.signal.aborted){setStatus(result.status);if(result.status==='verified')setReviewed(intent);}
    }catch(error){if(!controller.signal.aborted)setStatus(error instanceof ReceiptReplayFailure?error.kind:action==='replay'?'uncertain':'unavailable');}
    finally{if(active.current===controller){active.current=null;if(!controller.signal.aborted)onBusyChange(false);}}
  };
  if(!open)return <Button className="mt-3" variant="outline" disabled={disabled} onClick={()=>setOpen(true)}>{text.open}</Button>;
  return <div className="mt-4 space-y-3 rounded-lg border p-3" data-receipt-replay={eventId}>
    <p className="text-xs text-muted-foreground">{text.description}</p>
    <label className="block text-sm" htmlFor={`${id}-authority`}>{text.authority}</label>
    <select id={`${id}-authority`} data-replay-authority className="w-full rounded-md border bg-background p-2 text-sm" disabled={disabled||status==='busy'||status==='denied'} value={authority} onChange={event=>{setAuthority(event.target.value);invalidate();}}>
      <option value="">{text.choose}</option><option value="bot_subscription">{text.bot}</option><option value="cashier_subscription">{text.cashier}</option>
    </select>
    <label className="block text-sm" htmlFor={`${id}-order`}>{text.order}</label>
    <Input id={`${id}-order`} data-replay-order dir="ltr" data-fawri-preserve-digits="true" maxLength={180} autoComplete="off" value={order} disabled={disabled||status==='busy'||status==='denied'} onChange={event=>{setOrder(event.target.value);invalidate();}} />
    <div role="status" aria-live="polite" className="text-sm">{status==='idle'?null:text[status]}</div>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={disabled||!valid||status==='busy'||status==='denied'} onClick={()=>void act('replay-review')}>{text.review}</Button>
      {reviewed&&<Button disabled={disabled} onClick={()=>setConfirm(true)}>{text.execute}</Button>}
      <Button variant="ghost" disabled={disabled||status==='busy'} onClick={()=>{setOpen(false);invalidate();}}>{text.close}</Button>
    </div>
    {confirm&&reviewed&&<div role="alertdialog" aria-modal="false" aria-labelledby={`${id}-confirm`} className="space-y-2 rounded-lg border p-3">
      <h3 id={`${id}-confirm`} className="font-semibold">{text.confirmTitle}</h3><p className="text-sm">{text.confirmBody}</p>
      <dl className="text-sm"><dt>{text.authority}</dt><dd>{reviewed.authority==='bot_subscription'?text.bot:text.cashier}</dd><dt>{text.order}</dt><dd dir="ltr" data-fawri-preserve-digits="true" className="break-all">{reviewed.order_id}</dd></dl>
      <div className="flex gap-2"><Button disabled={disabled} onClick={()=>void act('replay')}>{text.confirm}</Button><Button variant="outline" onClick={()=>setConfirm(false)}>{text.cancel}</Button></div>
    </div>}
  </div>;
}
