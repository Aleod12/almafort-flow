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

/** Жёсткий семантический справочник: назначение, сленг клиента и физические лимиты по всем 38 позициям. */
const DOMAIN_MATRIX = `
БАЗА ЗНАНИЙ ALMAFORT (СЕМАНТИКА ВСЕХ 38 ПОЗИЦИЙ):

Группа 1. Трубные заглушки квадрат/прямоугольник — ZGV-15x15, ZGV-20x20, ZGV-20x40, ZGV-25x25, ZGV-40x40, ZGV-40x60, ZGV-60x60, ZGV-80x80, ZGV-100x100.
Назначение: закрытие торцов профильных труб (заборы, каркасы, стеллажи, перила), защита от влаги и травмобезопасность.
Сленг клиента: чопик, пробка, крышка квадратная, накладка на профиль, затычка, заглушка в трубу.
Подбор строго по внешнему габариту трубы: труба 40х60 = ZGV-40x60. Максимум 100х100 — больше нет, такие задачи уходят в услуги SRV.
Нагрузку не несут: safety_margin_factor = null. Норма расхода: 1 шт на 1 торец.

Группа 2. Трубные заглушки круглые — ZGV-D20 (Ø20), ZGV-D22 (Ø22), ZGV-D25 (Ø25).
Назначение: торцы круглых труб — мебель на металлокаркасе, ограждения.
Сленг: круглый чопик, колпачок в трубу, пробка круглая. Нагрузку не несут.

Группа 3. Декоративные заглушки — ZGD-EV (Ø13, строго под евровинт/конфирмат), ZGD-SM (Ø11, под саморез), ZGD-EX (Ø15, под стяжку-эксцентрик).
Назначение: эстетика корпусной мебели, маскировка головок крепежа.
Сленг: шляпки, пипки, декоративки, наклейки на болты, колпачки на конфирмат.
Нагрузку не несут. Норма расхода: 1 шт на 1 точку крепления. Пороги опта у серии ZGD выше — смотри каталог.

Группа 4. Опоры и подпятники — OP-PM-20, OP-PM-25 (под металлокаркас), OP-P-STD (стандарт), OP-H15, OP-H20, OP-H35, OP-H50, OP-SH-H50 (шаровая), OP-M6-H28 (регулируемая М6).
Назначение: регулировка мебели по высоте, защита пола от царапин (парты, стулья, шкафы, стеллажи).
Сленг: ножка, каблук, копыто, пятка, башмак, подпятник.
ФИЗИЧЕСКИЕ ЛИМИТЫ: регулируемая опора OP-M6-H28 — 80 кг на точку. Нерегулируемые подпятники и опоры (все прочие OP) — 150 кг на точку.
Стандартная схема: 4 опоры на изделие. Нагрузка на точку = масса изделия / число точек. Если превышен лимит — стандартные опоры НЕ предлагать, уходить в SRV-INJ.

Группа 5. Мебельный крепёж — MK-SD (стеклодержатель под стекло 4–6 мм), MK-LH (ласточкин хвост), MK-SHD (штангодержатель Ø25), MK-UG (уголок мебельный), MK-LD (латодержатель 63 мм).
Назначение: сборка каркасов, держатели полок, кроватных ламелей и гардеробных труб.
Сленг: держатель стекла, стекляшки, уголок меб, карман для ламели, крепёж для вешалки, полкодержатель под стекло.
Паспортного лимита нагрузки нет: safety_margin_factor = null.

Группа 6. Комплектующие ДПК — DPK-KL (универсальный кляймер).
Назначение: скрытый монтаж террасной (палубной) доски ДПК, веранды. Сленг: краб, клипса для террасы, кляймер.

Группа 7. Тетрагедроны — TG-080 (80 мм), TG-100 (100 мм), TG-150 (150 мм).
Назначение: технологические спейсеры производственных линий сэндвич-панелей, задают толщину панели. Подбор по толщине панели.

Группа 8. Профессиональный крепёж КРЕПСС — KREPSS-PRO.
Назначение: сквозной монтаж тяжёлого навесного оборудования (кондиционеры, вывески, трассы) на сэндвич-панели с гарантированным разрывом мостика холода.
Сленг: крепс, крепёж для кондея, терморазрыв, втулка для сэндвича.
ФИЗИЧЕСКИЙ ЛИМИТ: предел на вырыв 900 кг на узел. Минимум 4 точки на навесное оборудование.
Если основание НЕ сэндвич-панель (кровля, бетон, кирпич, гидроизоляция, металлокаркас) — КРЕПСС не предлагать.

Группа 9. Тара и упаковка — KAN-CAP-R.
Назначение: усиленные герметичные крышки для экспедиционных и резервных канистр (ГСМ). Сленг: крышка для канистры, пробка бензобака.

Группа 10. Услуги — SRV-INJ (литьё пресс-формой), SRV-RE3D (реверс-инжиниринг и 3D-сканирование), SRV-FDM (промышленная 3D-печать FDM).
Назначение: нестандартные размеры, ремонт сломанного, копирование импортных узлов, серийное литьё по чертежам клиента.
В номенклатуре НЕТ кровельных опор, опор трубопроводов, кронштейнов, хомутов, виброопор и подставок под коммуникации — такие задачи всегда уходят в услуги.
`.trim();


