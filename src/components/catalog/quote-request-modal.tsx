import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { ConsentCheckbox } from "@/components/consent-checkbox";

/** Модальное окно «Запросить индивидуальный расчет» для позиций без цены. */
export function QuoteRequestModal({
  sku,
  name,
  onClose,
}: {
  sku: string;
  name: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", phone: "", qty: "" });
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const valid =
    form.name.trim().length >= 2 && form.phone.replace(/\D/g, "").length >= 10 && consent;

  const submit = async () => {
    setTried(true);
    if (!valid) return;
    setBusy(true);
    try {
      await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          quiz_answers: {
            Тип: "Запрос индивидуального расчёта",
            Артикул: sku,
            Позиция: name,
            "Требуемое количество": form.qty || "не указано",
            "Согласие 152-ФЗ": "получено",
          },
          file_urls: [],
        }),
      });
      toast.success("Запрос отправлен — менеджер вернётся с расчётом");
      onClose();
    } catch {
      toast.error("Не удалось отправить запрос — позвоните нам");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Запросить индивидуальный расчет"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[420px] rounded-lg bg-card p-7"
      >
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="absolute right-4 top-4 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X className="size-5" strokeWidth={1.75} />
        </button>
        <h3 className="pr-8 text-lg font-bold text-foreground [overflow-wrap:anywhere]">
          Запросить индивидуальный расчет
        </h3>
        <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {sku} · {name}
        </p>

        <div className="mt-5 grid gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Имя*"
            className="h-11 rounded-sm border border-[#D1D5DB] px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={form.phone}
            inputMode="tel"
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Телефон*"
            className="h-11 rounded-sm border border-[#D1D5DB] px-3 text-sm tabular-nums outline-none focus:border-primary"
          />
          <input
            value={form.qty}
            inputMode="numeric"
            onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value.replace(/\D/g, "") }))}
            placeholder="Требуемое количество, шт"
            className="h-11 rounded-sm border border-[#D1D5DB] px-3 text-sm tabular-nums outline-none focus:border-primary"
          />
        </div>

        <ConsentCheckbox
          id={`consent-quote-${sku}`}
          checked={consent}
          onChange={setConsent}
          invalid={tried}
        />

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!valid || busy}
          className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" strokeWidth={2} />}
          Отправить запрос
        </button>
      </div>
    </div>
  );
}
