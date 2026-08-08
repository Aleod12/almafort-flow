import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { readLastOrder, type LastOrder } from "@/lib/last-order";

export const Route = createFileRoute("/success")({
  head: () => ({
    meta: [
      { title: "Заказ оформлен — ALMAFORT" },
      {
        name: "description",
        content:
          "Заказ принят в работу: счёт передан в отдел отгрузки ALMAFORT, менеджер свяжется для подтверждения условий и сроков.",
      },
      { property: "og:title", content: "Заказ оформлен — ALMAFORT" },
      {
        property: "og:description",
        content: "Счёт сформирован и передан в отдел отгрузки. Менеджер свяжется для подтверждения.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  // sessionStorage читаем после гидрации, чтобы SSR и клиент совпали.
  const [order, setOrder] = useState<LastOrder | null>(null);
  useEffect(() => setOrder(readLastOrder()), []);

  const downloadCopy = async () => {
    if (!order) return;
    try {
      await generateInvoicePdf({
        lines: order.lines,
        carrier: order.carrier,
        city: order.city,
        delivery: order.delivery,
      });
    } catch {
      toast.error("Не удалось сформировать копию счёта");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[720px] px-5 pb-24 pt-20 lg:px-10">
        <CheckCircle2 className="size-14 text-primary" strokeWidth={1.5} />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground lg:text-[40px]">
          Заказ успешно оформлен
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Ваш счёт{" "}
          {order ? (
            <button
              type="button"
              onClick={downloadCopy}
              className="inline-flex cursor-pointer items-center gap-1 font-semibold text-primary underline underline-offset-4"
            >
              <FileDown className="size-4" strokeWidth={2} /> Скачать копию
            </button>
          ) : (
            <span className="font-semibold text-foreground">отправлен</span>
          )}{" "}
          отправлен на почту и передан в отдел отгрузки. Мы свяжемся с вами для подтверждения.
        </p>

        {order && (
          <dl className="mt-10 grid gap-3 rounded-lg bg-[#F8F9FA] p-6 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Номер заказа</dt>
              <dd className="font-semibold text-foreground">{order.orderId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Позиций</dt>
              <dd className="tabular-nums text-foreground">{order.lines.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Доставка</dt>
              <dd className="text-foreground">
                {order.carrier === "pickup"
                  ? "Самовывоз, Дивногорск"
                  : `${order.carrier === "cdek" ? "СДЭК" : "Деловые Линии"}${order.city ? `, ${order.city}` : ""}`}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-3">
              <dt className="font-semibold text-foreground">Итого к оплате</dt>
              <dd className="text-lg font-extrabold tabular-nums text-foreground">
                {order.total.toLocaleString("ru-RU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                ₽
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/catalog"
            className="rounded-sm bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Вернуться в каталог
          </Link>
          <Link
            to="/"
            className="rounded-sm border border-[#D1D5DB] px-6 py-3 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            На главную
          </Link>
        </div>
      </main>
    </div>
  );
}
