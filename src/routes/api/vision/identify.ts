import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  // data:image/webp;base64,... — кадр из камеры, ужатый до 1024px
  image: z
    .string()
    .min(64)
    .max(4_000_000)
    .refine((v) => v.startsWith("data:image/"), "Ожидается data:image/*"),
});

export const Route = createFileRoute("/api/vision/identify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let image: string;
        try {
          image = schema.parse(await request.json()).image;
        } catch {
          return Response.json({ error: "Некорректный кадр" }, { status: 400 });
        }
        try {
          const { identifyPart, matchProducts } = await import("@/lib/vision.server");
          const verdict = await identifyPart(image);
          const matches = matchProducts(verdict, 3).map((p) => ({
            sku: p.sku,
            name: p.name,
            dims: p.dims,
            price: p.price,
            stock: p.stock.qty,
            lead: p.stock.lead ?? null,
          }));
          return Response.json({ verdict, matches });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка распознавания";
          console.error("[vision]", message);
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
