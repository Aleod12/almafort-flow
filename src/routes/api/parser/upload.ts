import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "application/octet-stream", // некоторые браузеры не проставляют MIME
];

export const Route = createFileRoute("/api/parser/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json({ error: "Файл не получен" }, { status: 400 });
          }
          if (file.size > MAX_BYTES) {
            return Response.json({ error: "Файл больше 10 МБ" }, { status: 413 });
          }
          const ext = file.name.toLowerCase().split(".").pop() ?? "";
          if (!ALLOWED.includes(file.type) && !["xls", "xlsx", "csv"].includes(ext)) {
            return Response.json(
              { error: "Формат не поддерживается. Загрузите таблицу Excel или CSV" },
              { status: 415 },
            );
          }

          const { parseSpecBuffer } = await import("@/lib/spec-parser.server");
          const result = parseSpecBuffer(await file.arrayBuffer());
          return Response.json({ fileName: file.name, ...result });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Не удалось разобрать файл" },
            { status: 500 },
          );
        }
      },
    },
  },
});
