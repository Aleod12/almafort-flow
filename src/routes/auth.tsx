import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { BackLink } from "@/components/back-link";
import { supabase } from "@/integrations/supabase/client";
import { ConsentCheckbox } from "@/components/consent-checkbox";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход в B2B-кабинет ALMAFORT — заказы, документы, статусы" },
      {
        name: "description",
        content:
          "Вход по ссылке на почту: статусы заказов, архив счетов и УПД, повтор закупки в один клик и персональный грейд цен.",
      },
      { property: "og:title", content: "Вход в B2B-кабинет ALMAFORT" },
      {
        property: "og:description",
        content: "Личный кабинет снабженца: сквозной трекинг заказов, документы и оптовые грейды.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/cabinet", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: "/cabinet", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const send = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      toast.error("Укажите рабочую почту — на неё придёт ссылка входа");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/cabinet` },
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-5 pb-24 pt-10">
        <BackLink fallback="/" label="На главную" className="mb-6" />
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">B2B-кабинет</h1>
        <p className="mt-3 text-sm leading-[1.6] text-muted-foreground">
          Без паролей. Введите рабочую почту — пришлём ссылку входа. Внутри: статусы заказов от
          станка до двери, архив счетов и УПД, повтор закупки в один клик и ваш грейд цен.
        </p>

        {sent ? (
          <div className="mt-8 rounded-sm border border-border bg-card p-6">
            <Mail className="size-6 text-primary" strokeWidth={1.75} />
            <p className="mt-3 text-sm font-semibold text-foreground">Ссылка отправлена</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Проверьте почту {email}. Ссылка действует ограниченное время — откройте её на этом же
              устройстве.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-4 cursor-pointer text-sm font-medium text-primary hover:underline"
            >
              Отправить ещё раз
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-4 rounded-sm border border-border bg-card p-6">
            <label className="block text-sm font-medium text-foreground">
              Рабочая почта <span className="text-primary">*</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && consent && send()}
                placeholder="snab@zavod.ru"
                autoComplete="email"
                className="mt-2 h-11 w-full rounded-sm border border-[#D1D5DB] px-3.5 text-sm outline-none transition-colors focus:border-foreground"
              />
            </label>
            <ConsentCheckbox checked={consent} onChange={setConsent} />
            <button
              type="button"
              disabled={!consent || sending}
              onClick={send}
              className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-primary text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-[#B91C1C] hover:shadow-[0_8px_20px_oklch(0_0_0/0.18)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending && <Loader2 className="size-4 animate-spin" />}
              Получить ссылку для входа
            </button>
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          Нет заказов? <Link to="/catalog" className="font-medium text-primary hover:underline">Начните с каталога</Link>.
        </p>
      </main>
    </div>
  );
}