const SYSTEM_PROMPT = `Ты — строгий инженер-сметчик платформы ALMAFORT. Твоя единственная задача: сопоставить текстовый запрос клиента с жёсткой базой знаний и выдать точный артикул (SKU) и смету.

КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ:
1. Выдумывать артикулы, которых нет в предоставленном каталоге и справочнике.
2. Гадать о запасе прочности, если для детали не указан лимит нагрузки. Если лимита нет — safety_margin_factor = null.
3. Подставлять деталь близкого габарита или другого назначения вместо отсутствующей. Нет точного соответствия — is_service = true и артикулы SRV.

ПРАВИЛА РАСЧЁТА НАГРУЗОК:
- Нагрузка на точку = общая масса / количество точек опоры (для мебели: изделий × опор на изделие).
- Паспортные пределы: регулируемая опора OP-M6-H28 — 80 кг/точка; нерегулируемые подпятники и опоры OP — 150 кг/точка; KREPSS-PRO — 900 кг/узел. Для навесного оборудования минимум 4 точки.
- Если расчётная нагрузка на точку превышает предел — стандартную деталь НЕ предлагать: is_service = true, артикулы SRV, и явно предупредить клиента в engineering_logic.
- safety_margin_factor = предел на точку / фактическая нагрузка на точку (число), либо null, если у детали нет паспортного лимита.
- engineering_logic — сжатый расчёт на русском: количество точек, нагрузка на точку, паспортный предел, вывод и указание применённой оптовой скидки.

ПРАВИЛА ЦЕНООБРАЗОВАНИЯ (TIERED PRICING):
Количество < порога «Опт 1» — базовая цена; от «Опт 1» до «Опт 2» — цена «Опт 1»; от порога «Опт 2» — цена «Опт 2». Пороги у каждой позиции указаны в каталоге (у серии ZGD они выше). Услуги SRV — всегда «по договорённости», в смете 0.
Составные заказы считай построчно: каждый артикул получает свой тир по своему количеству.


ПРИМЕР МАРШРУТИЗАЦИИ НА УСЛУГИ:
Запрос: «Опереть трубопровод Ø108 мм на кровлю без пробивки гидроизоляции».
Верный ответ: recommended_items = [{"sku":"SRV-RE3D","quantity":1},{"sku":"SRV-INJ","quantity":1}], is_service = true, safety_margin_factor = null, engineering_logic = «В стандартной номенклатуре нет опор под Ø108 мм. Инженерный отдел ALMAFORT предлагает спроектировать и отлить специализированные кровельные опоры из атмосферостойкого полимера».

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

/** Собирает ответ LLM из SSE-потока /v1/responses вместе с расходом токенов. */
async function streamResponsesText(
  body: unknown,
  apiKey: string,
): Promise<{ text: string; usage: LlmUsage }> {
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
