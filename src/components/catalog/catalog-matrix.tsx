import { useState } from "react";
import { Check, Loader2, MessageSquareQuote, ShoppingCart } from "lucide-react";
import { PRODUCTS, isOnRequest, tierOf, type Product } from "@/data/catalog";
import { formatMoney as money, lineTotal } from "@/lib/pricing";
import { searchCatalog } from "@/lib/search-index";
import { toast } from "sonner";
import { QuoteRequestModal } from "@/components/catalog/quote-request-modal";
import { ProductThumb } from "@/components/catalog/product-thumb";

type Props = {
  query: string;
  onOpenProduct: (p: Product) => void;
  onAdd: (p: Product, qty: number) => void;
};

// Общая база ячейки: границы и hover-подсветка живут на ячейках,
// т.к. сама строка — display: contents и не рисует бокс.
const CELL =
  "catalog-cell border-b border-border transition-colors duration-200 group-hover/row:bg-surface";


function StockCell({ p }: { p: Product }) {
  const color =
    p.stock.qty > 10000
      ? "bg-[oklch(0.62_0.16_150)]"
      : p.stock.qty > 0
        ? "bg-[oklch(0.78_0.15_85)]"
        : "bg-primary";
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className={`size-2 shrink-0 rounded-full ${color}`} />
      <span className="text-sm tabular-nums text-foreground">
        {p.stock.qty > 0 ? `${p.stock.qty.toLocaleString("ru-RU")} шт` : p.stock.lead}
      </span>
    </span>
  );
}

function Checkbox({ label }: { label: string }) {
  return (
    <label className="relative flex size-[18px] cursor-pointer items-center justify-center">
      <input type="checkbox" aria-label={label} className="peer sr-only" />
      <span className="size-[18px] rounded-[4px] border border-[oklch(0.85_0.005_264)] bg-card transition-colors duration-150 peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/30" />
      <Check
        className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
        strokeWidth={3}
      />
    </label>
  );
}

