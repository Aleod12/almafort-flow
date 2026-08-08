/**
 * ИИ-конфигуратор инженерных узлов и смет ALMAFORT.
 *
 * Пайплайн: запрос инженера → лексический retrieval по базе техдокументации →
 * системный промпт с матрицей назначений и физических пределов + полная
 * номенклатура → LLM возвращает строгий JSON. Цены нейросети не доверяем:
 * Tiered Pricing пересчитывается на бэкенде из каталога.
 */
import { KNOWLEDGE_BASE, type KbChunk } from "@/data/knowledge-base";
import { PRODUCTS, isOnRequest, tierOf } from "@/data/catalog";
import { unitPriceOf, lineTotal } from "@/lib/pricing";

export type SolutionItem = {
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  /** 0 — базовая, 1 — Опт 1, 2 — Опт 2. */
  tier: 0 | 1 | 2;
  base_price: number;
  on_request: boolean;
  image_url: string | null;
  dims: string;
};

export type AssemblySolution = {
  recommended_items: SolutionItem[];
  engineering_logic: string;
  safety_margin_factor: number | null;
  is_service: boolean;
  total: number;
};

const STOP = new Set([
  "и","в","на","с","по","для","из","до","от","под","при","не","что","как","это","весом","кг","мм",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/i)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * Retrieval: ранжирование чанков по перекрытию терминов запроса.
 * Интерфейс совместим с векторным поиском — заменяется на pgvector без правок вызова.
 */
export function retrieve(query: string, limit = 4): KbChunk[] {
  const terms = tokenize(query);
  if (terms.length === 0) return KNOWLEDGE_BASE.slice(0, limit);

  return KNOWLEDGE_BASE.map((chunk) => {
    const haystack = `${chunk.title} ${chunk.text} ${chunk.skus.join(" ")}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += 2;
      else if (term.length > 4 && haystack.includes(term.slice(0, term.length - 2))) score += 1;
    }
    return { chunk, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.chunk);
}

/** Матрица назначений групп и физических пределов — «физика материалов» для модели. */
const DOMAIN_MATRIX = `
МАТРИЦА НАЗНАЧЕНИЙ И ДОПУСКОВ ALMAFORT:
- Трубные заглушки (ZGV, TG): глушение торцов профильных и круглых труб (заборы, металлоконструкции, ограждения цехов, каркасы мебели). Подбор строго по внешнему габариту трубы. Несущей нагрузки не несут.
- Декоративные заглушки (ZGD): маскировка крепежа — саморезы, евровинты, эксцентрики — в корпусной мебели.
- Опоры и подпятники (OP): защита напольного покрытия и регулировка мебели по высоте.
  · Нерегулируемый подпятник (OP-PM-20, OP-PM-25, OP-H15/H20/H35/H50) — статическая нагрузка до 150 кг на точку.
  · Регулируемая опора с резьбой (OP-M6-H28) — статическая нагрузка до 80 кг на точку.
- Мебельный крепеж (MK): сборка каркасов, фиксация стекол, ламелей, штанг.
- Комплектующие для ДПК (DPK-KL): скрытый монтаж террасной (палубной) доски.
- Спец-крепеж «КРЕПСС» (KREPSS-PRO): сквозной монтаж тяжелого оборудования (кондиционеры, трассы, вывески) на сэндвич-панели с гарантированным разрывом мостика холода. Максимальная разрушающая нагрузка на узел — 8.84 кН (~900 кг).
- Услуги (SRV-INJ — литьё, SRV-RE3D — реверс-инжиниринг и 3D-сканирование, SRV-FDM — 3D-печать FDM): предлагаются, если запрошена уникальная деталь либо размер, которых нет в номенклатуре, а также при ремонте/восстановлении сломанного узла. Цена — по договорённости.
`.trim();

const SYSTEM_PROMPT = `Ты — старший инженер-проектировщик завода ALMAFORT. Твоя задача — подобрать детали из нашей базы под техническое задание пользователя.

ПРАВИЛА:
1. Используй ТОЛЬКО артикулы из предоставленного каталога ALMAFORT. Не выдумывай несуществующие товары и метрики.
2. Если запрашивается нестандартная деталь, размер или тип изделия, которых нет в базе — рекомендуй услуги SRV-INJ (литьё), SRV-RE3D (сканирование) или SRV-FDM (печать) и ставь is_service = true. Никогда не «подтягивай» деталь близкого габарита или другого назначения вместо отсутствующей. В номенклатуре НЕТ кровельных опор, опор трубопроводов, кронштейнов, хомутов и подставок под инженерные коммуникации — такие задачи всегда маршрутизируются на услуги.
3. Расчёт прочности для строительства: KREPSS-PRO применяется ТОЛЬКО для сквозного монтажа оборудования на сэндвич-панель. Если основание не сэндвич-панель (кровля, гидроизоляция, бетон, кирпич) — KREPSS-PRO не предлагать, ставить is_service = true. Предел 900 кг на узел. Для промышленного оборудования по умолчанию 4 точки крепления. Рассчитай запас прочности.
4. Расчёт прочности для мебели: регулируемые опоры М6 держат до 80 кг на точку, нерегулируемые подпятники — до 150 кг. Если нагрузка выше предела — увеличь число точек опоры или маршрутизируй на услуги.
5. Финансовый расчёт — Tiered Pricing: до 1000 шт — «Базовая» цена; от 1000 до 4999 шт — «Опт 1»; от 5000 шт — «Опт 2». У декоративных заглушек ZGD пороги опта иные — они указаны в каталоге у позиции.
6. safety_margin_factor — числовой коэффициент запаса прочности (предел / фактическая нагрузка на точку), либо null, если расчёт нагрузки не применим.
7. engineering_logic — сжатый текст расчёта и обоснования на русском: количество точек, нагрузка на точку, предел, запас прочности.

ПРИМЕР МАРШРУТИЗАЦИИ НА УСЛУГИ:
Запрос: «Опереть трубопровод Ø108 мм на кровлю без пробивки гидроизоляции».
Верный ответ: recommended_items = [{"sku":"SRV-RE3D","quantity":1},{"sku":"SRV-INJ","quantity":1}], is_service = true, safety_margin_factor = null, engineering_logic = «В стандартной номенклатуре нет опор под Ø108 мм. Инженерный отдел ALMAFORT предлагает спроектировать и отлить специализированные кровельные опоры из атмосферостойкого полимера под вашу задачу».

Отвечай строго в заданной JSON-структуре, без markdown-разметки.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommended_items: {
      type: "array",
      description: "Позиции спецификации, только артикулы из каталога",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sku: { type: "string" },
          quantity: { type: "integer" },
        },
        required: ["sku", "quantity"],
      },
    },
    engineering_logic: { type: "string", description: "Текст расчёта и обоснования" },
    safety_margin_factor: {
      type: ["number", "null"],
      description: "Коэффициент запаса прочности или null",
    },
    is_service: { type: "boolean" },
  },
  required: ["recommended_items", "engineering_logic", "safety_margin_factor", "is_service"],
} as const;

