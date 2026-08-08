import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({ query: z.string().trim().min(10).max(2000) });

export const Route = createFileRoute("/api/configurator/solve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let query: string;
        try {
          query = schema.parse(await request.json()).query;
        } catch {
          return Response.json(
            { error: "Опишите задачу подробнее: объект, масса, основание." },
            { status: 400 },
          );
        }
        try {
          const { solveConfiguration } = await import("@/lib/rag.server");
          const result = await solveConfiguration(query);
          return Response.json(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка конфигуратора";
          console.error("[configurator]", message);
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
