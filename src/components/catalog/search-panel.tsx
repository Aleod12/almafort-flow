import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, FolderTree, Package, Search, X } from "lucide-react";
import { CATEGORIES, PRODUCTS, type Product } from "@/data/catalog";
import { scoreMatch } from "@/lib/fuzzy-search";

type Props = {
  query: string;
  onQuery: (v: string) => void;
  onPick: (p: Product) => void;
  onScanChange: (scanning: boolean) => void;
};

export function SearchPanel({ query, onQuery, onPick, onScanChange }: Props) {
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const results = useMemo(() => {
    if (query.trim().length < 2) return { products: [], cats: [], docs: [] };
    const products = PRODUCTS.map((p) => ({
      p,
      s: Math.max(scoreMatch(p.name, query), scoreMatch(p.sku, query), scoreMatch(p.dims, query)),
    }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((r) => r.p);

    const cats = CATEGORIES.filter((c) => scoreMatch(c, query) > 0).slice(0, 4);
    const docs = products.slice(0, 3).map((p) => `Чертёж DWG · ${p.sku}`);
    return { products, cats, docs };
  }, [query]);

  const startScan = () => {
    setScan(true);
    onScanChange(true);
    window.setTimeout(() => {
      setScan(false);
      onScanChange(false);
      onQuery("КРЕПСС 458");
      setOpen(true);
    }, 2200);
  };

  return (
    <div ref={wrapRef} className="relative z-30 mx-auto w-full lg:w-[60%]">
      <div className="flex items-center gap-3 rounded-lg border border-[#D1D5DB] bg-card px-4 py-3 transition-shadow duration-200 focus-within:border-[#D1D5DB] focus-within:shadow-[0_4px_6px_-1px_oklch(0_0_0/0.1)]">
        <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setOpen(e.target.value.trim().length >= 2);
          }}
          onFocus={() => setOpen(query.trim().length >= 2)}
          placeholder="Введите артикул, название или параметры (например: крепеж сэндвич-панели 120мм)"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Поиск по каталогу"
        />
        {query && (
          <button
            type="button"
            aria-label="Очистить"
            onClick={() => onQuery("")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          onClick={startScan}
          title="Поиск по фото детали или чертежу"
          aria-label="Поиск по фото детали или чертежу"
          className="grid size-9 shrink-0 place-items-center rounded-sm bg-[oklch(0.96_0.002_247.9)] text-[oklch(0.4_0.01_264)] transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
        >
          <Camera className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] grid gap-6 rounded-lg border border-border bg-card p-5 shadow-[0_16px_40px_oklch(0_0_0/0.08)] md:grid-cols-3">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Package className="size-3.5" strokeWidth={1.75} /> Товары
            </p>
            {results.products.length === 0 && (
              <p className="text-sm text-muted-foreground">Ничего не найдено</p>
            )}
            <ul className="space-y-2">
              {results.products.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-sm p-1.5 text-left hover:bg-surface"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-surface text-[10px] font-semibold text-muted-foreground">
                      {p.sku.slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {p.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {p.sku} · {p.price.toFixed(2)} ₽
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FolderTree className="size-3.5" strokeWidth={1.75} /> Категории
            </p>
            <ul className="space-y-2 text-sm text-foreground">
              {(results.cats.length ? results.cats : CATEGORIES.slice(0, 3)).map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => {
                      onQuery(c);
                      setOpen(false);
                    }}
                    className="hover:text-primary"
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="size-3.5" strokeWidth={1.75} /> Документация
            </p>
            <ul className="space-y-2 text-sm text-foreground">
              {results.docs.length === 0 && (
                <li className="text-muted-foreground">Нет совпадений</li>
              )}
              {results.docs.map((d) => (
                <li key={d} className="hover:text-primary">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {scan && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/60 backdrop-blur-md">
          <div className="relative h-64 w-72 overflow-hidden rounded-lg border-2 border-dashed border-primary/60">
            <div className="scan-beam" />
            <p className="absolute inset-x-0 bottom-4 px-4 text-center text-xs text-muted-foreground">
              Поместите деталь в центр. Для чёрных деталей используйте светлый фон.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
