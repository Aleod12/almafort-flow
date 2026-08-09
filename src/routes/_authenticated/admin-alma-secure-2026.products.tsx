import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminImportProductsCsv,
  adminListProducts,
  adminSaveProducts,
} from "@/lib/admin.functions";
import { formatPrice } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026/products")({
  component: Pim,
});

type Draft = Record<
  string,
  { base_price: number; opt1_price: number; opt2_price: number; stock: number; synonyms: string }
>;

function Pim() {
  const qc = useQueryClient();
  const list = useServerFn(adminListProducts);
  const save = useServerFn(adminSaveProducts);
  const importCsv = useServerFn(adminImportProductsCsv);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const { data } = useQuery({ queryKey: ["admin-products"], queryFn: () => list() });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    return needle
      ? all.filter(
          (r) => r.sku.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle),
        )
      : all;
  }, [data, q]);

  const patch = (sku: string, field: keyof Draft[string], value: string, row: (typeof rows)[number]) =>
    setDraft((d) => ({
      ...d,
      [sku]: {
        base_price: d[sku]?.base_price ?? row.base_price,
        opt1_price: d[sku]?.opt1_price ?? row.opt1_price,
        opt2_price: d[sku]?.opt2_price ?? row.opt2_price,
        stock: d[sku]?.stock ?? row.stock,
        synonyms: d[sku]?.synonyms ?? row.synonyms.join(", "),
        [field]: field === "synonyms" ? value : Number(value.replace(",", ".")) || 0,
      },
    }));

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          rows: Object.entries(draft).map(([sku, v]) => ({
            sku,
            base_price: v.base_price,
            opt1_price: v.opt1_price,
            opt2_price: v.opt2_price,
            stock: Math.round(v.stock),
            synonyms: v.synonyms
              .split(/[,|]/)
              .map((s) => s.trim())
              .filter(Boolean),
          })),
        },
      }),
    onSuccess: (r) => {
      setMsg(`Обновлено позиций: ${r.updated}. Поисковый индекс перестроен.`);
      setDraft({});
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const csvMutation = useMutation({
    mutationFn: (csv: string) => importCsv({ data: { csv } }),
    onSuccess: (r) => {
      setErrors(r.errors);
      setMsg(r.ok ? `Импорт выполнен: ${r.updated} позиций` : "Импорт отклонён: проверьте ошибки");
      if (r.ok) qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const dirty = Object.keys(draft).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Товарная матрица</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по SKU или названию"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <label className="cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted">
          Импорт CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) csvMutation.mutate(await file.text());
              e.target.value = "";
            }}
          />
        </label>
        <button
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#B91C1C] hover:shadow-md active:scale-[0.98] disabled:opacity-40"
        >
          Сохранить {dirty ? `(${dirty})` : ""}
        </button>
      </div>

      {msg && <div className="rounded-lg border bg-background px-4 py-3 text-sm">{msg}</div>}
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.slice(0, 20).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Колонки CSV: sku, base_price, opt1_price, opt2_price, stock, synonyms (через «|»).
      </p>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">SKU</th>
              <th className="px-3 py-3">Наименование</th>
              <th className="px-3 py-3 text-right">База</th>
              <th className="px-3 py-3 text-right">Опт 1</th>
              <th className="px-3 py-3 text-right">Опт 2</th>
              <th className="px-3 py-3 text-right">Остаток</th>
              <th className="px-3 py-3">Синонимы поиска</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = draft[r.sku];
              const cell = (field: "base_price" | "opt1_price" | "opt2_price" | "stock") => (
                <td className="px-3 py-2 text-right">
                  <input
                    value={d ? d[field] : r[field]}
                    onChange={(e) => patch(r.sku, field, e.target.value, r)}
                    inputMode="decimal"
                    className="w-24 rounded-md border bg-background px-2 py-1 text-right tabular-nums focus:border-[#DC2626] focus:outline-none"
                  />
                </td>
              );
              return (
                <tr key={r.sku} className={`border-t ${d ? "bg-amber-50/60" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                  <td className="px-3 py-2">
                    <div>{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.category} · база в каталоге {formatPrice(r.base_price)}
                    </div>
                  </td>
                  {cell("base_price")}
                  {cell("opt1_price")}
                  {cell("opt2_price")}
                  {cell("stock")}
                  <td className="px-3 py-2">
                    <input
                      value={d ? d.synonyms : r.synonyms.join(", ")}
                      onChange={(e) => patch(r.sku, "synonyms", e.target.value, r)}
                      placeholder="затычка, чопик"
                      className="w-full min-w-[180px] rounded-md border bg-background px-2 py-1 focus:border-[#DC2626] focus:outline-none"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
