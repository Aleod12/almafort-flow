CREATE TABLE public.erp_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  order_id uuid,
  direction text NOT NULL DEFAULT 'push',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX erp_sync_jobs_pending_idx ON public.erp_sync_jobs (status, next_attempt_at);

GRANT SELECT ON public.erp_sync_jobs TO authenticated;
GRANT ALL ON public.erp_sync_jobs TO service_role;

ALTER TABLE public.erp_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view erp sync jobs"
  ON public.erp_sync_jobs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER erp_sync_jobs_updated
  BEFORE UPDATE ON public.erp_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS registry_status text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS requisites_source text NOT NULL DEFAULT 'manual';