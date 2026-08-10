import { createFileRoute, Link, Outlet, notFound, useRouterState } from "@tanstack/react-router";
import { adminMe } from "@/lib/admin.functions";
import { ADMIN_BASE, ROLE_LABEL, can, type AdminRole } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026")({
  ssr: false,
  beforeLoad: async () => {
    // RBAC-гейт: у не-сотрудника раздела просто «не существует» — отдаём 404,
    // чтобы сканеры не получали подтверждение, что админка тут есть.
    try {
      const me = await adminMe();
      if (!me.roles.length) throw notFound();
      return { adminRoles: me.roles as AdminRole[], adminEmail: me.email };
    } catch {
      throw notFound();
    }
  },
  notFoundComponent: () => (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Страница не найдена</p>
    </div>
  ),
  component: AdminLayout,
});

const TABS = [
  { key: "orders", to: ADMIN_BASE, label: "Заказы", exact: true },
  { key: "companies", to: `${ADMIN_BASE}/companies`, label: "Контрагенты" },
  { key: "leads", to: `${ADMIN_BASE}/leads`, label: "Оптовые заявки" },
  { key: "products", to: `${ADMIN_BASE}/products`, label: "Каталог" },
  { key: "ai", to: `${ADMIN_BASE}/ai`, label: "ИИ" },
  { key: "settings", to: `${ADMIN_BASE}/settings`, label: "Настройки" },
  { key: "logs", to: `${ADMIN_BASE}/logs`, label: "Журнал" },
];

function AdminLayout() {
  const ctx = Route.useRouteContext() as { adminRoles: AdminRole[]; adminEmail: string | null };
  const adminRoles = ctx.adminRoles;
  const adminEmail = ctx.adminEmail;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-bold tracking-tight">ALMAFORT · Панель управления</span>
            <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
              {adminRoles.map((r) => ROLE_LABEL[r]).join(", ")}
            </span>
          </div>
          <nav className="flex flex-wrap gap-1">
            {TABS.filter((t) => can(adminRoles, t.key)).map((t) => {
              const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
              return (
                <Link
                  key={t.key}
                  to={t.to}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active ? "bg-foreground text-background" : "hover:bg-muted"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <span className="ml-auto text-xs text-muted-foreground">{adminEmail}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
