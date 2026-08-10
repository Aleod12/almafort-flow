import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/data/catalog";
import { formatPrice } from "@/lib/pricing";

const field =
  "h-11 w-full rounded-sm border border-[#D1D5DB] px-3 text-base outline-none transition-colors focus:border-foreground";

/**
 * Заявка на спеццену: Bottom Sheet на мобильном, модалка по центру на десктопе.
 * Артикул, название и базовая цена подставляются из карточки автоматически.
 */
export function BulkRequestDialog({
  product,
  open,
  onClose,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
}) {
  const minQty = Math.max(product.tier2Qty || 50000, 1000);
  const [qty, setQty] = useState(String(minQty));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [inn, setInn] = useState("");
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  // Авторизованному снабженцу не нужно вводить контакты заново.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid || !alive) return;
      setEmail((e) => e || sess.session?.user.email || "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", uid)
        .maybeSingle();
      const { data: company } = await supabase
        .from("companies")
        .select("inn")
        .eq("user_id", uid)
        .maybeSingle();
      if (!alive) return;
      if (profile?.full_name) setName((v) => v || profile.full_name!);
      if (profile?.phone) setPhone((v) => v || profile.phone!);
      if (company?.inn) setInn((v) => v || company.inn!);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const submit = async () => {
    setError("");
    const qtyNum = Number(qty.replace(/\D/g, ""));
    if (!Number.isFinite(qtyNum) || qtyNum < minQty) {
      setError(`Минимальный объём запроса — ${minQty.toLocaleString("ru-RU")} шт`);
      return;
    }
    if (name.trim().length < 2 || phone.replace(/\D/g, "").length < 10) {
      setError("Укажите имя и телефон для связи");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: product.sku,
          product_name: product.name,
          base_price: product.price,
          qty: qtyNum,
          contact_name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          inn: inn.trim(),
          comment: comment.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Ошибка отправки");
      setState("done");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Ошибка отправки");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bottom-0 top-auto max-h-[88vh] w-full max-w-full translate-y-0 overflow-y-auto rounded-t-2xl px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-1/2 sm:max-w-lg sm:-translate-y-1/2 sm:rounded-lg sm:pb-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">Спеццена на крупную партию</DialogTitle>
        </DialogHeader>

        {state === "done" ? (
          <div className="space-y-3 py-4 text-sm">
            <p className="font-semibold text-foreground">Заявка принята.</p>
            <p className="text-muted-foreground">
              Отдел оптовых продаж пришлёт расчёт по {product.name} ({product.sku}) в течение
              рабочего дня.
            </p>
            <button type="button" onClick={onClose} className="h-12 w-full rounded-sm bg-foreground text-sm font-semibold text-background">
              Закрыть
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-sm bg-surface p-3 text-sm">
              <p className="font-semibold text-foreground">{product.name}</p>
              <p className="text-xs text-muted-foreground">
                Артикул {product.sku} · базовая цена {formatPrice(product.price)}
              </p>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                Желаемый объём, шт
              </span>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                className={field}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя и компания"
                className={field}
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Телефон"
                inputMode="tel"
                className={field}
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail (необязательно)"
                inputMode="email"
                className={field}
              />
              <input
                value={inn}
                onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="ИНН (необязательно)"
                inputMode="numeric"
                pattern="[0-9]*"
                className={field}
              />
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Сроки, цвет, доставка — что важно учесть"
              rows={3}
              className="w-full rounded-sm border border-[#D1D5DB] p-3 text-base outline-none focus:border-foreground"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={state === "sending"}
              className="h-12 w-full rounded-sm bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {state === "sending" ? "Отправляем…" : "Отправить запрос в отдел оптовых продаж"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
