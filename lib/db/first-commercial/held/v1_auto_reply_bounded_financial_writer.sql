-- FAWRI V1 scoped auto-reply consumption / reconciliation.
-- HELD SOURCE ONLY. NO NeON / hosted SQL authorization, no live funds.
-- NOT a customer payment settlement or paid plan activation authority.
-- Issuer-bound tenant transaction, owner-owned SECURITY DEFINER functions.
-- No subscription/ledger/batch table DML is granted to runtime roles.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';

DO $pre$
DECLARE t text;
BEGIN
 IF current_database()<>'fawri'
   OR current_setting('server_version_num')::integer/10000<>18
   OR session_user<>'fawri_owner' OR current_user<>session_user
   OR to_regclass('drizzle.__drizzle_migrations') IS NULL
   OR to_regprocedure('fawri_security.allows_merchant(text)') IS NULL
   OR to_regprocedure('public.fawri_v1_auto_reply_reserve(text,text)') IS NOT NULL
   OR to_regprocedure('public.fawri_v1_auto_reply_restore(text,text,text,text)') IS NOT NULL
   OR to_regprocedure('public.fawri_v1_auto_reply_send_admit(text,text)') IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM pg_roles r
      WHERE r.rolname='fawri_restricted_runtime' AND r.rolcanlogin
        AND NOT (r.rolinherit OR r.rolsuper OR r.rolbypassrls
          OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)
        AND NOT EXISTS (SELECT 1 FROM pg_auth_members m
          WHERE m.member=r.oid))
 THEN RAISE EXCEPTION 'V1_REPLY_WRITER_PREIMAGE_REJECTED'; END IF;
 FOREACH t IN ARRAY ARRAY[
   'subscriptions','subscription_reply_batches','reply_ledger',
   'channel_inbound_events','outbound_deliveries'
 ] LOOP
   IF NOT EXISTS (
     SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=t
       AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='fawri_owner')
       AND c.relrowsecurity
       AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
   ) THEN RAISE EXCEPTION 'V1_REPLY_WRITER_RLS_OR_OWNER_MISSING'; END IF;
 END LOOP;
END
$pre$;

