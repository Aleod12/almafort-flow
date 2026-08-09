CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  email text,
  manager_name text NOT NULL DEFAULT 'Евгений Сазонов',
  manager_phone text NOT NULL DEFAULT '8 (902) 922-97-34',
  manager_telegram text NOT NULL DEFAULT 'https://t.me/almafort',
  manager_whatsapp text NOT NULL DEFAULT 'https://wa.me/79029229734',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inn text NOT NULL,
  kpp text,
  name text NOT NULL,
  legal_address text,
  ogrn text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, inn)
);
CREATE INDEX companies_user_idx ON public.companies(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own companies" ON public.companies FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  number text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  goods_price numeric(14,2) NOT NULL DEFAULT 0,
  delivery_price numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  carrier text,
  city text,
  tracking_number text,
  pvz_address text,
  storage_until date,
  deferred_payment boolean NOT NULL DEFAULT false,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX orders_user_idx ON public.orders(user_id, created_at DESC);
CREATE INDEX orders_tracking_idx ON public.orders(tracking_number);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders select" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own orders insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own orders update" ON public.orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage text NOT NULL,
  title text NOT NULL,
  note text,
  source text NOT NULL DEFAULT 'almafort',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON public.order_events(order_id, created_at);
GRANT SELECT, INSERT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own order events select" ON public.order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "own order events insert" ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

CREATE TABLE public.order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_documents_order_idx ON public.order_documents(order_id);
GRANT SELECT, INSERT ON public.order_documents TO authenticated;
GRANT ALL ON public.order_documents TO service_role;
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own order docs select" ON public.order_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "own order docs insert" ON public.order_documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.loyalty_summary(_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH spent AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS s
    FROM public.orders
    WHERE user_id = _user_id
      AND status IN ('paid','production','packing','shipped','arrived','closed')
      AND created_at > now() - interval '12 months'
  )
  SELECT jsonb_build_object(
    'total_spent', s,
    'tier', CASE WHEN s >= 2000000 THEN 3 WHEN s >= 500000 THEN 2 ELSE 1 END,
    'next_threshold', CASE WHEN s >= 2000000 THEN NULL WHEN s >= 500000 THEN 2000000 ELSE 500000 END
  ) FROM spent;
$$;
GRANT EXECUTE ON FUNCTION public.loyalty_summary(uuid) TO authenticated, service_role;