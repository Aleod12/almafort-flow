import { Suspense, lazy, useMemo, useState } from "react";
import { Download, FileText, Layers, Ruler, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/data/catalog";
import { trackCadDownload } from "@/lib/metrika";

const CadViewer = lazy(() => import("@/components/catalog/cad-viewer"));

const CITIES = ["Екатеринбург", "Москва", "Новосибирск", "Казань"];

export function ProductSheet({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const [city, setCity] = useState(CITIES[0]!);

  const logistics = useMemo(() => {
    if (!product) return [];
    const batch = 1000;
    const w = product.weight * batch;
    return [
      { name: "СДЭК (до двери)", days: "4 дня", cost: Math.round(900 + w * 9) },
      { name: "Деловые Линии (до терминала)", days: "отгрузка в среду", cost: Math.round(500 + w * 5) },
    ];
  }, [product]);

  const jsonLd = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        sku: product.sku,
        category: `Каталог/${product.category}`,
        material: product.material,
        weight: { "@type": "QuantitativeValue", value: product.weight, unitCode: "KGM" },
        offers: {
          "@type": "Offer",
          price: product.price,
          priceCurrency: "RUB",
          validFrom: "2026-01-01",
          availability:
            product.stock.qty > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/PreOrder",
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingRate: {
              "@type": "MonetaryAmount",
              value: logistics[0]?.cost ?? 0,
              currency: "RUB",
            },
            shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU" },
          },
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "RU",
            returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: 14,
          },
        },
        aggregateRating: { "@type": "AggregateRating", ratingValue: 4.8, reviewCount: 126 },
      }
    : null;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        {product && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold text-foreground">
                {product.name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {product.sku}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <Suspense
                  fallback={
                    <div className="grid h-72 place-items-center rounded-lg bg-surface font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Инициализация WebGL...
                    </div>
                  }
                >
                  <CadViewer
                    glbUrl={product.engineering_assets.model_glb_url}
                    category={product.category}
                  />
                </Suspense>
                <p className="mt-3 text-xs text-muted-foreground">
                  Модель сжата Draco · вращение мышью, зум колесом. Геометрия совпадает с
                  отливкой артикула {product.sku}.
                </p>
              </div>

              <div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border pb-6 text-sm">
                  {[
                    ["Материал", product.material],
                    ["Габариты", product.dims],
                    ["Нагрузка", product.load],
                    ["Стандарт", product.gost],
                    ["Вес детали", `${(product.weight * 1000).toFixed(0)} г`],
                    [
                      "Наличие",
                      product.stock.qty > 0
                        ? `${product.stock.qty.toLocaleString("ru-RU")} шт`
                        : product.stock.lead!,
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-6 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    CAD-ассеты для проектировщика · без регистрации
                  </p>
                  {(
                    [
                      ["step", "Скачать модель STEP", "Твердотельная 3D", Layers, product.engineering_assets.model_step_url],
                      ["dwg", "Скачать чертёж DWG", "AutoCAD 2D", Ruler, product.engineering_assets.model_dwg_url],
                      ["pdf", "Технический паспорт PDF", "Схема, ГОСТы, допуски", FileText, product.engineering_assets.passport_pdf_url],
                    ] as const
                  ).map(([fmt, label, hint, Icon, href]) => (
                    <a
                      key={fmt}
                      href={href}
                      download
                      onClick={() => trackCadDownload(product.sku, fmt)}
                      className="flex items-center gap-3 rounded-sm border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className="hidden shrink-0 text-xs font-normal text-muted-foreground sm:inline">
                        {hint}
                      </span>
                      <Download className="size-4 shrink-0" strokeWidth={1.75} />
                    </a>
                  ))}
                </div>

                <div className="mt-6 rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Truck className="size-4" strokeWidth={1.5} /> Логистика на партию 1 000 шт
                    </p>
                    <CityInput value={city} onChange={setCity} />
                  </div>

                  <ul className="mt-3 space-y-2 text-sm">
                    {logistics.map((l) => (
                      <li key={l.name} className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          {l.name} · {l.days}
                        </span>
                        <span className="font-medium tabular-nums text-foreground">
                          {l.cost.toLocaleString("ru-RU")} ₽
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  className="mt-4 text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Запросить спец. условия на партию от 50 000 шт →
                </button>
              </div>
            </div>

            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
