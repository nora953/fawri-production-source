CREATE OR REPLACE FUNCTION public.fawri_resolve_meta_page_merchant(p_page_id text)
RETURNS text
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.merchant_id
    FROM public.merchant_channels AS c
   WHERE c.page_id = p_page_id
     AND c.platform::text = 'messenger'
     AND c.status::text = 'connected'
   LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fawri_resolve_meta_page_merchant(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchant(text) TO PUBLIC;
