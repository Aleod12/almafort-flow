import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { Product } from "@/data/catalog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { formatMoney } from "@/lib/pricing";
import {
  breadcrumbJsonLd,
  COLORS,
  facetDescription,
  facetH1,
  facetProducts,
  facetTitle,
  parseFacetPath,
  productJsonLd,
  shapeFacets,
  SITE_URL,
  sizeFacets,
  slugify,
} from "@/lib/seo";

type Search = { page?: number | undefined; sort?: string | undefined; utm_source?: string | undefined };

export const Route = createFileRoute("/catalog/$")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    page: search['page'] ? Number(search['page']) : undefined,
    sort: typeof search['sort'] === "string" ? search['sort'] : undefined,
    utm_source: typeof search['utm_source'] === "string" ? search['utm_source'] : undefined,
  }),
  loader: ({ params }): { facets: ReturnType<typeof parseFacetPath>; items: Product[] } => {
    const segments = (params._splat ?? "").split("/").filter(Boolean);
    const facets = parseFacetPath(segments);
    if (!facets.valid) throw notFound();
    const items = facetProducts(facets);
    return { facets, items };
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) {
      return { meta: [{ title: "Раздел не найден — ALMAFORT" }, { name: "robots", content: "noindex" }] };
    }
    const { facets, items } = loaderData;
    const title = facetTitle(facets);
    const description = facetDescription(facets, items);
    // Канонический URL — всегда чистый путь без ?sort / ?utm_source / ?page
    const canonical = `${SITE_URL}${facets.path}`;
    const paginated = Number((match.search as Search).page ?? 1) > 1;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(paginated ? [{ name: "robots", content: "noindex, follow" }] : []),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product.group" },
        { property: "og:url", content: canonical },
        { property: "og:image", content: `${SITE_URL}/og/catalog.jpg` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${SITE_URL}/og/catalog.jpg` },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: FacetPage,
  notFoundComponent: FacetNotFound,
});

function FacetNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[900px] px-5 py-24 text-center">
        <h1 className="text-3xl font-extrabold text-foreground">Раздел каталога не найден</h1>
        <p className="mt-3 text-muted-foreground">
          Проверьте адрес или вернитесь в общий каталог.
        </p>
        <Link to="/catalog" className="mt-6 inline-block font-semibold text-primary">
          Перейти в каталог →
        </Link>
      </main>
    </div>
  );
}

function FacetPage() {
  const { facets, items } = Route.useLoaderData();
  const crumbs = [
    { name: "Главная", path: "/" },
    { name: "Каталог", path: "/catalog" },
    ...(facets.category ? [{ name: facets.category.label, path: `/catalog/${facets.category.slug}` }] : []),
    ...(facets.shape && facets.category
      ? [{ name: facets.shape.label, path: `/catalog/${facets.category.slug}/${facets.shape.slug}` }]
      : []),
    ...(facets.size && facets.category && facets.shape
      ? [
          {
            name: facets.size.label,
            path: `/catalog/${facets.category.slug}/${facets.shape.slug}/${facets.size.slug}`,
          },
        ]
      : []),
  ];

  const childShapes = facets.category && !facets.shape ? shapeFacets(facets.category.slug) : [];
  const childSizes =
    facets.category && facets.shape && !facets.size
      ? sizeFacets(facets.category.slug, facets.shape.slug)
      : [];
  const childColors = facets.size && !facets.color ? COLORS : [];
  const base = facets.path;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[1200px] px-5 pb-24 pt-10 lg:px-10">
        <nav aria-label="Хлебные крошки" className="mb-6 text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={c.path}>
              {i > 0 && <span className="mx-2 text-border">/</span>}
              {i === crumbs.length - 1 ? (
                <span className="text-foreground">{c.name}</span>
              ) : (
                <a href={c.path} className="hover:text-primary">
                  {c.name}
                </a>
              )}
            </span>
          ))}
        </nav>

        <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-foreground lg:text-[40px]">
          {facetH1(facets)}
        </h1>
        <p className="mt-3 max-w-[70ch] text-sm leading-[1.6] text-muted-foreground">
          {facetDescription(facets, items)}
        </p>

        {(childShapes.length > 0 || childSizes.length > 0 || childColors.length > 0) && (
          <div className="mt-8 flex flex-wrap gap-2">
            {[...childShapes, ...childSizes, ...childColors].map((f) => (
              <a
                key={f.slug}
                href={`${base}/${f.slug}`}
                className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
              >
                {f.label}
              </a>
            ))}
          </div>
        )}

        <section className="mt-10" style={{ minHeight: 320 }} aria-label="Позиции раздела">
          <ul className="divide-y divide-border rounded-sm border border-border bg-card">
            {items.map((p) => (
              <li key={p.sku} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="w-[110px] shrink-0 font-mono text-xs text-muted-foreground">
                  {p.sku}
                </span>
                <span className="min-w-[220px] flex-1 text-sm font-semibold text-foreground">
                  {p.name}
                </span>
                <span className="w-[120px] text-sm tabular-nums text-muted-foreground">
                  {p.dims}
                </span>
                <span className="w-[140px] text-sm tabular-nums text-muted-foreground">
                  {p.stock.qty > 0 ? `${p.stock.qty.toLocaleString("ru-RU")} шт` : p.stock.lead}
                </span>
                <span className="w-[110px] text-right text-sm font-bold tabular-nums text-foreground">
                  {formatMoney(p.price)}
                </span>
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify(
                      productJsonLd(p, `${SITE_URL}/catalog/${slugify(p.category)}/${p.sku.toLowerCase()}`),
                    ),
                  }}
                />
              </li>
            ))}
          </ul>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
