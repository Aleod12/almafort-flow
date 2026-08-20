-- 1. Restrict ERP sync jobs to owners and managers
DROP POLICY IF EXISTS "Staff can view erp sync jobs" ON public.erp_sync_jobs;
CREATE POLICY "Owners and managers view erp sync jobs"
ON public.erp_sync_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

-- 2. Revoke public EXECUTE on SECURITY DEFINER functions that must not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_company_ltv() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_company_tiers() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.link_asset_group(text, text, text, jsonb, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM anon, authenticated;
