import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_LOYALTY, TIER_META, type LoyaltySummary, type LoyaltyTier } from "@/lib/loyalty";

/**
 * Грейд лояльности текущего клиента. Для гостей — базовый.
 * Грейд закрепляет минимальную ценовую колонку каталога на любой объём.
 */
export function useLoyalty() {
  const [summary, setSummary] = useState<LoyaltySummary>(EMPTY_LOYALTY);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!alive) return;
      setAuthed(Boolean(sess.session));
      if (!sess.session) {
        setSummary(EMPTY_LOYALTY);
        return;
      }
      const { data } = await supabase.rpc("my_loyalty");
      if (!alive || !data) return;
      const s = data as unknown as LoyaltySummary;
      setSummary({
        total_spent: Number(s.total_spent ?? 0),
        tier: (s.tier ?? 1) as LoyaltyTier,
        next_threshold: s.next_threshold ?? null,
      });
    };
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const tier = summary.tier;
  return { summary, tier, authed, minColumn: TIER_META[tier].minColumn, credit: TIER_META[tier].credit };
}
