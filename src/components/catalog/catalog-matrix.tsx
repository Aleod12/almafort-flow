import { useState } from "react";
import { Check, Loader2, ShoppingCart } from "lucide-react";
import { PRODUCTS, tierOf, unitPrice, type Product } from "@/data/catalog";
import { scoreMatch } from "@/lib/fuzzy-search";
import { toast } from "sonner";

type Props = {
  query: string;
  onOpenProduct: (p: Product) => void;
  onAdd: (p: Product, qty: number) => void;
};

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
      <span className="text-sm text-foreground">
        {p.stock.qty > 0 ? `${p.stock.qty.toLocaleString("ru-RU")} шт` : p.stock.lead}
      </span>
    </span>
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
      <td
        className={`px-3 py-3 text-right text-sm tabular-nums transition-all duration-200 ${
          active ? "bg-[oklch(0.95_0.05_150)] font-bold text-foreground" : ""
        } ${struck ? "text-muted-foreground line-through" : "text-foreground"}`}
      >
        {money(value)} ₽
      </td>
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

  return (
    <tr className="border-b border-border transition-colors duration-200 hover:bg-surface">
      <td className="px-3 py-3">
        <input type="checkbox" aria-label={`Выбрать ${p.sku}`} className="size-4 accent-primary" />
      </td>
      <td className="px-3 py-3">
        <span className="grid size-10 place-items-center rounded-sm bg-surface text-[10px] font-semibold text-muted-foreground">
          {p.sku.slice(0, 2)}
        </span>
      </td>
      <td className="min-w-[220px] px-3 py-3">
        <button
          type="button"
          onClick={() => onOpenProduct(p)}
          className="text-left text-sm font-medium text-foreground hover:text-primary"
        >
          {p.name}
          <span className="block text-xs font-normal text-muted-foreground">{p.sku}</span>
        </button>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-muted-foreground">{p.dims}</td>
      <td className="px-3 py-3">
        <StockCell p={p} />
      </td>
      {priceCell(p.price, 0)}
      {priceCell(p.price1000, 1)}
      {priceCell(p.price5000, 2)}
      <td className="px-3 py-3">
        <input
          type="number"
          min={0}
          value={qty || ""}
          onChange={(e) => setQty(Math.max(0, Number(e.target.value)))}
          placeholder="0"
          aria-label={`Количество ${p.sku}`}
          className="w-24 rounded-sm border border-border bg-card px-2 py-1.5 text-right text-sm tabular-nums text-foreground outline-none focus:border-primary"
        />
      </td>
      <td className="px-3 py-3">
        <button
          type="button"
          onClick={add}
          aria-label="Добавить в корзину"
          className={`flex items-center gap-2 whitespace-nowrap rounded-sm border border-border px-3 py-2 text-xs font-semibold transition-all duration-200 ${
            state === "done"
              ? "border-[oklch(0.62_0.16_150)] bg-[oklch(0.95_0.05_150)] text-[oklch(0.45_0.14_150)]"
              : "text-muted-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground"
          }`}
        >
          {state === "loading" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
          ) : state === "done" ? (
            <Check className="size-4" strokeWidth={2} />
          ) : (
            <ShoppingCart className="size-4" strokeWidth={1.75} />
          )}
          {qty > 0 && state !== "done" ? `${money(unitPrice(p, qty) * qty)} ₽` : null}
        </button>
      </td>
    </tr>
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse">
        <thead className="sticky top-[72px] z-20 bg-background">
          <tr className="border-b border-border text-left">
            {[
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
            ].map((h, i) => (
              <th
                key={i}
                className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                  i >= 5 && i <= 7 ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <Row key={p.id} p={p} onOpenProduct={onOpenProduct} onAdd={onAdd} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                Позиции не найдены — уточните артикул или параметры.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
