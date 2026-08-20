import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit.server";

// Ограничение длины — защита от «token exhaustion»: длинный мусор
// не должен оплачиваться токенами LLM.
const schema = z.object({ query: z.string().trim().min(10).max(1000) });

export const Route = createFileRoute("/api/configurator/solve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Дорогой LLM-эндпоинт: не чаще 10 расчётов в минуту с одного IP.
        const limited = rateLimit(request, "configurator", {
          limit: 10,
          windowMs: 60_000,
          blockMs: 120_000,
        });
        if (limited) return limited;

        let query: string;
        try {
          query = schema.parse(await request.json()).query;
        } catch {
          return Response.json(
            {
              error:
                "Опишите задачу подробнее (10–1000 символов): объект, масса, основание.",
            },
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
          // Клиенту — вежливая деградация с переходом на живого инженера.
          return Response.json({ error: message, fallback: true }, { status: 503 });
        }
      },
    },
  },
});
