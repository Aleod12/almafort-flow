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
          const { PRODUCTS } = await import("@/data/catalog");
          const byId = (sku: string) => PRODUCTS.find((p) => p.sku === sku) ?? null;
          const main = byId(result.solution.recommended_sku);
          return Response.json({
            ...result,
            product: main && {
              sku: main.sku,
              name: main.name,
              dims: main.dims,
              material: main.material,
              load: main.load,
              price: main.price,
              stock: main.stock.qty,
            },
            accessories: result.solution.accessories.flatMap((sku) => {
              const p = byId(sku);
              return p ? [{ sku: p.sku, name: p.name, price: p.price }] : [];
            }),
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка конфигуратора";
          console.error("[configurator]", message);
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
