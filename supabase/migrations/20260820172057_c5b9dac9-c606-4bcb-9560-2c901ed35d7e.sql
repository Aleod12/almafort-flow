CREATE TABLE IF NOT EXISTS public.saved_carts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_carts TO authenticated;
GRANT ALL ON public.saved_carts TO service_role;

ALTER TABLE public.saved_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own saved cart" ON public.saved_carts;
CREATE POLICY "own saved cart" ON public.saved_carts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS saved_carts_updated ON public.saved_carts;
CREATE TRIGGER saved_carts_updated BEFORE UPDATE ON public.saved_carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();