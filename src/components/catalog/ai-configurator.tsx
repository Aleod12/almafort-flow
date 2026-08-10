import { useMemo, useState } from "react";
import { Loader2, Sparkles, Calculator, FileText, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/store/cart-store";
import { PRODUCTS, isOnRequest, tierOf } from "@/data/catalog";
import { unitPriceOf, lineTotal, formatPrice } from "@/lib/pricing";
import { ProductThumb } from "@/components/catalog/product-thumb";

type SolutionItem = {
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tier: 0 | 1 | 2;
  base_price: number;
  on_request: boolean;
  image_url: string | null;
  dims: string;
};

type ApiResult = {
  solution: {
    recommended_items: SolutionItem[];
    engineering_logic: string;
    safety_margin_factor: number | null;
    is_service: boolean;
    total: number;
  };
  sources: Array<{ id: string; title: string }>;
};

const EXAMPLES = [
  "Закрепить блок промышленного кондиционера весом 150 кг на сэндвич-панель",
  "Нужны регулируемые опоры для торговых стеллажей: 50 стеллажей по 250 кг, по 4 опоры",
  "Закрыть торцы профильной трубы 80х80 в ограждении цеха, 1200 точек",
  "Опереть трубопровод Ø108 мм на кровлю без пробивки гидроизоляции",
];

const TIER_LABEL: Record<1 | 2, string> = { 1: "Опт 1", 2: "Опт 2" };

export function AiConfigurator() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const addLine = useCart((s) => s.addLine);

  /** Пересчёт спецификации на лету: цена всегда берётся из каталога, не из ответа ИИ. */
  const rows = useMemo(() => {
    const items = result?.solution.recommended_items ?? [];
    return items.map((item) => {
      const p = PRODUCTS.find((x) => x.sku === item.sku);
      const q = Math.max(1, Math.floor(qty[item.sku] ?? item.quantity));
      if (!p) return { ...item, quantity: q };
      const onRequest = isOnRequest(p);
      return {
        ...item,
        quantity: q,
        on_request: onRequest,
        unit_price: onRequest ? 0 : unitPriceOf(p, q),
        total_price: onRequest ? 0 : lineTotal(p, q),
        tier: onRequest ? (0 as const) : tierOf(q, p),
      };
    });
  }, [result, qty]);

  const total = rows.reduce((s, r) => s + r.total_price, 0);
  const isService = Boolean(result?.solution.is_service);

  const solve = async (text: string) => {
    if (text.trim().length < 10) {
      toast.error("Опишите задачу подробнее: объект, масса, основание.");
      return;
    }
    setBusy(true);
    setResult(null);
    setQty({});
    try {
      const res = await fetch("/api/configurator/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Не удалось подобрать решение");
      setResult(json as ApiResult);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка конфигуратора");
    } finally {
      setBusy(false);
    }
  };

  const transferToCart = () => {
    const payable = rows.filter((r) => !r.on_request);
    if (payable.length === 0) return;
    for (const r of payable) addLine(r.sku, r.quantity);
    toast.success(`Спецификация в корзине: ${payable.length} поз. на ${formatPrice(total)}`);
  };

  const scrollToQuiz = () => {
    const el = document.getElementById("quiz");
    // Квиз-терминал живёт на главной: с других маршрутов уходим по якорю.
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.location.assign("/#quiz");
  };

  return (
    <section
      id="configurator"
      aria-label="ИИ-конфигуратор инженерных узлов и смет"
      className="mt-16 scroll-mt-28 rounded-lg bg-[#F3F4F6] p-5 sm:p-8 lg:p-10"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
          <Sparkles className="size-5" strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
            ИИ-конфигуратор узла и сметы
          </h2>
          <p className="text-sm text-muted-foreground">
            Опишите задачу словами — подберём артикулы, посчитаем запас прочности и оптовую цену.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="Например: закрепить кондиционер 150 кг на сэндвич-панель"
          className="flex-1 resize-none rounded-sm border border-[#D1D5DB] bg-card p-4 text-sm leading-[1.5] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => solve(query)}
          disabled={busy}
          className="flex h-fit min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-primary px-7 py-4 lg:w-auto text-sm font-semibold text-primary-foreground shadow-[0_6px_18px_-6px_oklch(0.573_0.221_27.5/0.55)] transition-[background-color,transform,box-shadow] duration-200 hover:bg-[#B91C1C] hover:shadow-[0_10px_24px_-8px_oklch(0.573_0.221_27.5/0.7)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
          {busy ? "Инженерный анализ…" : "Подобрать решение"}
        </button>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              onClick={() => {
                setQuery(ex);
                void solve(ex);
              }}
              className="cursor-pointer rounded-full border border-[#D1D5DB] bg-card px-3.5 py-2 text-xs text-muted-foreground transition-all duration-200 hover:border-[#E52421] hover:bg-[#FEF2F2] hover:text-[#E52421] hover:shadow-[0_4px_6px_rgba(0,0,0,0.05)] active:scale-[0.97]"
            >
              {ex.length > 64 ? `${ex.slice(0, 64)}…` : ex}
            </button>
          </li>
        ))}
      </ul>

      {busy && (
        <div className="mt-8 space-y-3" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Инженер ИИ считает решение
            <span className="flex items-end gap-1 pb-[3px]">
              <span className="typing-dot size-1.5 rounded-full bg-current" />
              <span className="typing-dot size-1.5 rounded-full bg-current" />
              <span className="typing-dot size-1.5 rounded-full bg-current" />
            </span>
          </p>
          {/* Скелет резервирует высоту ответа — интерфейс не «прыгает» при загрузке */}
          <div className="skeleton h-6 w-1/3" aria-hidden />
          <div className="skeleton h-24" aria-hidden />
          <div className="skeleton h-12 w-2/3" aria-hidden />
        </div>
      )}


      {result && rows.length > 0 && (
        <article className="mt-8 overflow-hidden rounded-lg bg-card shadow-[0_16px_40px_oklch(0_0_0/0.08)]">
          {/* Инженерное обоснование */}
          <div className="bg-[#F8F9FA] p-5 sm:p-8">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <ShieldCheck className="size-4" strokeWidth={1.75} /> Инженерное обоснование
            </p>
            <p className="mt-3 whitespace-pre-line font-mono text-[13px] leading-[1.7] tabular-nums text-foreground">
              {result.solution.engineering_logic}
            </p>
            {result.solution.safety_margin_factor !== null && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-sm bg-[#E8F5E9] px-3 py-1.5 text-xs font-bold tabular-nums text-[#1B5E20]">
                Запас прочности: {result.solution.safety_margin_factor}×
              </p>
            )}
          </div>

          {/* Спецификация */}
          <div className="border-t border-border p-5 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Спецификация
            </p>
            <ul className="mt-4 divide-y divide-border">
              {rows.map((r) => (
                <li
                  key={r.sku}
                  className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 py-4 lg:grid-cols-[56px_minmax(0,1fr)_110px_150px_130px]"
                >
                  <ProductThumb src={r.image_url} alt={r.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.sku} · {r.dims}
                    </p>
                  </div>
                  <div className="col-start-2 lg:col-start-3">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      aria-label={`Количество ${r.sku}`}
                      value={r.quantity}
                      onChange={(e) => {
                        const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                        setQty((prev) => ({ ...prev, [r.sku]: v }));
                      }}
                      className="h-12 w-full rounded-sm border border-[#D1D5DB] bg-card px-3 text-sm tabular-nums md:h-auto md:py-2 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="col-start-2 lg:col-start-4 lg:text-right">
                    {r.on_request ? (
                      <span className="text-sm font-semibold text-muted-foreground">
                        По договорённости
                      </span>
                    ) : (
                      <>
                        <span className="text-sm tabular-nums text-foreground">
                          {formatPrice(r.unit_price)}/шт
                        </span>
                        {r.tier > 0 && (
                          <span className="ml-2 inline-block rounded-sm bg-[#E8F5E9] px-2 py-0.5 text-[11px] font-bold text-[#1B5E20]">
                            {TIER_LABEL[r.tier as 1 | 2]}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="col-start-2 text-sm font-bold tabular-nums text-foreground lg:col-start-5 lg:text-right">
                    {r.on_request ? "—" : formatPrice(r.total_price)}
                  </div>
                </li>
              ))}
            </ul>

            {!isService && (
              <p className="mt-4 text-right text-sm font-bold tabular-nums text-foreground">
                Итого: {formatPrice(total)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 border-t border-border p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="size-4 shrink-0" strokeWidth={1.75} />
              Источники: {result.sources.map((s) => s.title).join("; ") || "каталог ALMAFORT"}
            </p>
            {isService ? (
              <button
                type="button"
                onClick={scrollToQuiz}
                className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-primary px-8 py-4 lg:w-auto text-sm font-bold text-primary-foreground shadow-[0_6px_18px_-6px_oklch(0.573_0.221_27.5/0.55)] transition-[background-color,transform,box-shadow] duration-200 hover:bg-[#B91C1C] hover:shadow-[0_10px_24px_-8px_oklch(0.573_0.221_27.5/0.7)] active:scale-[0.97]"
              >
                <Wrench className="size-4" strokeWidth={2} />
                Прикрепить ТЗ и запросить расчёт
              </button>
            ) : (
              <button
                type="button"
                onClick={transferToCart}
                className="min-h-[52px] w-full cursor-pointer rounded-sm bg-primary px-8 py-4 lg:w-auto text-sm font-bold text-primary-foreground shadow-[0_6px_18px_-6px_oklch(0.573_0.221_27.5/0.55)] transition-all duration-200 hover:scale-[1.02] hover:bg-[#B91C1C] hover:shadow-[0_10px_24px_-8px_oklch(0.573_0.221_27.5/0.7)] active:scale-[0.98]"
              >
                Добавить смету в корзину
              </button>

            )}
          </div>
        </article>
      )}
    </section>
  );
}
