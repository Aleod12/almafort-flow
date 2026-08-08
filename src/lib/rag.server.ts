/**
 * RAG-конфигуратор ALMAFORT.
 *
 * Пайплайн: запрос инженера → семантический (здесь — лексический) поиск по базе
 * технической документации → сборка промпта «контекст + запрос» → LLM возвращает
 * строгий JSON со спецификацией узла. Нейросеть ничего не выдумывает: она может
 * выбрать только те артикулы, которые переданы ей в контексте.
 */
import { KNOWLEDGE_BASE, type KbChunk } from "@/data/knowledge-base";
import { PRODUCTS } from "@/data/catalog";

export type Solution = {
  recommended_sku: string;
  reasoning: string;
  load_calculation: string;
  required_qty: number;
  accessories: string[];
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

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommended_sku: { type: "string", description: "Артикул из списка доступных" },
    reasoning: { type: "string", description: "Почему выбран этот узел, 2-4 предложения" },
    load_calculation: { type: "string", description: "Расчёт нагрузки и запаса прочности" },
    required_qty: { type: "integer", description: "Количество основного артикула" },
    accessories: {
      type: "array",
      items: { type: "string" },
      description: "Артикулы сопутствующих позиций из списка доступных",
    },
  },
  required: ["recommended_sku", "reasoning", "load_calculation", "required_qty", "accessories"],
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

export async function solveConfiguration(query: string): Promise<{
  solution: Solution;
  sources: Array<{ id: string; title: string }>;
}> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Конфигуратор не сконфигурирован");

  const chunks = retrieve(query);
  const context = chunks.map((c) => `### ${c.title}\n${c.text}`).join("\n\n");
  const catalog = PRODUCTS.map(
    (p) => `${p.sku} — ${p.name} (${p.dims}, ${p.material}, ${p.load})`,
  ).join("\n");

  const raw = await streamResponsesText(
    {
      model: "openai/gpt-5.6-sol",
      stream: true,
      instructions:
        "Ты — ведущий инженер технического отдела завода ALMAFORT. Подбираешь монтажный узел " +
        "строго по предоставленной документации и номенклатуре. Запрещено предлагать артикулы, " +
        "которых нет в списке номенклатуры. Считай количество точек крепления по методике из " +
        "контекста и всегда указывай фактический запас прочности. Отвечай по-русски.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `ДОКУМЕНТАЦИЯ ALMAFORT:\n${context}\n\n` +
                `НОМЕНКЛАТУРА (только эти артикулы допустимы):\n${catalog}\n\n` +
                `ЗАПРОС ИНЖЕНЕРА:\n${query}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "almafort_solution",
          strict: true,
          schema: SCHEMA,
        },
      },
    },
    apiKey,
  );

  if (!raw) throw new Error("ИИ не вернул решение. Уточните формулировку задачи.");

  const match = raw.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? raw) as Partial<Solution>;

  const known = new Set(PRODUCTS.map((p) => p.sku));
  const sku = String(parsed.recommended_sku ?? "");
  if (!known.has(sku)) throw new Error("Не удалось подобрать узел из каталога под эту задачу.");

  return {
    solution: {
      recommended_sku: sku,
      reasoning: String(parsed.reasoning ?? ""),
      load_calculation: String(parsed.load_calculation ?? ""),
      required_qty: Math.max(1, Math.round(Number(parsed.required_qty) || 1)),
      accessories: (Array.isArray(parsed.accessories) ? parsed.accessories : [])
        .map(String)
        .filter((a) => known.has(a) && a !== sku),
    },
    sources: chunks.map((c) => ({ id: c.id, title: c.title })),
  };
}
