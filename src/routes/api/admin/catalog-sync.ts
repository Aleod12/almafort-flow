import { createFileRoute } from "@tanstack/react-router";
import type { FeedRow } from "@/lib/catalog-sync.server";

/**
 * Защищённый эндпоинт импорта фида из учётной системы (1С / МойСклад).
 * Авторизация: заголовок `x-admin-token` = секрет CATALOG_SYNC_TOKEN.
 * Принимает JSON `{ rows: [...] }` либо тело text/csv.
 */
export const Route = createFileRoute("/api/admin/catalog-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["CATALOG_SYNC_TOKEN"];
        if (!token) {
          return Response.json(
            { error: "Импорт не настроен: задайте секрет CATALOG_SYNC_TOKEN" },
            { status: 503 },
          );
        }
        const provided = request.headers.get("x-admin-token") ?? "";
        if (provided.length !== token.length || provided !== token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { applyFeed, parseCsvFeed } = await import("@/lib/catalog-sync.server");
        const ctype = request.headers.get("content-type") ?? "";
        let rows: FeedRow[] = [];
        try {
          if (ctype.includes("json")) {
            const body = (await request.json()) as { rows?: FeedRow[]; hideMissing?: boolean } | FeedRow[];
            rows = Array.isArray(body) ? body : (body.rows ?? []);
            const hideMissing = !Array.isArray(body) && body.hideMissing === true;
            return Response.json(applyFeed(rows, { hideMissing }));
          }
          rows = parseCsvFeed(await request.text());
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Не удалось разобрать фид" },
            { status: 400 },
          );
        }
        if (rows.length === 0) {
          return Response.json({ error: "Фид пуст или формат не распознан" }, { status: 400 });
        }
        return Response.json(applyFeed(rows, { hideMissing: true }));
      },
    },
  },
});
