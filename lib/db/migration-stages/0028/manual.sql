-- Ingress must resolve a verified webhook's page IDs before tenant context exists.
-- This capability exposes routing identities only; never credentials or all rows.
-- Migration owner must be a trusted schema owner. Runtime EXECUTE is an explicit
-- deployment grant, not PUBLIC, and must never confer table/RLS bypass privileges.
CREATE FUNCTION public.fawri_resolve_meta_page_merchants(p_page_ids text[])
RETURNS TABLE(page_id text, merchant_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
BEGIN
  IF p_page_ids IS NULL OR cardinality(p_page_ids) > 100
     OR EXISTS (SELECT 1 FROM unnest(p_page_ids) AS requested(id)
                WHERE requested.id IS NULL OR length(requested.id) < 1
                   OR length(requested.id) > 180) THEN
    RAISE EXCEPTION 'invalid bounded Meta page identity request' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT channel.page_id, channel.merchant_id
      FROM public.merchant_channels AS channel
     WHERE channel.platform = 'messenger'
       AND channel.status = 'connected'
       AND channel.page_id = ANY(p_page_ids)
     ORDER BY channel.page_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_resolve_meta_page_merchants(text[]) FROM PUBLIC;
