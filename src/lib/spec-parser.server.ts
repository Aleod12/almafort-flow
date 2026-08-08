// Server-only: чтение «грязных» Excel/CSV спецификаций и матчинг с номенклатурой ALMAFORT.
import * as XLSX from "xlsx";
import { PRODUCTS, unitPrice, type Product } from "@/data/catalog";
import { normalize, scoreMatch } from "@/lib/fuzzy-search";

export type ExactMatch = {
  sku: string;
  name: string;
  quantity: number;
  price: number;
  originalName: string;
};

export type SuggestedAnalog = {
  originalName: string;
  quantity: number;
  suggestedSku: string;
  suggestedName: string;
  price: number;
  matchConfidence: number;
};

export type Unmapped = { originalString: string; quantity: number };

export type ParseResult = {
  sheets: string[];
  rowsScanned: number;
  exactMatches: ExactMatch[];
  suggestedAnalogs: SuggestedAnalog[];
  unmapped: Unmapped[];
};

const SKU_KEYS = ["артикул", "sku", "код", "кодтовара", "арт"];
const NAME_KEYS = ["наименование", "название", "номенклатура", "товар", "позиция"];
const QTY_KEYS = ["количество", "колво", "кол", "шт", "qty", "quantity", "объем"];

const HEADER_TRIGGERS = [...SKU_KEYS, ...NAME_KEYS, ...QTY_KEYS];

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Ищем строку заголовков по ключевым триггерам, всё выше (логотипы, реквизиты) отсекаем. */
function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map((c) => normalize(cellText(c)));
    const hits = cells.filter((c) => c && HEADER_TRIGGERS.some((k) => c.includes(k))).length;
    if (hits >= 2) return i;
  }
  return -1;
}

function mapColumns(header: unknown[]) {
  let sku = -1;
  let name = -1;
  let qty = -1;
  header.forEach((raw, idx) => {
    const c = normalize(cellText(raw));
    if (!c) return;
    if (sku < 0 && SKU_KEYS.some((k) => c.includes(k))) sku = idx;
    else if (name < 0 && NAME_KEYS.some((k) => c.includes(k))) name = idx;
    else if (qty < 0 && QTY_KEYS.some((k) => c.includes(k))) qty = idx;
  });
  return { sku, name, qty };
}

function parseQty(raw: unknown): number {
  const s = cellText(raw).replace(/\s|\u00a0/g, "").replace(",", ".");
  const n = Number.parseFloat(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Из «Заглушка пласт. черн. 100х100мм» вытаскиваем 100x100 */
export function extractDims(s: string): string | null {
  const m = s
    .toLowerCase()
    .replace(/[хx×*]/g, "x")
    .match(/(\d{1,4})\s*x\s*(\d{1,4})(?:\s*x\s*(\d{1,4}))?/);
  if (!m) return null;
  return [m[1], m[2], m[3]].filter(Boolean).join("x");
}

const skuIndex = new Map<string, Product>();
for (const p of PRODUCTS) skuIndex.set(normalize(p.sku), p);

function matchBySku(raw: string): Product | null {
  const key = normalize(raw);
  if (!key) return null;
  return skuIndex.get(key) ?? null;
}

function matchByDims(name: string): { product: Product; confidence: number } | null {
  const dims = extractDims(name);
  if (!dims) return null;
  for (const p of PRODUCTS) {
    const pd = extractDims(p.dims) ?? extractDims(p.name);
    if (pd && pd === dims) {
      const sameKind = scoreMatch(p.name, name.split(/[\s,.]/)[0] ?? "") > 0;
      return { product: p, confidence: sameKind ? 0.92 : 0.78 };
    }
  }
  return null;
}

function matchFuzzy(name: string): { product: Product; confidence: number } | null {
  const tokens = name
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/i)
    .filter((t) => t.length >= 3);
  if (!tokens.length) return null;

  let best: { product: Product; score: number } | null = null;
  for (const p of PRODUCTS) {
    const haystack = `${p.name} ${p.dims} ${p.category} ${p.material}`;
    let score = 0;
    for (const t of tokens) score += scoreMatch(haystack, t);
    score = score / tokens.length;
    if (!best || score > best.score) best = { product: p, score };
  }
  if (!best || best.score < 45) return null;
  return { product: best.product, confidence: Math.min(0.95, best.score / 100) };
}

export function parseSpecBuffer(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });

  const exactMatches: ExactMatch[] = [];
  const suggestedAnalogs: SuggestedAnalog[] = [];
  const unmapped: Unmapped[] = [];
  let rowsScanned = 0;

  // Проходим по всем листам — снабженцы делят заказ по разделам.
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    const headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) continue;

    const cols = mapColumns(rows[headerIdx] ?? []);
    if (cols.name < 0 && cols.sku < 0) continue;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const skuRaw = cols.sku >= 0 ? cellText(row[cols.sku]) : "";
      const nameRaw = cols.name >= 0 ? cellText(row[cols.name]) : "";
      const label = nameRaw || skuRaw;
      if (!label) continue;
      // отсекаем «Итого», подзаголовки разделов и пустые строки
      if (/^(итого|всего|раздел|подраздел)\b/i.test(label)) continue;

      const quantity = cols.qty >= 0 ? parseQty(row[cols.qty]) : 0;
      if (!quantity) {
        if (nameRaw && !skuRaw && !/\d/.test(nameRaw)) continue; // заголовок раздела
      }
      rowsScanned++;
      const qty = quantity || 1;

      // 1. Точное совпадение по артикулу
      const exact = matchBySku(skuRaw) ?? matchBySku(label);
      if (exact) {
        exactMatches.push({
          sku: exact.sku,
          name: exact.name,
          quantity: qty,
          price: unitPrice(exact, qty),
          originalName: label,
        });
        continue;
      }

      // 2. Нормализация + regex по габаритам, 3. Нечёткий поиск
      const guess = matchByDims(label) ?? matchFuzzy(label);
      if (guess) {
        suggestedAnalogs.push({
          originalName: label,
          quantity: qty,
          suggestedSku: guess.product.sku,
          suggestedName: guess.product.name,
          price: unitPrice(guess.product, qty),
          matchConfidence: Number(guess.confidence.toFixed(2)),
        });
        continue;
      }

      unmapped.push({ originalString: label, quantity: qty });
    }
  }

  return {
    sheets: wb.SheetNames,
    rowsScanned,
    exactMatches,
    suggestedAnalogs,
    unmapped,
  };
}
