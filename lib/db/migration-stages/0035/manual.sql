-- P0: protect order line items with the same audited tenant boundary as orders.
-- Verified on a disposable Neon branch with two synthetic merchants.
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_tenant_boundary ON public.order_items;
CREATE POLICY order_items_tenant_boundary
  ON public.order_items
  FOR ALL
  USING (public.fawri_tenant_or_audited_admin(merchant_id))
  WITH CHECK (public.fawri_tenant_or_audited_admin(merchant_id));