/** Собирает ответ LLM из SSE-потока /v1/responses. */
async function streamResponsesText(body: unknown, apiKey: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error(`[configurator] gateway ${res.status}: ${detail}`);
    if (res.status === 429) throw new Error("Слишком много запросов к ИИ. Повторите через минуту.");
    if (res.status === 402) throw new Error("Исчерпан лимит ИИ-запросов. Пополните баланс.");
    throw new Error(`Сервис конфигуратора недоступен [${res.status}]`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && !text) {
          text = event.response?.output_text ?? "";
        }
      } catch {
        /* фрагмент SSE — пропускаем */
      }
    }
  }

  return text.trim();
}

/** Каталог для системного контекста: артикул, габарит, все тиры цен и остаток. */
function catalogContext() {
  return PRODUCTS.map((p) =>
    isOnRequest(p)
      ? `${p.sku} | ${p.name} | ${p.dims} | цена по договорённости`
      : `${p.sku} | ${p.name} | ${p.dims} | ${p.material} | База ${p.price} ₽ | Опт 1 (от ${p.tier1Qty} шт) ${p.price1000} ₽ | Опт 2 (от ${p.tier2Qty} шт) ${p.price5000} ₽ | остаток ${p.stock.qty} шт`,
  ).join("\n");
}

