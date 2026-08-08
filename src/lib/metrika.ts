// Невидимый аналитический слой: события Яндекс.Метрики.
// Менеджмент видит, какие артикулы проектировщики закладывают в чертежи.

declare global {
  interface Window {
    ym?: (id: number, action: string, target: string, params?: Record<string, unknown>) => void;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const COUNTER_ID = Number(import.meta.env["VITE_YM_COUNTER_ID"] ?? 0);

export function reachGoal(goal: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (COUNTER_ID && typeof window.ym === "function") {
      window.ym(COUNTER_ID, "reachGoal", goal, params);
    }
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: goal, ...params });
  } catch {
    /* аналитика не должна ломать скачивание */
  }
}

export function trackCadDownload(sku: string, format: "step" | "dwg" | "pdf" | "glb") {
  reachGoal("cad_download", { sku, format });
  reachGoal(`cad_download_${format}`, { sku });
}
