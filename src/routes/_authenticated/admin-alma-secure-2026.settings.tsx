import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetSettings,
  adminListStaff,
  adminSaveApiKey,
  adminSaveSetting,
  adminSetStaffRole,
} from "@/lib/admin.functions";
import { ROLE_LABEL, type AdminRole } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026/settings")({
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const get = useServerFn(adminGetSettings);
  const saveSetting = useServerFn(adminSaveSetting);
  const saveKey = useServerFn(adminSaveApiKey);
  const staffList = useServerFn(adminListStaff);
  const setRole = useServerFn(adminSetStaffRole);

  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: () => get() });
  const { data: staff } = useQuery({ queryKey: ["admin-staff"], queryFn: () => staffList() });

  const [maintenance, setMaintenance] = useState({ enabled: false, message: "" });
  const [logistics, setLogistics] = useState({ fixed_rub: 0, percent: 0 });
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [role, setRoleValue] = useState<AdminRole>("manager");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setMaintenance(data.maintenance);
      setLogistics(data.logistics);
    }
  }, [data]);

  const settingMutation = useMutation({
    mutationFn: (v: { key: "maintenance_mode" | "logistics_markup"; value: Record<string, string | number | boolean> }) =>
      saveSetting({ data: v }),
    onSuccess: () => {
      setMsg("Настройки применены");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const keyMutation = useMutation({
    mutationFn: (v: { name: string; value: string }) => saveKey({ data: v }),
    onSuccess: () => {
      setMsg("Ключ зашифрован (AES-256-GCM) и сохранён");
      setKeyDrafts({});
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: (v: { email: string; role: AdminRole; revoke: boolean }) => setRole({ data: v }),
    onSuccess: () => {
      setMsg("Права обновлены");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const card = "rounded-xl border bg-background p-6";
  const input = "rounded-md border bg-background px-3 py-2 text-sm focus:border-[#DC2626] focus:outline-none";
  const btn =
    "rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#B91C1C] hover:shadow-md active:scale-[0.98] disabled:opacity-40";

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Системные настройки</h1>
      {msg && <div className="rounded-lg border bg-background px-4 py-3 text-sm">{msg}</div>}


      <div className="grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-4 font-semibold">Глобальные переменные</h2>
          <label className="mb-3 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={maintenance.enabled}
              onChange={(e) => setMaintenance((m) => ({ ...m, enabled: e.target.checked }))}
              className="h-4 w-4 cursor-pointer accent-[#DC2626]"
            />
            Режим технических работ
          </label>
          <textarea
            value={maintenance.message}
            onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))}
            rows={2}
            className={`${input} mb-3 w-full`}
            placeholder="Текст для посетителей"
          />
          <button className={btn} onClick={() => settingMutation.mutate({ key: "maintenance_mode", value: maintenance })}>
            Сохранить режим
          </button>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="text-sm">
              Наценка логистики, ₽
              <input
                value={logistics.fixed_rub}
                onChange={(e) => setLogistics((l) => ({ ...l, fixed_rub: Number(e.target.value) || 0 }))}
                inputMode="decimal"
                className={`${input} mt-1 w-full`}
              />
            </label>
            <label className="text-sm">
              Наценка логистики, %
              <input
                value={logistics.percent}
                onChange={(e) => setLogistics((l) => ({ ...l, percent: Number(e.target.value) || 0 }))}
                inputMode="decimal"
                className={`${input} mt-1 w-full`}
              />
            </label>
          </div>
          <button
            className={`${btn} mt-3`}
            onClick={() => settingMutation.mutate({ key: "logistics_markup", value: logistics })}
          >
            Сохранить наценку
          </button>
        </div>

        <div className={card}>
          <h2 className="mb-1 font-semibold">Хранилище API-ключей</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Значения шифруются AES-256-GCM перед записью и расшифровываются только в момент запроса
            к сервису.
          </p>
          <div className="space-y-3">
            {(data?.vault ?? []).map((k) => (
              <div key={k.name} className="grid grid-cols-[130px_1fr_auto] items-center gap-2 text-sm">
                <span>{k.label}</span>
                <input
                  value={keyDrafts[k.name] ?? ""}
                  onChange={(e) => setKeyDrafts((d) => ({ ...d, [k.name]: e.target.value }))}
                  placeholder={k.masked ?? "не задан"}
                  className={`${input} w-full`}
                />
                <button
                  disabled={!keyDrafts[k.name]}
                  onClick={() => keyMutation.mutate({ name: k.name, value: keyDrafts[k.name]! })}
                  className="rounded-md border px-3 py-2 text-xs transition-colors hover:bg-muted disabled:opacity-40"
                >
                  Сохранить
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-4 font-semibold">Персонал и права доступа</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Почта зарегистрированного сотрудника"
            className={`${input} min-w-[280px]`}
          />
          <select value={role} onChange={(e) => setRoleValue(e.target.value as AdminRole)} className={input}>
            {(["owner", "manager", "content"] as AdminRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button className={btn} disabled={!email} onClick={() => roleMutation.mutate({ email, role, revoke: false })}>
            Выдать роль
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {(staff?.rows ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 border-b pb-2">
              <span className="font-medium">{s.email ?? s.user_id}</span>
              <span className="rounded border px-2 py-0.5 text-xs">{ROLE_LABEL[s.role as AdminRole]}</span>
              <button
                onClick={() =>
                  s.email && roleMutation.mutate({ email: s.email, role: s.role as AdminRole, revoke: true })
                }
                className="ml-auto rounded-md border px-3 py-1 text-xs transition-colors hover:bg-red-50 hover:text-red-700"
              >
                Отозвать
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
