CREATE TABLE public.bulk_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  sku text NOT NULL,
  product_name text NOT NULL,
  base_price numeric NOT NULL DEFAULT 0,
  qty integer NOT NULL DEFAULT 50000,
  contact_name text NOT NULL,
  phone text NOT NULL,
  email text,
  inn text,
  comment text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.bulk_requests TO authenticated;
GRANT ALL ON public.bulk_requests TO service_role;

ALTER TABLE public.bulk_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_bulk_requests" ON public.bulk_requests
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "staff_update_bulk_requests" ON public.bulk_requests
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER bulk_requests_updated BEFORE UPDATE ON public.bulk_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();