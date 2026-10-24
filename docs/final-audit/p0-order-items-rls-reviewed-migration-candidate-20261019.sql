-- P0 tenant boundary for order line items.
-- Requires public.fawri_tenant_or_audited_admin(text) to exist.
-- Apply only through the reviewed migration process.
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_tenant_boundary ON public.order_items;
CREATE POLICY order_items_tenant_boundary
  ON public.order_items
  FOR ALL
  USING (public.fawri_tenant_or_audited_admin(merchant_id))
  WITH CHECK (public.fawri_tenant_or_audited_admin(merchant_id));
