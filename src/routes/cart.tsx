import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { CartPanel } from "@/components/cart/cart-panel";
import { ParsingSkeleton, SpecUpload } from "@/components/cart/spec-upload";
import { useCart } from "@/store/cart-store";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "B2B-корзина ALMAFORT — спецификация в счёт за минуту" },
      {
        name: "description",
        content:
          "Загрузите смету в Excel или CSV: система распознает артикулы, подберёт аналоги, применит оптовые скидки и сформирует PDF-счёт без НДС.",
      },
      { property: "og:title", content: "B2B-корзина ALMAFORT — парсинг спецификаций" },
      {
        property: "og:description",
        content:
          "Автоматический разбор спецификаций, каскадные оптовые цены, расчёт доставки и мгновенный PDF-счёт.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const parsing = useCart((s) => s.parsing);
  const fileName = useCart((s) => s.fileName);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[1100px] px-5 pb-24 pt-10 lg:px-10">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground lg:text-[40px]">
            Спецификация → счёт
          </h1>
          <p className="mt-3 max-w-[70ch] text-sm leading-[1.6] text-muted-foreground lg:text-base">
            Загрузите файл сметы: алгоритм пройдёт по всем листам, отбросит логотипы и реквизиты,
            найдёт артикулы точно, по габаритам и нечётким поиском, применит оптовые скидки и
            выдаст готовый PDF-счёт без НДС.
          </p>
          {fileName && (
            <p className="mt-3 text-xs text-muted-foreground">Файл: {fileName}</p>
          )}
        </header>

        <div className="mb-10">{parsing ? <ParsingSkeleton /> : <SpecUpload />}</div>

        <CartPanel />
      </main>
    </div>
  );
}