function Row({ p, onOpenProduct, onAdd }: { p: Product } & Omit<Props, "query">) {
  const [qty, setQty] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [inCart, setInCart] = useState(0);
  const [quote, setQuote] = useState(false);
  const tier = tierOf(qty, p);
  // Пустая/нулевая цена из фида: цифры не рендерим, показываем бейдж и уводим в запрос.
  const onRequest = isOnRequest(p);

  const threshold = (level: 0 | 1 | 2) =>
    level === 0 ? "от 1 шт" : `от ${(level === 1 ? p.tier1Qty : p.tier2Qty).toLocaleString("ru-RU")} шт`;

  const priceCell = (value: number, level: 0 | 1 | 2) => {
    if (onRequest)
      return (
        <div className={`${CELL} justify-end`}>
          <span className="inline-block whitespace-nowrap rounded-sm bg-[#F3F4F6] px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            По договоренности
          </span>
        </div>
      );
    const active = tier === level && qty > 0;
    const struck = qty > 0 && level < tier;
    return (
      <div
        title={threshold(level)}
        className={`${CELL} justify-end whitespace-nowrap text-sm tabular-nums ${
          active
            ? "bg-[#E8F5E9] font-bold text-foreground group-hover/row:bg-[#E8F5E9]"
            : struck
              ? "text-[#9CA3AF] line-through"
              : "text-foreground"
        }`}
      >
        {money(value)} ₽
      </div>
    );
  };


  const add = async () => {
    if (onRequest) {
      setQuote(true);
      return;
    }
    if (qty <= 0) {
      toast.error("Укажите количество");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: p.sku, quantity: qty }),
      });
      if (!res.ok) throw new Error("cart");
      const data = (await res.json()) as { quantity: number };
      onAdd(p, data.quantity);
      setInCart((v) => v + data.quantity);
      setState("done");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("idle");
      toast.error("Не удалось добавить позицию — повторите");
    }
  };

  const hasSum = !onRequest && qty > 0 && state !== "done";
  const label = onRequest
    ? "Запросить расчет"
    : state === "done"
      ? "Добавлено"
      : hasSum
        ? `${money(lineTotal(p, qty))} ₽`
        : inCart > 0
          ? `В корзине · ${inCart.toLocaleString("ru-RU")} шт`
          : null;

  return (
    <div
      className={`grid ${GRID} scroll-mt-[150px] items-center border-b border-border transition-colors duration-200 hover:bg-surface`}
    >
      <div className="flex items-center justify-center px-2 py-3">
        <Checkbox label={`Выбрать ${p.sku}`} />
      </div>
      <div className="px-2 py-3">
        <span className="block w-10">
          <ProductThumb src={p.image_url} alt={p.name} />
        </span>
      </div>
      <div className="sticky left-0 z-[5] min-w-0 bg-card px-3 py-3 shadow-[6px_0_8px_-6px_oklch(0_0_0/0.18)] md:static md:shadow-none">
        <button
          type="button"
          onClick={() => onOpenProduct(p)}
          className="block w-full cursor-pointer truncate text-left text-sm font-medium text-[oklch(0.19_0.01_264)] transition-colors hover:text-primary"
        >
          {p.name}
        </button>
        <span className="block text-xs tabular-nums text-[oklch(0.55_0.01_264)]">{p.sku}</span>
      </div>
      <div className="px-3 py-3 text-sm text-muted-foreground">{p.dims}</div>
      <div className="px-3 py-3">
        <StockCell p={p} />
      </div>
      {priceCell(p.price, 0)}
      {priceCell(p.price1000, 1)}
      {priceCell(p.price5000, 2)}
      <div className="px-3 py-3">
        <input
          type="text"
          inputMode="numeric"
          value={qty || ""}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 7);
            setQty(digits ? Number.parseInt(digits, 10) : 0);
          }}
          placeholder={onRequest ? "—" : "0"}
          disabled={onRequest}
          aria-label={`Количество ${p.sku}`}
          className="w-full rounded-sm border border-[#D1D5DB] disabled:cursor-not-allowed disabled:bg-[#F3F4F6] bg-card px-2 py-1.5 text-right text-sm tabular-nums text-foreground outline-none transition-colors duration-150 focus:border-foreground"
        />
      </div>
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => void add()}
          disabled={state === "loading"}
          aria-label={onRequest ? "Запросить индивидуальный расчет" : "Добавить в корзину"}
          className={`group flex w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-xs font-semibold tabular-nums transition-all duration-200 disabled:cursor-not-allowed ${
            state === "done"
              ? "bg-[#10B981] text-white"
              : hasSum
                ? "bg-[#F3F4F6] text-foreground hover:bg-primary hover:text-primary-foreground"
                : "border border-[#D1D5DB] bg-[#F3F4F6] text-muted-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground"
          }`}

        >
          {state === "loading" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
          ) : state === "done" ? (
            <Check className="size-4" strokeWidth={2} />
          ) : onRequest ? (
            <MessageSquareQuote className="size-4" strokeWidth={1.75} />
          ) : (
            <ShoppingCart className="size-4" strokeWidth={1.75} />
          )}
          {state === "loading" ? null : label}
        </button>
      </div>
      {quote && (
        <QuoteRequestModal sku={p.sku} name={p.name} onClose={() => setQuote(false)} />
      )}
    </div>
  );
}

export function CatalogMatrix({ query, onOpenProduct, onAdd }: Props) {
  const rows =
    query.trim().length >= 2
      ? (() => {
          const hits = searchCatalog(query, 50);
          const bySku = new Map(PRODUCTS.map((p) => [p.sku, p]));
          return hits.map((h) => bySku.get(h.sku)).filter((p): p is Product => Boolean(p));
        })()
      : PRODUCTS;

  const headers = [
    "",
    "Фото",
    "Артикул и название",
    "Габариты",
    "Наличие",
    "Базовая",
    "Опт 1",
    "Опт 2",
    "Кол-во",
    "",
  ];

  return (
    <div className="table-container">
      <div className="min-w-[1080px]">
        <div
          className={`sticky top-[72px] z-20 grid ${GRID} items-center border-b-2 border-[oklch(0.91_0.004_247.9)] bg-card`}
        >
          {headers.map((h, i) => (
            <div
              key={i}
              className={`px-3 py-3 text-xs font-semibold uppercase leading-tight tracking-wider text-muted-foreground ${
                i >= 5 && i <= 7 ? "text-right" : ""
              }`}
            >
              {h}
            </div>
          ))}
        </div>

        {rows.map((p) => (
          <Row key={p.id} p={p} onOpenProduct={onOpenProduct} onAdd={onAdd} />
        ))}
        {rows.length === 0 && (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            Позиции не найдены — уточните артикул или параметры.
          </div>
        )}
      </div>
    </div>
  );
}
