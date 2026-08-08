// Vision-конвейер: изображение → ИИ-классификатор → подбор SKU по каталогу ALMAFORT.
import { PRODUCTS, type Product } from "@/data/catalog";

export type VisionVerdict = {
  type: string;
  shape: string;
  color: string;
  has_threads: boolean;
  confidence: number;
};

const SYSTEM_PROMPT =
  "Ты — эксперт-технолог завода пластиковой фурнитуры. Проанализируй изображение детали. " +
  "Твоя задача — извлечь физические свойства, а не угадывать артикул. " +
  "Верни ответ СТРОГО в формате JSON без markdown-разметки. Структура: " +
  '{"type": "заглушка/опора/крепеж/колпачок/хомут", "shape": "квадрат/круг/прямоугольник", ' +
  '"color": "черный/серый/белый", "has_threads": boolean, "confidence": float}.';


export async function identifyPart(imageDataUrl: string): Promise<VisionVerdict> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY не сконфигурирован");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Определи деталь на фото." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Vision gateway failed [${res.status}]: ${body}`);
    throw new Error(`Сервис распознавания недоступен [${res.status}]`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? cleaned) as Partial<VisionVerdict>;

  return {
    type: String(parsed.type ?? "деталь").toLowerCase(),
    shape: String(parsed.shape ?? "").toLowerCase(),
    color: String(parsed.color ?? "").toLowerCase(),
    has_threads: Boolean(parsed.has_threads),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
  };

}

const TYPE_KEYS: Array<[RegExp, string]> = [
  [/заглуш/i, "Заглушки трубные"],
  [/опор|крепсс/i, "Опоры КРЕПСС"],
  [/крепеж|крепёж|саморез|винт|сэндвич/i, "Крепёж сэндвич-панелей"],
  [/колпач/i, "Колпачки защитные"],
  [/хомут|стяжк/i, "Хомуты и стяжки"],
];

/** Ранжирование каталога по вердикту ИИ: тип задаёт категорию, форма — уточнение. */
export function matchProducts(v: VisionVerdict, limit = 3): Product[] {
  const category = TYPE_KEYS.find(([re]) => re.test(v.type))?.[1];
  const square = /квадрат|square/.test(v.shape);
  const round = /кругл|round|circle/.test(v.shape);
  const rect = /прямоуг|rect/.test(v.shape);

  return PRODUCTS.map((p) => {
    let score = 0;
    if (category && p.category === category) score += 10;
    if (square && /квадратн/i.test(p.name)) score += 5;
    if (round && /кругл|Ø/i.test(`${p.name} ${p.dims}`)) score += 5;
    if (rect && /прямоугольн/i.test(p.name)) score += 5;
    // Резьба на детали сужает выбор до резьбовых групп каталога.
    if (v.has_threads && /Колпачки защитные|Крепёж сэндвич-панелей/.test(p.category)) score += 4;
    if (!v.has_threads && /Колпачки защитные/.test(p.category)) score -= 2;
    if (p.stock.qty > 0) score += 1;
    return { p, score };
  })

    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.p.stock.qty - a.p.stock.qty)
    .slice(0, limit)
    .map((r) => r.p);
}