/** Пересчёт спецификации по каталогу: ИИ предлагает состав, цену считает бэкенд. */
export function priceItems(
  items: Array<{ sku: string; quantity: number }>,
): SolutionItem[] {
  const out: SolutionItem[] = [];
  const seen = new Set<string>();
  for (const { sku, quantity } of items) {
    const p = PRODUCTS.find((x) => x.sku === sku);
    if (!p || seen.has(p.sku)) continue;
    seen.add(p.sku);
    const qty = Math.max(1, Math.round(Number(quantity) || 1));
    const onRequest = isOnRequest(p);
    out.push({
      sku: p.sku,
      name: p.name,
      quantity: qty,
      unit_price: onRequest ? 0 : unitPriceOf(p, qty),
      total_price: onRequest ? 0 : lineTotal(p, qty),
      tier: onRequest ? 0 : tierOf(qty, p),
      base_price: p.price,
      on_request: onRequest,
      image_url: p.image_url,
      dims: p.dims,
    });
  }
  return out;
}

export async function solveConfiguration(query: string): Promise<{
  solution: AssemblySolution;
  sources: Array<{ id: string; title: string }>;
}> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Конфигуратор не сконфигурирован");

  const chunks = retrieve(query);
  const context = chunks.map((c) => `### ${c.title}\n${c.text}`).join("\n\n");

  const raw = await streamResponsesText(
    {
      model: "openai/gpt-5.6-sol",
      stream: true,
      instructions: `${SYSTEM_PROMPT}\n\n${DOMAIN_MATRIX}`,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `ДОКУМЕНТАЦИЯ ALMAFORT:\n${context}\n\n` +
                `КАТАЛОГ ALMAFORT (только эти артикулы допустимы):\n${catalogContext()}\n\n` +
                `ЗАПРОС КЛИЕНТА:\n${query}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "almafort_assembly",
          strict: true,
          schema: SCHEMA,
        },
      },
    },
    apiKey,
  );

  if (!raw) throw new Error("ИИ не вернул решение. Уточните формулировку задачи.");

  const match = raw.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? raw) as {
    recommended_items?: Array<{ sku?: string; quantity?: number }>;
    engineering_logic?: string;
    safety_margin_factor?: number | null;
    is_service?: boolean;
  };

  const wantsSandwich = /сэндвич|сендвич|sandwich|панел/i.test(query);
  const proposed = (parsed.recommended_items ?? []).filter((i) =>
    // Жёсткий предохранитель от галлюцинаций: КРЕПСС — только для сэндвич-панелей.
    String(i.sku ?? "") === "KREPSS-PRO" ? wantsSandwich : true,
  );
  const routedToService = proposed.length === 0;

  const items = priceItems(
    (routedToService ? [{ sku: "SRV-RE3D", quantity: 1 }, { sku: "SRV-INJ", quantity: 1 }] : proposed).map((i) => ({
      sku: String(i.sku ?? ""),
      quantity: Number(i.quantity ?? 1),
    })),
  );

  if (items.length === 0) {
    throw new Error("Не удалось подобрать позиции из каталога под эту задачу.");
  }

  const margin = Number(parsed.safety_margin_factor);

  return {
    solution: {
      recommended_items: items,
      engineering_logic: routedToService
        ? "В стандартной номенклатуре ALMAFORT нет готового решения под эту задачу. Инженерный отдел предлагает спроектировать и изготовить деталь под ваши условия: реверс-инжиниринг узла (SRV-RE3D) и последующее литьё из атмосферостойкого полимера (SRV-INJ). Стоимость — по договорённости после согласования ТЗ."
        : String(parsed.engineering_logic ?? ""),
      safety_margin_factor: Number.isFinite(margin) && margin > 0 ? Math.round(margin * 100) / 100 : null,
      is_service: routedToService || Boolean(parsed.is_service) || items.every((i) => i.on_request),
      total: Math.round(items.reduce((s, i) => s + i.total_price, 0) * 100) / 100,
    },
    sources: chunks.map((c) => ({ id: c.id, title: c.title })),
  };
}
