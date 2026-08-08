import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Boxes, FileCheck2, Timer, Truck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SpecDropzone } from "@/components/spec-dropzone";
import { PlatformTerminal } from "@/components/platform-terminal";
import { ProductionSection } from "@/components/services/production-section";
import { TrustSection } from "@/components/trust/trust-section";
import { FaqSection } from "@/components/faq-section";
import { SiteFooter } from "@/components/site-footer";

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  additionalType: "https://schema.org/Organization",
  name: "ALMAFORT",
  description:
    "Производство пластиковых комплектующих: серийное литьё, промышленная 3D-печать, реверс-инжиниринг.",
  url: "https://almafort.ru/",
  telephone: "+7 (902) 922-97-34",
  email: "sales@almafort.ru",
  geo: { "@type": "GeoCoordinates", latitude: 55.9578, longitude: 92.3711 },
  founder: { "@type": "Person", name: "Сазонов Евгений Олегович" },
  employee: {
    "@type": "Person",
    name: "Сазонов Евгений Олегович",
    jobTitle: "Руководитель производства, эксперт по аддитивным технологиям",
  },
  address: {
    "@type": "PostalAddress",
    streetAddress: "Нижний проезд, 15/1",
    addressLocality: "Дивногорск",
    addressRegion: "Красноярский край",
    addressCountry: "RU",
  },
  openingHours: "Mo-Fr 08:00-19:00",
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "08:00",
    closes: "19:00",
  },
  brand: {
    "@type": "Brand",
    name: "ALMAFORT",
    identifier: {
      "@type": "PropertyValue",
      name: "Свидетельство на товарный знак (Роспатент)",
      value: "1192250",
    },
  },
  hasCredential: {
    "@type": "EducationalOccupationalCredential",
    name: "Сертификация по промышленной 3D-печати и реверс-инжинирингу",
    recognizedBy: { "@type": "Organization", name: "АО «Центр аддитивных технологий»" },
  },
};



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ALMAFORT — завод пластиковой фурнитуры для B2B" },
      {
        name: "description",
        content:
          "Завод-производитель пластиковых комплектующих: серийное литьё, 3D-печать, реверс-инжиниринг. Оптовые заказы онлайн, отгрузка за 24 часа, ЭДО.",
      },
      { property: "og:title", content: "ALMAFORT — завод пластиковой фурнитуры для B2B" },
      {
        property: "og:description",
        content:
          "Прямые поставки от завода: серийное литьё, 3D-печать, реверс-инжиниринг. Загрузите спецификацию и получите счёт.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FACTS = [
  { icon: Boxes, label: "6 термопластавтоматов" },
  { icon: FileCheck2, label: "Документооборот по ЭДО" },
  { icon: Timer, label: "Отгрузка от 1 дня" },
  { icon: Truck, label: "Бесплатная доставка до ТК" },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-[1440px] px-5 lg:px-10">
        <section className="grid grid-cols-1 items-center gap-12 py-12 lg:grid-cols-12 lg:gap-14 lg:py-20">
          <div className="lg:col-span-7">
            <div className="flex flex-wrap gap-2">
              {["Работаем с 2006 года", "Вся продукция по ГОСТ"].map((b) => (
                <span
                  key={b}
                  className="rounded-[4px] border border-primary bg-background px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {b}
                </span>
              ))}
            </div>

            <h1 className="mt-4 max-w-[650px] text-[32px] font-extrabold leading-[1.1] tracking-tight text-foreground lg:text-[56px]">
              Производство пластиковых комплектующих для B2B
            </h1>

            <p className="mt-6 max-w-[58ch] text-base leading-[1.5] text-muted-foreground lg:text-lg">
              Прямые поставки от производства. Серийное литье, 3D-печать и реверс-инжиниринг.
              Автоматический расчет логистики и обмен документами по ЭДО.
            </p>

            <div className="mt-10 lg:max-w-[650px]">
              <SpecDropzone />
              <a
                href="/catalog"
                className="group mt-6 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary hover:underline hover:decoration-primary hover:underline-offset-4"
              >
                Или перейти в каталог серийной продукции
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-1"
                  strokeWidth={1.75}
                />
              </a>

            </div>

            <ul className="no-scrollbar -mx-5 mt-12 flex snap-x gap-8 overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-8 sm:overflow-visible sm:px-0 lg:flex lg:gap-10">
              {FACTS.map((f) => (
                <li
                  key={f.label}
                  className="flex min-w-[210px] shrink-0 snap-start items-center gap-2 sm:min-w-0"
                >
                  <f.icon className="size-6 shrink-0 text-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-medium leading-none text-foreground">
                    {f.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5">
            <PlatformTerminal />
          </div>

        </section>
      </main>
      <ProductionSection />
      <TrustSection />
      <FaqSection />
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
      />


    </div>
  );
}
