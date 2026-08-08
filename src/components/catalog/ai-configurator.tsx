import { useState } from "react";
import { Loader2, Sparkles, ShieldCheck, Calculator, FileText } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/store/cart-store";

type Solution = {
  recommended_sku: string;
  reasoning: string;
  load_calculation: string;
  required_qty: number;
  accessories: string[];
};

type ApiResult = {
  solution: Solution;
  sources: Array<{ id: string; title: string }>;
  product: {
    sku: string;
    name: string;
    dims: string;
    material: string;
    load: string;
    price: number;
    stock: number;
  } | null;
  accessories: Array<{ sku: string; name: string; price: number }>;
};

const EXAMPLES = [
  "Закрепить блок промышленного кондиционера весом 150 кг на сэндвич-панель 120 мм, исключив мостик холода",
  "Опереть трубопровод Ø108 мм на кровлю без пробивки гидроизоляции, нагрузка 200 кг на точку",
  "Закрыть торцы профильной трубы 80х80 в ограждении цеха, 400 точек",
];

const money = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AiConfigurator() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const addLine = useCart((s) => s.addLine);

  const solve = async (text: string) => {
    if (text.trim().length < 10) {
      toast.error("Опишите задачу подробнее: объект, масса, основание.");
      return;
    }
    setBusy(true);
    setResult(null);
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

  const addNode = () => {
    if (!result?.product) return;
    addLine(result.product.sku, result.solution.required_qty);
    for (const acc of result.accessories) addLine(acc.sku, result.solution.required_qty);
    toast.success(
      `Узел добавлен: ${result.product.sku} × ${result.solution.required_qty}` +
        (result.accessories.length ? ` + ${result.accessories.length} комплектующих` : ""),
    );
  };

  return (
    <section
      id="configurator"
      aria-label="ИИ-конфигуратор монтажных узлов"
      className="mt-16 scroll-mt-28 rounded-lg bg-[#F3F4F6] p-8 lg:p-10"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
          <Sparkles className="size-5" strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
            ИИ-конфигуратор узла
          </h2>
          <p className="text-sm text-muted-foreground">
            Опишите задачу словами — подберём артикул по протоколам испытаний ALMAFORT и посчитаем
            запас прочности.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="Например: закрепить кондиционер 150 кг на сэндвич-панель 120 мм без мостика холода"
          className="flex-1 resize-none rounded-sm border border-[#D1D5DB] bg-card p-4 text-sm leading-[1.5] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => solve(query)}
          disabled={busy}
          className="flex h-fit cursor-pointer items-center justify-center gap-2 rounded-sm bg-primary px-7 py-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
          {busy ? "Считаем узел…" : "Подобрать решение"}
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
              className="cursor-pointer rounded-full border border-[#D1D5DB] bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {ex.length > 64 ? `${ex.slice(0, 64)}…` : ex}
            </button>
          </li>
        ))}
      </ul>

      {busy && (
        <div className="mt-8 space-y-3" aria-hidden>
          <div className="h-6 w-1/3 animate-pulse rounded-sm bg-[#E5E7EB]" />
          <div className="h-24 animate-pulse rounded-sm bg-[#E5E7EB]" />
          <div className="h-12 w-2/3 animate-pulse rounded-sm bg-[#E5E7EB]" />
        </div>
      )}

      {result?.product && (
        <article className="mt-8 overflow-hidden rounded-lg bg-card shadow-[0_16px_40px_oklch(0_0_0/0.08)]">
          <div className="flex flex-col gap-6 border-b border-border p-8 lg:flex-row lg:items-center">
            <span className="grid size-24 shrink-0 place-items-center rounded-sm bg-surface text-sm font-bold text-muted-foreground">
              {result.product.sku}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                Оптимальное решение
              </p>
              <h3 className="mt-1 text-lg font-bold text-foreground lg:text-xl">
                {result.product.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.product.dims} · {result.product.material} · {result.product.load}
              </p>
              <p className="mt-2 text-sm font-bold tabular-nums text-foreground">
                {money(result.product.price)} ₽ / шт ·{" "}
                <span className="font-semibold text-muted-foreground">
                  требуется {result.solution.required_qty} шт
                </span>
              </p>
            </div>
          </div>

          <div className="grid gap-6 p-8 lg:grid-cols-2">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <ShieldCheck className="size-4" strokeWidth={1.75} /> Обоснование
              </p>
              <p className="mt-2 text-sm leading-[1.6] text-foreground">
                {result.solution.reasoning}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Calculator className="size-4" strokeWidth={1.75} /> Инженерный расчёт
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-[1.6] text-foreground">
                {result.solution.load_calculation}
              </p>
            </div>
          </div>

          {result.accessories.length > 0 && (
            <div className="border-t border-border px-8 pb-6 pt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Комплектующие узла
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {result.accessories.map((a) => (
                  <li
                    key={a.sku}
                    className="rounded-sm bg-surface px-3 py-2 text-xs text-foreground"
                  >
                    <span className="font-semibold">{a.sku}</span> · {a.name} ·{" "}
                    <span className="tabular-nums">{money(a.price)} ₽</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-4 border-t border-border p-8 lg:flex-row lg:items-center lg:justify-between">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="size-4 shrink-0" strokeWidth={1.75} />
              Источники: {result.sources.map((s) => s.title).join("; ")}
            </p>
            <button
              type="button"
              onClick={addNode}
              className="cursor-pointer rounded-sm bg-primary px-8 py-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Добавить весь узел в корзину
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
