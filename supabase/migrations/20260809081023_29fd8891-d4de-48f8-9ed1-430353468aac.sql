ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS director text;

CREATE OR REPLACE FUNCTION public.recalc_company_tiers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH sums AS (
    SELECT o.company_id,
           COALESCE(SUM(o.total), 0)::numeric AS s,
           MAX(o.created_at) AS last_at
    FROM public.orders o
    WHERE o.company_id IS NOT NULL
      AND o.status IN ('paid','production','packing','shipped','arrived','closed')
      AND o.created_at > now() - interval '12 months'
    GROUP BY o.company_id
  )
  UPDATE public.companies c
  SET lifetime_value = COALESCE(sums.s, 0),
      last_activity_at = COALESCE(sums.last_at, c.last_activity_at),
      assigned_tier = CASE
        WHEN c.manual_tier_override THEN c.assigned_tier
        WHEN COALESCE(sums.s, 0) >= 2000000 THEN 3
        WHEN COALESCE(sums.s, 0) >= 500000 THEN 2
        ELSE 1
      END
  FROM sums
  WHERE sums.company_id = c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_company_tiers() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_company_tiers() TO service_role;

CREATE OR REPLACE FUNCTION public.my_loyalty()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH spent AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS s
    FROM public.orders
    WHERE user_id = auth.uid()
      AND status IN ('paid','production','packing','shipped','arrived','closed')
      AND created_at > now() - interval '12 months'
  ),
  manual AS (
    SELECT COALESCE(MAX(assigned_tier), 0) AS t
    FROM public.companies
    WHERE user_id = auth.uid() AND manual_tier_override
  ),
  calc AS (
    SELECT s,
           GREATEST(
             CASE WHEN s >= 2000000 THEN 3 WHEN s >= 500000 THEN 2 ELSE 1 END,
             (SELECT t FROM manual)
           ) AS tier
    FROM spent
  )
  SELECT jsonb_build_object(
    'total_spent', s,
    'tier', tier,
    'next_threshold', CASE WHEN tier >= 3 THEN NULL WHEN tier = 2 THEN 2000000 ELSE 500000 END
  ) FROM calc;
$$;