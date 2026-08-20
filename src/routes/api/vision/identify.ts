import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  // data:image/webp;base64,... — кадр из камеры, обрезанный по рамке и ужатый до 1024px
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
        let raw: string;
        try {
          raw = schema.parse(await request.json()).image;
        } catch {
          return Response.json({ error: "Некорректный кадр" }, { status: 400 });
        }
        try {
          // Защита от спуфинга: расширению и MIME не верим — проверяем сигнатуру
          // и пересобираем картинку без EXIF/XMP/ICC, только потом отдаём модели.
          const { sanitizeImageDataUrl } = await import("@/lib/image-sanitize.server");
          const clean = sanitizeImageDataUrl(raw);
          if (!clean) {
            return Response.json(
              { error: "Файл не является корректным изображением JPG, PNG или WebP" },
              { status: 400 },
            );
          }
          const image = clean.dataUrl;

          const { identifyPart, matchProducts, classVariants, logVisionFail, verdictCategory } =
            await import("@/lib/vision.server");
          const verdict = await identifyPart(image);

          const brief = (p: {
            sku: string;
            name: string;
            dims: string;
            price: number;
            stock: { qty: number; lead?: string };
          }) => ({
            sku: p.sku,
            name: p.name,
            dims: p.dims,
            price: p.price,
            stock: p.stock.qty,
            lead: p.stock.lead ?? null,
          });

          // Маршрутизация по Confidence Score (Блок 3 ТЗ).
          const score = verdict.confidence;
          const category = verdictCategory(verdict);

          if (verdict.status === "INVALID" || score < 0.1) {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "invalid", verdict });
          }

          if (verdict.status === "FOREIGN" || score < 0.5 || !category) {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "foreign", verdict });
          }

          if (score >= 0.85) {
            return Response.json({
              scenario: "exact",
              verdict,
              category,
              variants: classVariants(verdict).map(brief),
            });
          }

          return Response.json({
            scenario: "ambiguous",
            verdict,
            matches: matchProducts(verdict, 3).map(brief),
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка распознавания";
          console.error("[vision]", message);
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
