DROP FUNCTION IF EXISTS public.loyalty_summary(uuid);

CREATE OR REPLACE FUNCTION public.my_loyalty()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH spent AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS s
    FROM public.orders
    WHERE user_id = auth.uid()
      AND status IN ('paid','production','packing','shipped','arrived','closed')
      AND created_at > now() - interval '12 months'
  )
  SELECT jsonb_build_object(
    'total_spent', s,
    'tier', CASE WHEN s >= 2000000 THEN 3 WHEN s >= 500000 THEN 2 ELSE 1 END,
    'next_threshold', CASE WHEN s >= 2000000 THEN NULL WHEN s >= 500000 THEN 2000000 ELSE 500000 END
  ) FROM spent;
$$;
REVOKE ALL ON FUNCTION public.my_loyalty() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_loyalty() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;