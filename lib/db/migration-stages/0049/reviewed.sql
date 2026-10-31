-- Align declarative order_items protection with the existing 0035 runtime policy.
-- Historical migrations remain immutable; no tenant authority or grants change.
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_items_tenant_boundary ON public.order_items;
CREATE POLICY order_items_tenant_boundary ON public.order_items
  AS PERMISSIVE FOR ALL TO public
  USING (public.fawri_tenant_or_audited_admin(merchant_id))
  WITH CHECK (public.fawri_tenant_or_audited_admin(merchant_id));
