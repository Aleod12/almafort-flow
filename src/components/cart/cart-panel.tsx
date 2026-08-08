import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, FileDown, Loader2, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PRODUCTS, type Product } from "@/data/catalog";
import { scoreMatch } from "@/lib/fuzzy-search";
import { useDebounce } from "@/hooks/use-debounce";
import { CityInput } from "@/components/cart/city-input";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { saveLastOrder } from "@/lib/last-order";
import { ConsentCheckbox } from "@/components/consent-checkbox";
import {
  cartTotals,
  deliveryCost,
  linePrice,
  useCart,
  type Carrier,
} from "@/store/cart-store";

const money = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CARRIERS: Array<{ id: Carrier; label: string }> = [
  { id: "cdek", label: "СДЭК" },
  { id: "dl", label: "Деловые Линии" },
  { id: "pickup", label: "Самовывоз" },
];

const TIER_LABEL = ["базовая", "от 1 000 шт", "от 5 000 шт"];

export function CartPanel() {
  const lines = useCart((s) => s.lines);
  const analogs = useCart((s) => s.analogs);
  const unmapped = useCart((s) => s.unmapped);
  const carrier = useCart((s) => s.carrier);
  const city = useCart((s) => s.city);
  const setCarrier = useCart((s) => s.setCarrier);
  const fiasId = useCart((s) => s.fiasId);
  const setDestination = useCart((s) => s.setDestination);
  const setQuantity = useCart((s) => s.setQuantity);
  const removeLine = useCart((s) => s.removeLine);
  const confirmAnalog = useCart((s) => s.confirmAnalog);
  const rejectAnalog = useCart((s) => s.rejectAnalog);
  const resolveUnmapped = useCart((s) => s.resolveUnmapped);
  const removeUnmapped = useCart((s) => s.removeUnmapped);
  const clear = useCart((s) => s.clear);
  const navigate = useNavigate();
  const quotes = useCart((s) => s.quotes);
  const quoting = useCart((s) => s.quoting);
  const quoteError = useCart((s) => s.quoteError);
  const setQuotes = useCart((s) => s.setQuotes);
  const setQuoting = useCart((s) => s.setQuoting);
  const setQuoteError = useCart((s) => s.setQuoteError);

  const { goods, weight, volume } = useMemo(() => cartTotals(lines), [lines]);

  // Единый дебаунс 500 мс: и на ввод города, и на изменение габаритов партии —
  // один запрос к ТК вместо шквала при наборе количества.
  const payloadKey = `${city.trim()}|${fiasId ?? ""}|${weight}|${volume}`;
  const debouncedKey = useDebounce(payloadKey, 500);

  // Запрос в /api/shipping-calc: параллельно СДЭК + Деловые Линии на бэкенде.
  useEffect(() => {
    const [city0 = "", fias0 = "", w0 = "0", v0 = "0"] = debouncedKey.split("|");
    const totalWeight = Number(w0);
    const totalVolume = Number(v0);
    if (city0.length < 2 || totalWeight <= 0) {
      setQuotes([]);
      return;
    }
    const ctrl = new AbortController();
    let alive = true;
    setQuoting(true);
    (async () => {
      try {
        const res = await fetch("/api/shipping-calc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: { city: city0, fias_id: fias0 || null },
            parcel: { totalWeight, totalVolume },
          }),
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json?.error ?? "Не удалось рассчитать доставку");
        setQuotes(json.quotes);
      } catch (e) {
        if ((e as Error).name !== "AbortError" && alive)
          setQuoteError(e instanceof Error ? e.message : "Ошибка расчёта доставки");
      } finally {
        if (alive) setQuoting(false);
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [debouncedKey, setQuotes, setQuoting, setQuoteError]);

  const quoteFor = (c: Carrier) => quotes.find((q) => q.carrier === c);
  const delivery =
    carrier === "pickup" ? 0 : (quoteFor(carrier)?.price ?? deliveryCost(carrier, weight));
  const total = goods + delivery;

  const pendingQuote =
    quoting ||
    (carrier !== "pickup" &&
      city.trim().length >= 2 &&
      weight > 0 &&
      (payloadKey !== debouncedKey || !quoteFor(carrier)));
  const [consent, setConsent] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const ctaDisabled = !lines.length || pendingQuote || !consent;

  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "", comment: "" });
  const [submitting, setSubmitting] = useState(false);
  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submitOrder = async () => {
    if (!lines.length) {
      toast.error("Корзина пуста — добавьте позиции или загрузите спецификацию");
      return;
    }
    if (form.name.trim().length < 2 || form.phone.replace(/\D/g, "").length < 10) {
      toast.error("Укажите имя и телефон — менеджер должен знать, кому подтверждать отгрузку");
      return;
    }
    setSubmitting(true);
    try {
      // PDF не должен блокировать заявку: если генерация подвисла — уходим без вложения.
      const invoicePdfBase64 = await Promise.race([
        generateInvoicePdf({ lines, carrier, city, delivery, output: "base64" }).catch(() => null),
        new Promise<null>((r) => window.setTimeout(() => r(null), 20000)),
      ]);

      const res = await fetch("/api/checkout/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            company: form.company.trim(),
            comment: form.comment.trim(),
          },
          city,
          carrier,
          deliveryPrice: delivery,
          goodsPrice: goods,
          total,
          items: lines.map((l) => {
            const { unit, sum } = linePrice(l.sku, l.quantity);
            return { sku: l.sku, name: l.name, quantity: l.quantity, unit, sum };
          }),
          ...(invoicePdfBase64 ? { invoicePdfBase64 } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Не удалось оформить заказ");

      saveLastOrder({
        orderId: json.orderId,
        lines,
        carrier,
        city,
        delivery,
        total,
        invoiceUrl: json.invoiceUrl ?? null,
      });
      clear();
      await navigate({ to: "/success" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось оформить заказ");
    } finally {
      setSubmitting(false);
    }
  };

  const download = async () => {
    if (ctaDisabled) return;
    if (!lines.length) {
      toast.error("Корзина пуста — добавьте позиции или загрузите спецификацию");
      return;
    }
    try {
      await generateInvoicePdf({ lines, carrier, city, delivery });
      toast.success("PDF-счёт сформирован");
    } catch {
      toast.error("Не удалось сформировать счёт");
    }
  };

  return (
    <div className="space-y-8">
      {/* Аналоги */}
      {analogs.length > 0 && (
        <section className="rounded-lg border border-[#F5C518]/60 bg-[#FFFBEB] p-6">
          <h3 className="text-base font-bold text-foreground">
            Найдены аналоги — требуется подтверждение ({analogs.length})
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Мы не отгружаем замены без вашего согласия. Сверьте строку из вашей сметы с нашей
            номенклатурой.
          </p>
          <ul className="mt-5 space-y-3">
            {analogs.map((a) => (
              <li
                key={a.id}
                className="grid gap-3 rounded-md bg-card p-4 shadow-[0_2px_6px_oklch(0_0_0/0.04)] md:grid-cols-[1fr_1fr_auto] md:items-center"
              >
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Ваша строка
                  </p>
                  <p className="text-sm font-medium text-foreground">{a.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.quantity.toLocaleString("ru-RU")} шт
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Наш аналог · совпадение {Math.round(a.matchConfidence * 100)}%
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {a.suggestedSku} — {a.suggestedName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => confirmAnalog(a.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Check className="size-4" strokeWidth={2} />
                    Подтвердить замену
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectAnalog(a.id)}
                    aria-label="Отклонить аналог"
                    className="grid size-9 cursor-pointer place-items-center rounded-sm border border-[#D1D5DB] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <X className="size-4" strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Корзина */}
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_110px_120px_120px_44px] items-center gap-3 border-b border-border bg-[#F8F9FA] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Позиция</span>
          <span className="text-right">Кол-во</span>
          <span className="text-right">Цена</span>
          <span className="text-right">Сумма</span>
          <span />
        </div>

        {lines.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Корзина пуста. Загрузите спецификацию — позиции подставятся автоматически.
          </p>
        )}

        {lines.map((l) => {
          const { base, unit, tier, sum } = linePrice(l.sku, l.quantity);
          const discounted = tier > 0;
          return (
            <div
              key={l.sku}
              className="grid grid-cols-[minmax(0,1fr)_110px_120px_120px_44px] items-center gap-3 border-b border-border px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {l.sku} — {l.name}
                </p>
                {l.originalName && l.originalName !== l.name && (
                  <p className="truncate text-xs text-muted-foreground">
                    из вашей сметы: {l.originalName}
                  </p>
                )}
              </div>
              <input
                inputMode="numeric"
                value={l.quantity}
                onChange={(e) =>
                  setQuantity(l.sku, Number(e.target.value.replace(/\D/g, "")) || 0)
                }
                className="w-full rounded-sm border border-[#D1D5DB] px-2 py-1.5 text-right text-sm tabular-nums outline-none transition-colors focus:border-foreground"
              />
              <div className="text-right text-sm tabular-nums">
                {discounted && (
                  <span className="mr-1 text-xs text-muted-foreground line-through">
                    {money(base)}
                  </span>
                )}
                <span
                  className={
                    discounted ? "font-semibold text-[oklch(0.5_0.15_150)]" : "text-foreground"
                  }
                >
                  {money(unit)}
                </span>
                <p className="text-[11px] text-muted-foreground">{TIER_LABEL[tier]}</p>
              </div>
              <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                {money(sum)}
              </div>
              <button
                type="button"
                onClick={() => removeLine(l.sku)}
                aria-label="Удалить позицию"
                className="grid size-8 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Trash2 className="size-4" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </section>

      {/* Не распознано */}
      {unmapped.length > 0 && (
        <section className="rounded-lg border border-primary/30 bg-card p-6">
          <h3 className="text-base font-bold text-primary">
            Не распознано ({unmapped.length})
          </h3>
          <ul className="mt-4 space-y-3">
            {unmapped.map((u) => (
              <UnmappedRow
                key={u.id}
                text={u.originalString}
                qty={u.quantity}
                onPick={(p) => resolveUnmapped(u.id, p)}
                onRemove={() => removeUnmapped(u.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Логистика и итог */}
      <section className="grid gap-6 rounded-lg border border-border bg-card p-6 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="text-sm font-semibold text-foreground">Доставка</p>
          <CityInput
            value={{ city, fiasId }}
            onChange={(v) => setDestination(v.city, v.fiasId)}
          />

          {quoting ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[74px] animate-pulse rounded-sm border border-[#E5E7EB] bg-[#F1F3F5]"
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Способ доставки">
              {CARRIERS.map((c) => {
                const q = quoteFor(c.id);
                const active = carrier === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCarrier(c.id)}
                    className={`flex cursor-pointer items-start gap-3 rounded-sm border-2 px-4 py-3 text-left transition-colors ${
                      active
                        ? "border-primary text-foreground"
                        : "border-[#D1D5DB] text-muted-foreground hover:border-[#9CA3AF] hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                        active ? "border-primary" : "border-[#9CA3AF]"
                      }`}
                    >
                      {active && <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{c.label}</span>
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                        {c.id === "pickup"
                          ? "0 ₽ · Красноярск / Дивногорск"
                          : q
                            ? `${money(q.price)} ₽ · ${q.days} дн. · ${q.toDoor ? "до двери" : "до терминала"}`
                            : "укажите город"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Партия: {weight.toFixed(1)} кг · {volume.toFixed(3)} м³ · отгрузка с терминалов
            Красноярска{quoteError ? ` · ${quoteError}` : ""}
          </p>
        </div>

        <div className="rounded-md border border-border p-5">
          <p className="text-sm font-semibold text-foreground">Контакты для счёта</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={form.name}
              onChange={field("name")}
              placeholder="Имя и фамилия*"
              className="h-11 rounded-sm border border-[#D1D5DB] px-3 text-sm outline-none transition-colors focus:border-primary"
            />
            <input
              value={form.phone}
              onChange={field("phone")}
              inputMode="tel"
              placeholder="Телефон*"
              className="h-11 rounded-sm border border-[#D1D5DB] px-3 text-sm outline-none transition-colors focus:border-primary"
            />
            <input
              value={form.email}
              onChange={field("email")}
              inputMode="email"
              placeholder="E-mail для счёта"
              className="h-11 rounded-sm border border-[#D1D5DB] px-3 text-sm outline-none transition-colors focus:border-primary"
            />
            <input
              value={form.company}
              onChange={field("company")}
              placeholder="Компания"
              className="h-11 rounded-sm border border-[#D1D5DB] px-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </div>
          <textarea
            value={form.comment}
            onChange={field("comment")}
            rows={2}
            placeholder="Комментарий к отгрузке"
            className="mt-3 w-full rounded-sm border border-[#D1D5DB] p-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>

        <div className="rounded-md bg-[#F8F9FA] p-5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Товары</span>
            <span className="tabular-nums text-foreground">{money(goods)} ₽</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Доставка</span>
            <span className="tabular-nums text-foreground">
              {delivery ? `${money(delivery)} ₽` : "самовывоз"}
            </span>
          </div>
          <div className="mt-4 flex justify-between border-t border-border pt-4">
            <span className="text-sm font-semibold text-foreground">Итого к оплате</span>
            <span className="text-lg font-extrabold tabular-nums text-foreground">
              {money(total)} ₽
            </span>
          </div>
          <div className="mt-5">
            <ConsentCheckbox
              id="consent-cart"
              checked={consent}
              onChange={setConsent}
              invalid={triedSubmit && !consent}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setTriedSubmit(true);
              void submitOrder();
            }}
            disabled={ctaDisabled || submitting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer"
          >
            {submitting && <Loader2 className="size-4 animate-spin" strokeWidth={2} />}
            {submitting ? "Передаём заказ менеджеру…" : "Оформить заказ"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={ctaDisabled}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-[#D1D5DB] px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 enabled:cursor-pointer"
          >
            <FileDown className="size-4" strokeWidth={2} />
            {pendingQuote && lines.length ? "Считаем доставку…" : "Скачать PDF-счёт"}
          </button>
          {lines.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="mt-3 w-full cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Очистить корзину
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function UnmappedRow({
  text,
  qty,
  onPick,
  onRemove,
}: {
  text: string;
  qty: number;
  onPick: (p: Product) => void;
  onRemove: () => void;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    return PRODUCTS.map((p) => ({ p, s: scoreMatch(`${p.name} ${p.sku} ${p.dims}`, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((r) => r.p);
  }, [q]);

  return (
    <li className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="mr-2 rounded-sm bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">
            Не распознано
          </span>
          <span className="text-sm text-foreground">{text}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {qty.toLocaleString("ru-RU")} шт
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-primary"
        >
          Убрать строку
        </button>
      </div>
      <div className="relative mt-3 flex items-center gap-2 rounded-sm border border-[#D1D5DB] px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Подобрать вручную по названию или артикулу"
          className="h-10 w-full bg-transparent text-sm outline-none"
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((p) => (
            <li key={p.sku}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="w-full cursor-pointer rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-[#F3F4F6]"
              >
                <span className="font-semibold">{p.sku}</span> — {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
