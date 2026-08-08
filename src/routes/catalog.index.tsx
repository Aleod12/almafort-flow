import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ParsingSkeleton, SpecUpload } from "@/components/cart/spec-upload";
import { useCart, cartTotals } from "@/store/cart-store";
import { SearchPanel } from "@/components/catalog/search-panel";
import { CatalogMatrix } from "@/components/catalog/catalog-matrix";
import { ProductSheet } from "@/components/catalog/product-sheet";
import { AiConfigurator } from "@/components/catalog/ai-configurator";
import { type Product } from "@/data/catalog";
import { CATEGORY_FACETS } from "@/lib/seo";

export const Route = createFileRoute("/catalog/")({
  head: () => ({
    meta: [
      { title: "Каталог ALMAFORT — прайс-матрица пластиковых комплектующих" },
      {
        name: "description",
        content:
          "B2B-терминал ALMAFORT: поиск по артикулу и фото, матрица оптовых цен, наличие на складе, чертежи DWG и STEP, расчёт доставки.",
      },
      { property: "og:title", content: "Каталог ALMAFORT — прайс-матрица для снабженцев" },
      {
        property: "og:description",
        content:
          "Умный поиск, оптовые тиры цен, остатки склада и инженерная документация в одном интерфейсе.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://almafort.ru/catalog" },
    ],
    links: [{ rel: "canonical", href: "https://almafort.ru/catalog" }],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [upload, setUpload] = useState(false);
  const lines = useCart((s) => s.lines);
  const parsing = useCart((s) => s.parsing);
  const addLine = useCart((s) => s.addLine);
  const cart = { lines: lines.length, total: cartTotals(lines).goods };

  const add = (p: Product, qty: number) => {
    addLine(p.sku, qty);
    toast.success(`${p.sku} · ${qty.toLocaleString("ru-RU")} шт добавлено`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="flex-1 mx-auto max-w-[1440px] px-5 pb-24 pt-10 lg:px-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold leading-[1.08] tracking-tight text-foreground lg:text-[44px]">
            Каталог серийной продукции
          </h1>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm leading-[1.5] text-muted-foreground lg:text-base">
            Прайс-матрица с остатками склада, тремя уровнями оптовых цен и инженерной
            документацией. Цена пересчитывается прямо в строке при вводе количества.
          </p>
        </header>

        <nav aria-label="Разделы каталога" className="mb-8 flex flex-wrap justify-center gap-2">
          {CATEGORY_FACETS.map((c) => (
            <a
              key={c.slug}
              href={`/catalog/${c.slug}`}
              className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
            >
              {c.label}
            </a>
          ))}
        </nav>

        <SearchPanel
          query={query}
          onQuery={setQuery}
          onPick={setProduct}
          onScanChange={setScanning}
        />

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setUpload((v) => !v)}
            className="flex cursor-pointer items-center gap-2 rounded-sm border border-[#D1D5DB] bg-[#F3F4F6] px-4 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
          >
            <FileSpreadsheet className="size-4" strokeWidth={1.75} />
            Загрузить спецификацию Excel
          </button>
        </div>

        {upload && (
          <div className="mx-auto mt-4 w-full lg:w-[70%]">
            {parsing ? <ParsingSkeleton /> : <SpecUpload />}
          </div>
        )}

        <section
          className={`mt-10 transition-all duration-300 ${scanning ? "blur-sm" : ""}`}
          aria-label="Матрица каталога"
        >
          <CatalogMatrix query={query} onOpenProduct={setProduct} onAdd={add} />
        </section>

        <AiConfigurator />
      </main>

      {cart.lines > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border bg-card px-6 py-3 text-sm shadow-[0_16px_40px_oklch(0_0_0/0.12)]">
          <span className="text-muted-foreground">Позиций в заказе: </span>
          <span className="font-semibold text-foreground">{cart.lines}</span>
          <span className="mx-3 text-border">|</span>
          <span className="font-bold tabular-nums text-primary">
            {cart.total.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽
          </span>
          <a
            href="/cart"
            className="ml-4 cursor-pointer rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Оформить счёт
          </a>
        </div>
      )}

      <ProductSheet product={product} onClose={() => setProduct(null)} />
    </div>
  );
}