CREATE FUNCTION public.fawri_v1_auto_reply_reserve(
 p_merchant_id text,p_event_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off AS $reserve$
DECLARE
 v_now timestamptz:=clock_timestamp();
 v_sub public.subscriptions%ROWTYPE;
 v_prior record;
 v_credit boolean;
 v_batch public.subscription_reply_batches%ROWTYPE;
 v_source text:='base';
 v_batch_id text;
 v_addon int;
 v_remaining int;
 v_status text;
BEGIN
 IF p_merchant_id IS NULL OR length(p_merchant_id) NOT BETWEEN 1 AND 200
   OR p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 300
   OR session_user<>'fawri_restricted_runtime'
   OR current_setting('transaction_isolation')<>'read committed'
   OR NOT fawri_security.allows_merchant(p_merchant_id)
 THEN RAISE EXCEPTION 'V1_REPLY_WRITER_SCOPE_REQUIRED'
   USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_event_id));
 SELECT l.merchant_id,l.subscription_id,l.reply_batch_id,l.metadata
   INTO v_prior FROM public.reply_ledger l
   WHERE l.external_event_id=p_event_id AND l.direction='debit'
   FOR UPDATE;
 IF FOUND AND v_prior.merchant_id IS DISTINCT FROM p_merchant_id THEN
   RAISE EXCEPTION 'V1_REPLY_EVENT_TENANT_COLLISION' USING ERRCODE='42501';
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.reply_ledger l
    WHERE l.external_event_id=p_event_id AND l.direction='credit')
    INTO v_credit;
 IF v_credit THEN RETURN jsonb_build_object('allowed',false,
   'code','MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE',
   'error','reply event was already restored'); END IF;
 SELECT * INTO v_sub FROM public.subscriptions s
   WHERE s.merchant_id=p_merchant_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false,
   'code','MERCHANT_SUBSCRIPTION_REQUIRED',
   'error','active merchant subscription is required'); END IF;
 SELECT COALESCE(SUM(b.remaining),0)::integer INTO v_addon
   FROM public.subscription_reply_batches b
   WHERE b.subscription_id=v_sub.id AND b.merchant_id=p_merchant_id
     AND b.remaining>0 AND b.expires_at>v_now;
 v_remaining:=GREATEST(0,v_sub.base_reply_limit-v_sub.base_replies_used)
    +v_addon;
 IF v_prior.subscription_id IS NOT NULL THEN
   IF v_prior.subscription_id<>v_sub.id THEN
     RAISE EXCEPTION 'V1_REPLY_EVENT_SUBSCRIPTION_COLLISION'
       USING ERRCODE='42501'; END IF;
   RETURN jsonb_build_object('allowed',true,'duplicate',true,
     'subscriptionId',v_sub.id,'repliesRemaining',v_remaining);
 END IF;
 IF v_sub.status='pending_activation' THEN RETURN jsonb_build_object(
   'allowed',false,'code','MERCHANT_SUBSCRIPTION_PENDING',
   'error','merchant subscription is pending activation'); END IF;
 IF v_sub.status='suspended' THEN RETURN jsonb_build_object(
   'allowed',false,'code','MERCHANT_SUBSCRIPTION_SUSPENDED',
   'error','merchant subscription is suspended'); END IF;
 IF v_sub.status='expired' OR v_sub.expires_at<=v_now THEN
   RETURN jsonb_build_object('allowed',false,'code',
    'MERCHANT_SUBSCRIPTION_EXPIRED','error','merchant subscription is expired');
 END IF;
 IF v_sub.status='replies_exhausted' OR v_remaining<=0 THEN
   RETURN jsonb_build_object('allowed',false,'code',
     'MERCHANT_REPLIES_EXHAUSTED','error','merchant reply balance is exhausted');
 END IF;
 IF NOT v_sub.auto_reply_enabled THEN
   RETURN jsonb_build_object('allowed',false,'code',
     'MERCHANT_AUTO_REPLY_DISABLED','error','merchant automatic replies are disabled');
 END IF;
 IF v_sub.base_replies_remaining>0 AND
    v_sub.base_replies_used<v_sub.base_reply_limit THEN
   UPDATE public.subscriptions s
   SET base_replies_used=base_replies_used+1,
       base_replies_remaining=base_replies_remaining-1
   WHERE s.id=v_sub.id AND s.merchant_id=p_merchant_id;
 ELSE
   v_source:='addon';
   SELECT * INTO v_batch FROM public.subscription_reply_batches b
     WHERE b.subscription_id=v_sub.id AND b.merchant_id=p_merchant_id
       AND b.remaining>0 AND b.expires_at>v_now
     ORDER BY b.expires_at,b.purchased_at,b.id LIMIT 1 FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false,
     'code','MERCHANT_REPLIES_EXHAUSTED','error','merchant reply balance is exhausted'); END IF;
   v_batch_id:=v_batch.id;
   UPDATE public.subscription_reply_batches b SET remaining=remaining-1
    WHERE b.id=v_batch.id AND b.merchant_id=p_merchant_id;
 END IF;
 v_remaining:=v_remaining-1;
 SELECT COALESCE(SUM(b.remaining),0)::integer INTO v_addon
   FROM public.subscription_reply_batches b
   WHERE b.subscription_id=v_sub.id AND b.merchant_id=p_merchant_id
     AND b.remaining>0 AND b.expires_at>v_now;
 v_status:=CASE WHEN v_remaining=0 THEN 'replies_exhausted' ELSE 'active' END;
 UPDATE public.subscriptions s SET
   addon_replies_remaining=v_addon,
   status=v_status::public.subscription_status,
   auto_reply_enabled=CASE WHEN v_status='active' THEN s.auto_reply_enabled ELSE false END,
   updated_at=GREATEST(s.updated_at,v_now)
 WHERE s.id=v_sub.id AND s.merchant_id=p_merchant_id;
 INSERT INTO public.reply_ledger(
    id,merchant_id,subscription_id,reply_batch_id,direction,amount,
    reason_code,external_event_id,balance_after,metadata,created_at
 ) VALUES (
   'reply-ledger-'||gen_random_uuid()::text,
   p_merchant_id,v_sub.id,v_batch_id,'debit',1,
   'meta_auto_reply_reservation',p_event_id,v_remaining,
   jsonb_build_object('source',v_source,'cycle_starts_at',
     to_char(v_sub.starts_at AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
   v_now);
 RETURN jsonb_build_object('allowed',true,'duplicate',false,
   'subscriptionId',v_sub.id,'repliesRemaining',v_remaining);
END
$reserve$;

CREATE FUNCTION public.fawri_v1_auto_reply_restore(
 p_merchant_id text,p_event_id text,p_kind text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off AS $restore$
DECLARE
 v_now timestamptz:=clock_timestamp();
 v_debit public.reply_ledger%ROWTYPE;
 v_sub public.subscriptions%ROWTYPE;
 v_batch public.subscription_reply_batches%ROWTYPE;
 v_delivery text;
 v_addon int;
 v_remaining int;
 v_cycle text;
BEGIN
 IF p_merchant_id IS NULL OR length(p_merchant_id) NOT BETWEEN 1 AND 200
    OR p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 300
    OR p_kind NOT IN ('refund','release') OR p_kind IS NULL
    OR p_reason IS NULL OR length(p_reason) NOT BETWEEN 1 AND 160
    OR session_user<>'fawri_restricted_runtime'
    OR current_setting('transaction_isolation')<>'read committed'
    OR NOT fawri_security.allows_merchant(p_merchant_id)
 THEN RAISE EXCEPTION 'V1_REPLY_WRITER_SCOPE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_kind='refund' AND p_reason<>'META_REPLY_FAILED' THEN
   RAISE EXCEPTION 'V1_REPLY_WRITER_REFUND_REASON_INVALID'
     USING ERRCODE='42501'; END IF;
 IF p_kind='release' AND p_reason NOT IN (
   'MERCHANT_AUTO_REPLY_DISABLED','MERCHANT_SETTINGS_VERSION_CHANGED',
   'MERCHANT_SETTINGS_UNAVAILABLE','META_FAKE_TRANSPORT_ONLY',
   'MERCHANT_APPROVAL_REQUIRED','MERCHANT_REJECTED','MERCHANT_SUSPENDED',
   'MERCHANT_ACCESS_STATE_UNAVAILABLE','CONVERSATION_CONTEXT_SUPERSEDED',
   'MERCHANT_REJECTED','META_REPLY_CONTEXT_SUPERSEDED') THEN
   RAISE EXCEPTION 'V1_REPLY_WRITER_RELEASE_REASON_INVALID'
     USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_event_id));
 SELECT * INTO v_debit FROM public.reply_ledger l
   WHERE l.external_event_id=p_event_id AND l.direction='debit'
   FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('restored',false,
   'reason','reservation_not_found'); END IF;
 IF v_debit.merchant_id<>p_merchant_id THEN
   RAISE EXCEPTION 'V1_REPLY_EVENT_TENANT_COLLISION' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.reply_ledger l
     WHERE l.external_event_id=p_event_id AND l.direction='credit') THEN
   RETURN jsonb_build_object('restored',false,'reason',
     CASE WHEN p_kind='refund' THEN 'already_refunded' ELSE 'already_released' END);
 END IF;
 -- Never restore a reply that is sent, pending or of unknown delivery outcome.
 -- Refund needs independently durable provider-confirmed-failure evidence.
 SELECT od.outcome::text INTO v_delivery FROM public.outbound_deliveries od
 JOIN public.channel_inbound_events ev ON ev.id=od.inbound_event_id
   AND ev.merchant_id=od.merchant_id
 WHERE od.merchant_id=p_merchant_id AND ev.external_event_id=p_event_id
 ORDER BY od.attempted_at DESC LIMIT 1 FOR UPDATE OF od;
 IF v_delivery IN ('sent','pending','uncertain') THEN
   RETURN jsonb_build_object('restored',false,'reason','delivery_not_terminal');
 END IF;
 IF p_kind='refund' AND v_delivery IS DISTINCT FROM 'confirmed_failed' THEN
   RETURN jsonb_build_object('restored',false,'reason','provider_failure_unproven');
 END IF;
 SELECT * INTO v_sub FROM public.subscriptions s
   WHERE s.id=v_debit.subscription_id AND s.merchant_id=p_merchant_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('restored',false,'reason','subscription_not_found'); END IF;
 IF v_debit.reply_batch_id IS NOT NULL THEN
   SELECT * INTO v_batch FROM public.subscription_reply_batches b
      WHERE b.id=v_debit.reply_batch_id AND b.merchant_id=p_merchant_id
        AND b.subscription_id=v_sub.id FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('restored',false,'reason','refund_batch_not_found'); END IF;
   IF v_batch.remaining>=v_batch.amount THEN
     RETURN jsonb_build_object('restored',false,'reason','refund_balance_conflict'); END IF;
   UPDATE public.subscription_reply_batches SET remaining=remaining+1
     WHERE id=v_batch.id AND merchant_id=p_merchant_id;
 ELSE
   v_cycle:=to_char(v_sub.starts_at AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
   IF v_debit.metadata->>'cycle_starts_at' IS DISTINCT FROM v_cycle THEN
     RETURN jsonb_build_object('restored',false,'reason','refund_cycle_mismatch');
   END IF;
   IF v_sub.base_replies_used<=0 THEN RETURN jsonb_build_object(
     'restored',false,'reason','refund_balance_conflict'); END IF;
   UPDATE public.subscriptions SET
     base_replies_used=base_replies_used-1,
     base_replies_remaining=base_replies_remaining+1
   WHERE id=v_sub.id AND merchant_id=p_merchant_id;
 END IF;
 SELECT COALESCE(SUM(b.remaining),0)::integer INTO v_addon
   FROM public.subscription_reply_batches b
   WHERE b.subscription_id=v_sub.id AND b.merchant_id=p_merchant_id
     AND b.remaining>0 AND b.expires_at>v_now;
 SELECT s.base_replies_remaining+v_addon INTO v_remaining
   FROM public.subscriptions s WHERE s.id=v_sub.id;
 UPDATE public.subscriptions s SET
    addon_replies_remaining=v_addon,
    status=CASE
      WHEN s.status='replies_exhausted' AND v_remaining>0
           AND s.expires_at>v_now
      THEN 'active'::public.subscription_status ELSE s.status END,
    auto_reply_enabled=CASE
      WHEN s.status='replies_exhausted' AND v_remaining>0
           AND s.expires_at>v_now THEN true ELSE s.auto_reply_enabled END,
    updated_at=GREATEST(s.updated_at,v_now)
 WHERE s.id=v_sub.id AND s.merchant_id=p_merchant_id;
 INSERT INTO public.reply_ledger(
   id,merchant_id,subscription_id,reply_batch_id,direction,
   amount,reason_code,external_event_id,balance_after,metadata,created_at
 ) VALUES (
   'reply-ledger-'||gen_random_uuid()::text,p_merchant_id,
   v_sub.id,v_debit.reply_batch_id,'credit',1,p_reason,p_event_id,NULL,
   jsonb_build_object('restore_kind',p_kind,'debit_ledger_id',v_debit.id),
   v_now);
 RETURN jsonb_build_object('restored',true,'merchantId',p_merchant_id,
   'subscriptionId',v_sub.id);
END
$restore$;


-- The delivery send transaction must lock the SAME debit row held by restore.
-- Without this second admission an unsent release could commit between the
-- earlier eligibility check and the outbound pending INSERT, yielding a free
-- send. FOR UPDATE here is executed as the trusted owner, not via a DML GRANT.
-- The lock is retained by the original caller until COMMIT/ROLLBACK.
CREATE FUNCTION public.fawri_v1_auto_reply_send_admit(
  p_merchant_id text,p_event_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog SET row_security=off AS $send_admit$
DECLARE v_debit public.reply_ledger%ROWTYPE;
BEGIN
 IF p_merchant_id IS NULL OR length(p_merchant_id) NOT BETWEEN 1 AND 200
   OR p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 300
   OR session_user<>'fawri_restricted_runtime'
   OR current_setting('transaction_isolation')<>'read committed'
   OR NOT fawri_security.allows_merchant(p_merchant_id)
 THEN RAISE EXCEPTION 'V1_REPLY_WRITER_SCOPE_REQUIRED'
   USING ERRCODE='42501'; END IF;
 SELECT * INTO v_debit FROM public.reply_ledger l
   WHERE l.external_event_id=p_event_id AND l.direction='debit'
   FOR UPDATE;
 IF NOT FOUND OR v_debit.merchant_id IS DISTINCT FROM p_merchant_id
 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.reply_ledger l
   WHERE l.external_event_id=p_event_id AND l.direction='credit')
 THEN RETURN false; END IF;
 RETURN true;
END
$send_admit$;

REVOKE ALL ON FUNCTION public.fawri_v1_auto_reply_reserve(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fawri_v1_auto_reply_restore(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fawri_v1_auto_reply_send_admit(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fawri_v1_auto_reply_reserve(text,text)
 TO fawri_restricted_runtime;
GRANT EXECUTE ON FUNCTION public.fawri_v1_auto_reply_restore(text,text,text,text)
 TO fawri_restricted_runtime;
GRANT EXECUTE ON FUNCTION public.fawri_v1_auto_reply_send_admit(text,text)
 TO fawri_restricted_runtime;

DO $post$
DECLARE role_oid oid; fn text; tab text; action text;
BEGIN
 SELECT r.oid INTO role_oid FROM pg_roles r
 WHERE r.rolname='fawri_restricted_runtime' AND r.rolcanlogin
 AND NOT (r.rolinherit OR r.rolsuper OR r.rolbypassrls
   OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication);
 IF role_oid IS NULL OR EXISTS(SELECT 1 FROM pg_auth_members
   WHERE member=role_oid)
 THEN RAISE EXCEPTION 'V1_REPLY_WRITER_TENANT_INVALID'; END IF;
 FOREACH fn IN ARRAY ARRAY[
  'public.fawri_v1_auto_reply_reserve(text,text)',
  'public.fawri_v1_auto_reply_restore(text,text,text,text)',
  'public.fawri_v1_auto_reply_send_admit(text,text)'
 ] LOOP
   IF NOT has_function_privilege(role_oid,fn,'EXECUTE')
      OR EXISTS (SELECT 1 FROM pg_proc p, LATERAL
         aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
         WHERE p.oid=to_regprocedure(fn) AND acl.grantee=0
           AND acl.privilege_type='EXECUTE')
      OR NOT EXISTS (SELECT 1 FROM pg_proc p
           WHERE p.oid=to_regprocedure(fn) AND p.prosecdef
             AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=session_user)
             AND 'search_path=pg_catalog'=ANY(p.proconfig)
             AND 'row_security=off'=ANY(p.proconfig))
   THEN RAISE EXCEPTION 'V1_REPLY_WRITER_FUNCTION_UNSAFE'; END IF;
 END LOOP;
 FOR tab,action IN SELECT table_name,privilege FROM (VALUES
   ('subscriptions','INSERT'),('subscriptions','UPDATE'),('subscriptions','DELETE'),
   ('subscription_reply_batches','INSERT'),
   ('subscription_reply_batches','UPDATE'),
   ('subscription_reply_batches','DELETE'),
   ('reply_ledger','INSERT'),('reply_ledger','UPDATE'),('reply_ledger','DELETE'),
   ('outbound_deliveries','DELETE'),('channel_inbound_events','DELETE')
 ) a(table_name,privilege) LOOP
   IF has_table_privilege(role_oid,'public.'||tab,action)
   THEN RAISE EXCEPTION 'V1_REPLY_WRITER_DIRECT_MONEY_GRANT_FORBIDDEN'; END IF;
 END LOOP;
END
$post$;
COMMIT;
