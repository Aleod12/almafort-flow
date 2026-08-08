import { useState } from "react";
import { Box, Check, Loader2, ShoppingCart } from "lucide-react";
import { PRODUCTS, tierOf, unitPrice, type Product } from "@/data/catalog";
import { scoreMatch } from "@/lib/fuzzy-search";
import { toast } from "sonner";

type Props = {
  query: string;
  onOpenProduct: (p: Product) => void;
  onAdd: (p: Product, qty: number) => void;
};

const GRID = "grid-cols-[40px_60px_3fr_1.2fr_1.2fr_1fr_1fr_1fr_120px_150px]";

const money = (v: number) =>
  v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const tier = tierOf(qty);

  const priceCell = (value: number, level: 0 | 1 | 2) => {
    const active = tier === level && qty > 0;
    const struck = qty > 0 && level < tier;
    return (
      <div
        className={`px-3 py-3 text-right text-sm tabular-nums transition-all duration-200 ${
          active
            ? "bg-[oklch(0.95_0.05_150)] font-bold text-foreground"
            : struck
              ? "text-[oklch(0.72_0.01_264)] line-through"
              : "text-foreground"
        }`}
      >
        {money(value)} ₽
      </div>
    );
  };

  const add = () => {
    if (qty <= 0) {
      toast.error("Укажите количество");
      return;
    }
    setState("loading");
    window.setTimeout(() => {
      setState("done");
      onAdd(p, qty);
      window.setTimeout(() => setState("idle"), 2000);
    }, 500);
  };

  const hasSum = qty > 0 && state !== "done";

  return (
    <div
      className={`grid ${GRID} items-center border-b border-border transition-colors duration-200 hover:bg-surface`}
    >
      <div className="flex items-center justify-center px-2 py-3">
        <Checkbox label={`Выбрать ${p.sku}`} />
      </div>
      <div className="px-2 py-3">
        <span className="grid size-10 place-items-center rounded-[6px] bg-[oklch(0.96_0.002_247.9)]">
          <Box className="size-5 text-[oklch(0.75_0.01_264)]" strokeWidth={1.5} />
        </span>
      </div>
      <div className="min-w-0 px-3 py-3">
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
          type="number"
          min={0}
          value={qty || ""}
          onChange={(e) => setQty(Math.max(0, Number(e.target.value)))}
          placeholder="0"
          aria-label={`Количество ${p.sku}`}
          className="w-full rounded-sm border border-[#D1D5DB] bg-card px-2 py-1.5 text-right text-sm tabular-nums text-foreground outline-none transition-colors duration-150 focus:border-foreground"
        />
      </div>
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={add}
          aria-label="Добавить в корзину"
          className={`group flex w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-xs font-semibold tabular-nums transition-all duration-200 ${
            state === "done"
              ? "border border-[oklch(0.62_0.16_150)] bg-[oklch(0.95_0.05_150)] text-[oklch(0.45_0.14_150)]"
              : hasSum
                ? "bg-[#F3F4F6] text-foreground hover:bg-primary hover:text-primary-foreground"
                : "border border-[#D1D5DB] bg-[#F3F4F6] text-muted-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground"
          }`}

        >
          {state === "loading" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
          ) : state === "done" ? (
            <Check className="size-4" strokeWidth={2} />
          ) : (
            <ShoppingCart className="size-4" strokeWidth={1.75} />
          )}
          {hasSum ? `${money(unitPrice(p, qty) * qty)} ₽` : null}
        </button>
      </div>
    </div>
  );
}

export function CatalogMatrix({ query, onOpenProduct, onAdd }: Props) {
  const rows =
    query.trim().length >= 2
      ? PRODUCTS.map((p) => ({
          p,
          s: Math.max(
            scoreMatch(p.name, query),
            scoreMatch(p.sku, query),
            scoreMatch(p.category, query),
            scoreMatch(p.dims, query),
          ),
        }))
          .filter((r) => r.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((r) => r.p)
      : PRODUCTS;

  const headers = [
    "",
    "Фото",
    "Артикул и название",
    "Габариты",
    "Наличие",
    "Базовая",
    "Опт 1 (>1000)",
    "Опт 2 (>5000)",
    "Кол-во",
    "",
  ];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1080px]">
        <div
          className={`sticky top-[72px] z-10 grid ${GRID} items-center border-b-2 border-[oklch(0.91_0.004_247.9)] bg-card`}
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
