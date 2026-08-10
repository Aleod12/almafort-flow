// Vision-конвейер: кадр → изоляция объекта → ИИ-классификатор → подбор SKU ALMAFORT.
// Стадии: 1) кроп по рамке и отсев рук/органики, 2) классификация мультимодальной LLM,
// 3) маршрутизация по Confidence Score (см. src/routes/api/vision/identify.ts).
import { PRODUCTS, type Product } from "@/data/catalog";
import { activePrompt, logLlmCall } from "@/lib/llm-log.server";
import { uploadObject } from "@/lib/s3.server";

export type VisionStatus = "VALID" | "FOREIGN" | "INVALID";

export type VisionVerdict = {
  /** VALID — техническая деталь класса ALMAFORT, FOREIGN — деталь не из матрицы,
   *  INVALID — рука, лицо, животное, темнота или посторонний предмет. */
  status: VisionStatus;
  type: string;
  shape: string;
  color: string;
  has_threads: boolean;
  /** 0..1 */
  confidence: number;
  /** Что именно увидела модель — для сценария «мусор в кадре». */
  observed: string;
  /** Обнаружены ли пальцы/ладонь: влияет на изоляцию объекта. */
  hands_present: boolean;
};

const MODEL = "google/gemini-3.6-flash";

const SYSTEM_PROMPT =
  "Ты — инженер ALMAFORT и промышленный сканер каталога. На фото — кадр, обрезанный по рамке " +
  "видоискателя. Твоя задача — классифицировать объект, а не угадывать артикул и размер до миллиметра.\n" +
  "Стадия изоляции: если объект лежит на ладони или его держат пальцами — мысленно вырежи руки и " +
  "фон, анализируй только геометрию неорганического предмета. Если в кадре ТОЛЬКО рука, лицо, " +
  "животное, еда, клавиатура, кадр чёрный/пустой/смазанный — верни status INVALID.\n" +
  "Если это техническая пластиковая или металлическая деталь, но её формы нет среди классов " +
  "ALMAFORT (заглушки внутренние, заглушки декоративные, опоры и подпятники, мебельный крепёж, " +
  "комплектующие для ДПК, комплектующие для канистр, детали для сэндвич-панелей) — верни status FOREIGN.\n" +
  "Иначе верни status VALID и класс детали.\n" +
  "confidence — целое 0..100: насколько уверенно объект соответствует классу ALMAFORT.\n" +
  "Ответ СТРОГО JSON без markdown: " +
  '{"status":"VALID|FOREIGN|INVALID","type":"заглушка/опора/крепеж/колпачок/хомут","shape":' +
  '"квадрат/круг/прямоугольник","color":"черный/серый/белый","has_threads":true|false,' +
  '"confidence":0-100,"observed":"что видно на фото","hands_present":true|false}';

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: m[1]! };
}

/**
 * Shadow Logging: кадры со Score < 50% анонимно уезжают в S3 /vision_fails/,
 * чтобы раз в месяц вручную связать неудачный ракурс с артикулом.
 */
export async function logVisionFail(imageDataUrl: string, verdict: VisionVerdict) {
  try {
    const parsed = dataUrlToBytes(imageDataUrl);
    if (!parsed) return;
    const ext = parsed.mime.split("/")[1] ?? "webp";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = crypto.randomUUID().slice(0, 8);
    const key = `vision_fails/${stamp}_${verdict.status}_${Math.round(
      verdict.confidence * 100,
    )}_${rand}.${ext}`;
    await uploadObject(key, parsed.bytes, parsed.mime);
  } catch (e) {
    console.error("[vision] shadow log failed", e);
  }
}

