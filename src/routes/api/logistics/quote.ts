import { createFileRoute } from "@tanstack/react-router";

/**
 * Расчёт доставки строго по двум ТК: СДЭК и Деловые Линии.
 * Отправная точка — производство в Дивногорске (Красноярский край).
 */
type Zone = { k: number; days: number; match: RegExp };

const ZONES: Zone[] = [
  { k: 0.35, days: 1, match: /дивногорск|красноярск|железногорск|сосновоборск|ачинск|канск/i },
  { k: 0.7, days: 3, match: /новосибирск|кемеро|томск|барнаул|омск|абакан|иркут|улан|чита|тюмен/i },
  { k: 1, days: 5, match: /москв|петербург|казан|екатеринбург|нижн|самар|уф[аы]|перм|воронеж|ростов|краснодар|волгоград/i },
  { k: 1.45, days: 8, match: /владивосток|хабаровск|якут|магадан|камчат|сахалин|мурманск|калининград|сочи/i },
];

const zoneFor = (city: string) =>
  ZONES.find((z) => z.match.test(city)) ?? { k: 1.15, days: 6, match: /./ };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/logistics/quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { city?: unknown; weight?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "Некорректный запрос" }, 400);
        }

        const city = typeof body.city === "string" ? body.city.trim().slice(0, 80) : "";
        const weight = Math.max(0, Math.min(Number(body.weight) || 0, 20000));

        if (city.length < 2) return json({ error: "Укажите город доставки" }, 400);
        if (weight <= 0) return json({ error: "Корзина пуста" }, 400);

        const z = zoneFor(city);
        const volumetric = Math.max(weight, weight * 1.1);

        const cdek = Math.round((420 + volumetric * 26) * z.k);
        const dl = Math.round((780 + volumetric * 15) * z.k);

        return json({
          city,
          weight: Number(weight.toFixed(1)),
          quotes: [
            { carrier: "cdek", label: "СДЭК", price: cdek, days: z.days },
            { carrier: "dl", label: "Деловые Линии", price: dl, days: z.days + 1 },
          ],
        });
      },
    },
  },
});
