
-- ROLES
CREATE TYPE public.app_role AS ENUM ('owner','manager','content');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE POLICY "own roles select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

-- AUDIT TRAIL
CREATE TABLE public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email text,
  action text NOT NULL,
  target text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads logs" ON public.admin_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));
CREATE INDEX admin_logs_created_idx ON public.admin_logs (created_at DESC);

-- COMPANIES EXTENSIONS
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS lifetime_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_tier_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_tier smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS credit_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.bump_company_ltv()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    UPDATE public.companies
      SET lifetime_value = lifetime_value + COALESCE(NEW.total,0), last_activity_at = now()
      WHERE id = NEW.company_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER orders_ltv AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.bump_company_ltv();

CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_idx ON public.orders (created_at DESC);

-- STAFF ACCESS POLICIES
CREATE POLICY "staff read orders" ON public.orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "staff update orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "staff read companies" ON public.companies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "staff update companies" ON public.companies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "staff read order docs" ON public.order_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "staff insert order docs" ON public.order_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "staff read order events" ON public.order_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "staff insert order events" ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'manager'));

-- PIM OVERRIDES
CREATE TABLE public.product_overrides (
  sku text PRIMARY KEY,
  base_price numeric,
  opt1_price numeric,
  opt2_price numeric,
  stock integer,
  image_url text,
  model_url text,
  description text,
  synonyms text[] NOT NULL DEFAULT '{}',
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_overrides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_overrides TO authenticated;
GRANT ALL ON public.product_overrides TO service_role;
ALTER TABLE public.product_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads products" ON public.product_overrides FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "owner or content writes products" ON public.product_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'content'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'content'));
CREATE TRIGGER product_overrides_updated BEFORE UPDATE ON public.product_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- LLM PROMPTS (versioned)
CREATE TABLE public.llm_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL,
  version integer NOT NULL,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot, version)
);
GRANT SELECT, INSERT, UPDATE ON public.llm_prompts TO authenticated;
GRANT ALL ON public.llm_prompts TO service_role;
ALTER TABLE public.llm_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages prompts" ON public.llm_prompts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

-- LLM LOGS
CREATE TABLE public.llm_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'configurator',
  prompt text,
  response text,
  parse_status text NOT NULL DEFAULT 'ok',
  model text,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.llm_logs TO authenticated;
GRANT ALL ON public.llm_logs TO service_role;
ALTER TABLE public.llm_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads llm logs" ON public.llm_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));
CREATE INDEX llm_logs_created_idx ON public.llm_logs (created_at DESC);

-- APP SETTINGS
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads public settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (is_public = true);
CREATE POLICY "owner manages settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE TRIGGER app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value, is_public) VALUES
  ('maintenance_mode', '{"enabled": false, "message": "Идут технические работы. Скоро вернёмся."}'::jsonb, true),
  ('logistics_markup', '{"fixed_rub": 0, "percent": 0}'::jsonb, false);
