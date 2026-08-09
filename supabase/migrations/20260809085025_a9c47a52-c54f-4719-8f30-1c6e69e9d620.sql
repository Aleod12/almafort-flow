CREATE TABLE public.asset_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.asset_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_groups TO authenticated;
GRANT ALL ON public.asset_groups TO service_role;
ALTER TABLE public.asset_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads asset groups" ON public.asset_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff manages asset groups" ON public.asset_groups FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'content'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'content'::app_role));
CREATE TRIGGER asset_groups_updated BEFORE UPDATE ON public.asset_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_asset_links (
  sku text PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.asset_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_asset_links_group_idx ON public.product_asset_links(group_id);
GRANT SELECT ON public.product_asset_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_asset_links TO authenticated;
GRANT ALL ON public.product_asset_links TO service_role;
ALTER TABLE public.product_asset_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads asset links" ON public.product_asset_links FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff manages asset links" ON public.product_asset_links FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'content'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'content'::app_role));

CREATE OR REPLACE FUNCTION public.link_asset_group(_slug text, _title text, _description text, _images jsonb, _skus text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE gid uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'content'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.asset_groups (slug, title, description, images)
  VALUES (_slug, _title, _description, COALESCE(_images, '[]'::jsonb))
  ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, images = EXCLUDED.images
  RETURNING id INTO gid;
  DELETE FROM public.product_asset_links WHERE group_id = gid AND sku <> ALL(_skus);
  INSERT INTO public.product_asset_links (sku, group_id)
  SELECT unnest(_skus), gid
  ON CONFLICT (sku) DO UPDATE SET group_id = EXCLUDED.group_id;
  RETURN gid;
END; $$;

INSERT INTO public.asset_groups (slug, title, description) VALUES (
  'ZGV-Square-Small',
  'Заглушки внутренние квадратные 15–25 мм',
  'Назначение и монтаж: Внутренние заглушки для профильных труб квадратного сечения. Благодаря эластичным пластиковым ребрам жесткости они легко монтируются и намертво фиксируются внутри профиля, обеспечивая плотную посадку без люфтов и надежную защиту торца от механических повреждений.'
);
INSERT INTO public.product_asset_links (sku, group_id)
SELECT s, (SELECT id FROM public.asset_groups WHERE slug = 'ZGV-Square-Small')
FROM unnest(ARRAY['ZGV-15x15','ZGV-20x20','ZGV-25x25']) AS s;