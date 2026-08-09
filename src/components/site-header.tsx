import { useEffect, useState } from "react";
import { Clock, MapPin, Phone, UserRound, Menu } from "lucide-react";

const NAV = [
  { label: "Каталог", href: "/catalog" },
  { label: "Производство", href: "/#services" },
  { label: "Реверс-инжиниринг", href: "/#reverse" },
  { label: "Доставка", href: "/#delivery" },
  { label: "Контакты", href: "/#contacts" },
];


export function SiteHeader() {
  const [elevated, setElevated] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 bg-background"
      style={elevated ? { boxShadow: "var(--shadow-header)" } : undefined}
    >
      <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 lg:flex lg:items-center lg:justify-between lg:gap-6 lg:px-10 xl:gap-10">
        <a href="/" className="flex min-w-0 shrink-0 items-center">
          <span className="text-xl font-extrabold tracking-tight text-primary">ALMAFORT</span>
        </a>

        <nav className="hidden lg:flex lg:items-center lg:gap-5 xl:gap-7">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="whitespace-nowrap text-sm font-medium text-foreground hover:text-primary"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex lg:shrink-0 lg:items-center lg:gap-4 xl:gap-5">
          <span className="hidden items-center gap-2 whitespace-nowrap text-[13px] leading-none text-muted-foreground xl:flex">
            <Clock className="size-4 shrink-0" strokeWidth={1.5} />
            Пн-Пт 08:00–19:00 (МСК+4)
          </span>
          <span className="hidden max-w-[220px] items-center gap-2 text-[13px] leading-none text-muted-foreground 2xl:flex">
            <MapPin className="size-4 shrink-0" strokeWidth={1.5} />
            <span className="truncate">Нижний проезд, 15/1</span>
          </span>
          <a
            href="tel:+79029229734"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[14px] font-semibold leading-none text-foreground hover:text-primary"
            style={{ whiteSpace: "nowrap" }}
          >
            <Phone className="size-4 shrink-0" strokeWidth={1.5} />
            +7&nbsp;(902)&nbsp;922-97-34
          </a>

          <a
            href="/cabinet"
            aria-label="Личный кабинет"
            className="grid size-9 shrink-0 place-items-center rounded-sm border border-border text-foreground hover:border-primary hover:text-primary"
          >
            <UserRound className="size-4" strokeWidth={1.5} />
          </a>
        </div>


        <div className="flex items-center gap-2 justify-self-end lg:hidden">
          <a
            href="tel:+79029229734"
            aria-label="Позвонить"
            className="grid size-10 place-items-center rounded-sm border border-border text-foreground"
          >
            <Phone className="size-4" strokeWidth={1.5} />
          </a>
          <button
            type="button"
            aria-label="Меню"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-sm border border-border text-foreground"
          >
            <Menu className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-5 py-4 lg:hidden">
          <nav className="flex flex-col gap-3">
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
            <a
              href="/cabinet"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-foreground"
            >
              Личный кабинет
            </a>
          <p className="mt-4 text-xs text-muted-foreground">
            Пн-Пт 08:00–19:00 (МСК+4) · г. Дивногорск, Нижний проезд, 15/1
          </p>
        </div>
      )}
    </header>
  );
}
