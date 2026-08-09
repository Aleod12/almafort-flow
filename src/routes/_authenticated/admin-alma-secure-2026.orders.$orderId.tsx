import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminAttachDocument,
  adminGetOrder,
  adminSetOrderStatus,
  adminUpdateOrderItems,
} from "@/lib/admin.functions";
import { ADMIN_BASE, STATUS_COLOR } from "@/lib/admin";
import { STAGES } from "@/lib/loyalty";
import { formatPrice } from "@/lib/pricing";
import { PRODUCTS } from "@/data/catalog";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026/orders/$orderId")({
  component: OrderCard,
});

type Line = { sku: string; name: string; quantity: number; unit: number; sum: number };

function OrderCard() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(adminGetOrder);
  const saveItems = useServerFn(adminUpdateOrderItems);
  const setStatus = useServerFn(adminSetOrderStatus);
  const attach = useServerFn(adminAttachDocument);

  const { data } = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => get({ data: { id: orderId } }),
  });

  const [lines, setLines] = useState<Line[]>([]);
  const [newSku, setNewSku] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docKind, setDocKind] = useState<"invoice" | "upd" | "contract" | "other">("upd");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data?.order) setLines((data.order.items as Line[]) ?? []);
  }, [data?.order]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-order", orderId] });

  const itemsMutation = useMutation({
    mutationFn: () =>
      saveItems({
        data: {
          id: orderId,
          updatedAt: String(data!.order.updated_at),
          items: lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
        },
      }),
    onSuccess: (r) => {
      setMsg(`Спецификация пересчитана: ${formatPrice(r.total)}`);
      invalidate();
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (stage: (typeof STAGES)[number]) =>
      setStatus({ data: { id: orderId, status: stage.id, title: stage.title } }),
    onSuccess: () => {
      setMsg("Статус обновлён, клиент получит уведомление");
      invalidate();
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const docMutation = useMutation({
    mutationFn: () =>
      attach({ data: { orderId, kind: docKind, title: docTitle, url: docUrl } }),
    onSuccess: () => {
      setDocTitle("");
      setDocUrl("");
      setMsg("Документ доступен клиенту в личном кабинете");
      invalidate();
    },
    onError: (e: Error) => setMsg(e.message),
  });

  if (!data) return <p className="text-muted-foreground">Загрузка…</p>;
  const { order, events, documents, company } = data;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={ADMIN_BASE} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          ← Реестр
        </Link>
        <h1 className="text-2xl font-bold">Заказ {order.number}</h1>
        <span className={`rounded-full border px-2.5 py-1 text-xs ${STATUS_COLOR[order.status] ?? ""}`}>
          {STAGES.find((s) => s.id === order.status)?.title ?? order.status}
        </span>
      </div>

      {msg && <div className="rounded-lg border bg-background px-4 py-3 text-sm">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border bg-background p-6">
            <h2 className="mb-4 font-semibold">Состав спецификации</h2>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l.sku} className="flex items-center gap-3 border-b pb-2 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.sku}</div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x, xi) =>
                          xi === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x,
                        ),
                      )
                    }
                    className="w-24 rounded-md border bg-background px-2 py-1 text-right tabular-nums"
                  />
                  <span className="w-32 text-right tabular-nums">{formatPrice(l.sum)}</span>
                  <button
                    onClick={() => setLines((prev) => prev.filter((_, xi) => xi !== i))}
                    className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-red-50 hover:text-red-700"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <select
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Добавить позицию…</option>
                {PRODUCTS.map((p) => (
                  <option key={p.sku} value={p.sku}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!newSku}
                onClick={() => {
                  const p = PRODUCTS.find((x) => x.sku === newSku);
                  if (!p) return;
                  setLines((prev) =>
                    prev.some((l) => l.sku === p.sku)
                      ? prev
                      : [...prev, { sku: p.sku, name: p.name, quantity: 1, unit: p.price, sum: p.price }],
                  );
                  setNewSku("");
                }}
                className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-40"
              >
                Добавить
              </button>
              <button
                onClick={() => itemsMutation.mutate()}
                disabled={itemsMutation.isPending}
                className="ml-auto rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#B91C1C] hover:shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                Пересчитать и сохранить
              </button>
            </div>

            <dl className="mt-5 space-y-1 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Товары</dt>
                <dd className="tabular-nums">{formatPrice(Number(order.goods_price))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Доставка ({order.carrier ?? "—"})</dt>
                <dd className="tabular-nums">{formatPrice(Number(order.delivery_price))}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Итого</dt>
                <dd className="tabular-nums">{formatPrice(Number(order.total))}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <h2 className="mb-4 font-semibold">Документы</h2>
            <ul className="mb-4 space-y-2 text-sm">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between border-b pb-2">
                  <span>{d.title}</span>
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-primary underline">
                    Открыть
                  </a>
                </li>
              ))}
              {!documents.length && <li className="text-muted-foreground">Пока пусто</li>}
            </ul>
            <div className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]">
              <select
                value={docKind}
                onChange={(e) => setDocKind(e.target.value as typeof docKind)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="upd">УПД</option>
                <option value="invoice">Счёт</option>
                <option value="contract">Договор</option>
                <option value="other">Прочее</option>
              </select>
              <input
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Название"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <input
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="Ссылка в хранилище (S3)"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <button
                disabled={!docTitle || !docUrl || docMutation.isPending}
                onClick={() => docMutation.mutate()}
                className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-40"
              >
                Прикрепить
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-background p-6">
            <h2 className="mb-3 font-semibold">Контрагент</h2>
            {company ? (
              <dl className="space-y-1 text-sm">
                <div className="font-medium">{company.name}</div>
                <div className="text-muted-foreground">ИНН {company.inn}</div>
                <div className="text-muted-foreground">{company.legal_address ?? "—"}</div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Компания не привязана</p>
            )}
            <p className="mt-3 text-sm text-muted-foreground">Город доставки: {order.city || "—"}</p>
          </div>

          <div className="rounded-xl border bg-background p-6">
            <h2 className="mb-3 font-semibold">Таймлайн</h2>
            <select
              value={order.status}
              onChange={(e) => {
                const stage = STAGES.find((s) => s.id === e.target.value);
                if (stage) statusMutation.mutate(stage);
              }}
              className="mb-4 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.title}
                </option>
              ))}
            </select>
            <ol className="space-y-3 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 pl-3">
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("ru-RU")} · {e.source}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
