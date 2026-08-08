import { useMemo, useState } from "react";
import { Box, Download, Grid3x3, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/data/catalog";

const CITIES = ["Екатеринбург", "Москва", "Новосибирск", "Казань"];

export function ProductSheet({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const [wire, setWire] = useState(false);
  const [angle, setAngle] = useState(24);
  const [city, setCity] = useState(CITIES[0]!);

  const logistics = useMemo(() => {
    if (!product) return [];
    const batch = 1000;
    const w = product.weight * batch;
    return [
      { name: "СДЭК (до двери)", days: "4 дня", cost: Math.round(900 + w * 9) },
      { name: "Деловые Линии (до терминала)", days: "отгрузка в среду", cost: Math.round(500 + w * 5) },
      { name: "ПЭК (до терминала)", days: "5 дней", cost: Math.round(480 + w * 4.6) },
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
                <div className="grid h-72 place-items-center rounded-lg bg-surface">
                  <div
                    onMouseMove={(e) => setAngle((e.nativeEvent.offsetX / 4) % 360)}
                    className="size-40 rounded-md transition-transform duration-100"
                    style={{
                      transform: `perspective(700px) rotateY(${angle}deg) rotateX(14deg)`,
                      background: wire
                        ? "repeating-linear-gradient(45deg, var(--dashed) 0 1px, transparent 1px 10px), repeating-linear-gradient(-45deg, var(--dashed) 0 1px, transparent 1px 10px)"
                        : "linear-gradient(150deg, oklch(0.97 0 0), oklch(0.86 0.005 264))",
                      border: "1px solid var(--border)",
                      boxShadow: "0 24px 40px -20px oklch(0 0 0 / 0.35)",
                    }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Проведите курсором для вращения модели
                  </p>
                  <button
                    type="button"
                    onClick={() => setWire((v) => !v)}
                    className="flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
                  >
                    {wire ? <Box className="size-3.5" /> : <Grid3x3 className="size-3.5" />}
                    {wire ? "Материал" : "Сетка (Wireframe)"}
                  </button>
                </div>
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

                <button
                  type="button"
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-6 py-4 text-base font-bold text-primary-foreground hover:opacity-90"
                >
                  <Download className="size-5" strokeWidth={2} />
                  Скачать BIM-модель / чертёж
                </button>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {["Модель STEP", "Чертёж DWG", "Паспорт PDF"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="flex items-center justify-center gap-1.5 rounded-sm border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
                    >
                      <Download className="size-3.5" strokeWidth={1.75} /> {d}
                    </button>
                  ))}
                </div>

                <div className="mt-6 rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Truck className="size-4" strokeWidth={1.5} /> Логистика на партию 1 000 шт
                    </p>
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      aria-label="Ваш город"
                      className="rounded-sm border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
                    >
                      {CITIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
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