export async function identifyPart(imageDataUrl: string): Promise<VisionVerdict> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY не сконфигурирован");

  const system = (await activePrompt("vision")) ?? SYSTEM_PROMPT;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Классифицируй объект на фото." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Vision gateway failed [${res.status}]: ${body}`);
    void logLlmCall({
      kind: "vision",
      prompt: system,
      response: body,
      parseStatus: "api_error",
      model: MODEL,
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    });
    if (res.status === 429) throw new Error("Слишком много запросов — попробуйте через минуту");
    if (res.status === 402) throw new Error("Лимит ИИ-распознавания исчерпан");
    throw new Error(`Сервис распознавания недоступен [${res.status}]`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);

  let parsed: Partial<VisionVerdict> = {};
  let parseStatus: "ok" | "json_error" = "ok";
  try {
    parsed = JSON.parse(match?.[0] ?? cleaned) as Partial<VisionVerdict>;
  } catch {
    parseStatus = "json_error";
  }

  void logLlmCall({
    kind: "vision",
    prompt: system,
    response: raw,
    parseStatus,
    model: MODEL,
    usage: {
      prompt_tokens: json.usage?.prompt_tokens ?? 0,
      completion_tokens: json.usage?.completion_tokens ?? 0,
    },
  });

  const rawStatus = String(parsed.status ?? "").toUpperCase();
  const status: VisionStatus =
    rawStatus === "FOREIGN" ? "FOREIGN" : rawStatus === "INVALID" ? "INVALID" : "VALID";

  // Модель отдаёт 0..100, но иногда 0..1 — нормализуем в долю.
  const rawConf = Number(parsed.confidence);
  const conf = Number.isFinite(rawConf) ? (rawConf > 1 ? rawConf / 100 : rawConf) : 0.5;

  return {
    status: parseStatus === "json_error" ? "INVALID" : status,
    type: String(parsed.type ?? "деталь").toLowerCase(),
    shape: String(parsed.shape ?? "").toLowerCase(),
    color: String(parsed.color ?? "").toLowerCase(),
    has_threads: Boolean(parsed.has_threads),
    confidence: status === "INVALID" ? Math.min(0.09, conf) : Math.min(1, Math.max(0, conf)),
    observed: String(parsed.observed ?? "").slice(0, 160),
    hands_present: Boolean(parsed.hands_present),
  };
}

const TYPE_KEYS: Array<[RegExp, string]> = [
  [/декоратив|евровинт|эксцентрик|самореза/i, "Заглушки декоративные"],
  [/заглуш/i, "Заглушки внутренние"],
  [/опор|подпятник|ножк/i, "Опоры и подпятники"],
  [/тетрагедрон|сэндвич|крепсс/i, "Для производства сэндвич-панелей"],
  [/кляймер|дпк|террас/i, "Комплектующие для ДПК"],
  [/крышк|канистр|тара/i, "Комплектующие для канистр"],
  [/уголок|держател|хвост|крепеж|крепёж/i, "Мебельный крепеж"],
];

/** Класс детали (категория каталога) по вердикту ИИ — для сценария 3.1. */
export function verdictCategory(v: VisionVerdict): string | null {
  return TYPE_KEYS.find(([re]) => re.test(v.type))?.[1] ?? null;
}

/** Ранжирование каталога по вердикту ИИ: тип задаёт категорию, форма — уточнение. */
export function matchProducts(v: VisionVerdict, limit = 3): Product[] {
  const category = verdictCategory(v);
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
    if (v.has_threads && /Мебельный крепеж|сэндвич-панелей/.test(p.category)) score += 4;
    if (!v.has_threads && /Заглушки/.test(p.category)) score -= 2;
    if (p.stock.qty > 0) score += 1;
    return { p, score };
  })

    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.p.stock.qty - a.p.stock.qty)
    .slice(0, limit)
    .map((r) => r.p);
}

/** Сценарий 3.1: весь размерный ряд распознанного класса — «Выберите размер». */
export function classVariants(v: VisionVerdict, limit = 24): Product[] {
  const category = verdictCategory(v);
  if (!category) return [];
  const square = /квадрат|square/.test(v.shape);
  const round = /кругл|round|circle/.test(v.shape);
  return PRODUCTS.filter((p) => p.category === category && !p.is_service)
    .filter((p) => {
      if (square) return /квадратн/i.test(p.name) || !/кругл/i.test(p.name);
      if (round) return /кругл|Ø/i.test(`${p.name} ${p.dims}`) || !/квадратн/i.test(p.name);
      return true;
    })
    .sort((a, b) => b.stock.qty - a.stock.qty)
    .slice(0, limit);
}
