/**
 * Система «Master Asset»: один пакет контента (фото + инженерное описание)
 * связан отношением Many-to-One с выборкой конкретных SKU.
 *
 * БД: public.asset_groups (slug, title, description, images jsonb)
 *     public.product_asset_links (sku → group_id)
 *
 * Каждое изображение хранит два готовых webp-размера:
 *   thumb_url — 64×64 для микро-превью в таблице каталога;
 *   full_url  — 800×800 для модального окна.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AssetImage = {
  thumb_url: string;
  full_url: string;
  caption?: string;
};

export type AssetGroup = {
  id: string;
  slug: string;
  title: string;
  description: string;
  images: AssetImage[];
};

const isImage = (v: unknown): v is AssetImage =>
  !!v &&
  typeof v === "object" &&
  typeof (v as AssetImage).thumb_url === "string" &&
  typeof (v as AssetImage).full_url === "string";

/** Карта SKU → группа контента. Пустая карта = фото ещё не привязаны. */
export async function fetchAssetGroups(): Promise<Map<string, AssetGroup>> {
  const [groupsRes, linksRes] = await Promise.all([
    supabase.from("asset_groups").select("id, slug, title, description, images"),
    supabase.from("product_asset_links").select("sku, group_id"),
  ]);
  const map = new Map<string, AssetGroup>();
  if (groupsRes.error || linksRes.error) return map;

  const byId = new Map<string, AssetGroup>();
  for (const g of groupsRes.data ?? []) {
    byId.set(g.id, {
      id: g.id,
      slug: g.slug,
      title: g.title,
      description: g.description ?? "",
      images: Array.isArray(g.images) ? (g.images as unknown[]).filter(isImage) : [],
    });
  }
  for (const l of linksRes.data ?? []) {
    const g = byId.get(l.group_id);
    if (g) map.set(l.sku, g);
  }
  return map;
}

export function useAssetGroups() {
  const { data } = useQuery({
    queryKey: ["asset-groups"],
    queryFn: fetchAssetGroups,
    staleTime: 5 * 60_000,
  });
  return data ?? new Map<string, AssetGroup>();
}
