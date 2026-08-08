// Server-only: чтение «грязных» Excel/CSV спецификаций (Smart Import Engine v5.0).
// Ни одна строка клиента не теряется: каждая возвращается со статусом.
import * as XLSX from "xlsx";
import { normalize } from "@/lib/fuzzy-search";
import { extractQuantity, matchRow, type Candidate, type RowStatus } from "@/lib/spec-matcher";

export type ParsedRow = {
  id: string;
  sheet: string;
  originalString: string;
  quantity: number;
  status: RowStatus;
  score: number;
  sku: string | null;
  name: string | null;
  candidates: Candidate[];
};

export type ParseResult = {
  sheets: string[];
  rowsScanned: number;
  matched: number;
  ambiguous: number;
  notFound: number;
  rows: ParsedRow[];
};

const SKU_KEYS = ["артикул", "sku", "код", "кодтовара", "арт"];
const NAME_KEYS = ["наименование", "название", "номенклатура", "товар", "позиция", "материал"];
const QTY_KEYS = ["количество", "колво", "кол", "шт", "qty", "quantity", "объем"];
const HEADER_TRIGGERS = [...SKU_KEYS, ...NAME_KEYS, ...QTY_KEYS];

const MAX_ROWS = 2000;

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

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

/**
 * Файл без шапки («заглушка | 30 штук») — не повод падать: берём первую
 * колонку с буквами как наименование, следующую непустую — как количество.
 */
function guessColumns(rows: unknown[][]) {
  let name = -1;
  let qty = -1;
  const width = rows.reduce((m, r) => Math.max(m, r?.length ?? 0), 0);
  for (let c = 0; c < width; c++) {
    const values = rows.map((r) => cellText(r?.[c])).filter(Boolean);
    if (!values.length) continue;
    const letters = values.filter((v) => /[a-zа-яё]{3}/i.test(v)).length / values.length;
    const numeric = values.filter((v) => /\d/.test(v)).length / values.length;
    if (name < 0 && letters >= 0.5) name = c;
    else if (qty < 0 && numeric >= 0.5) qty = c;
  }
  return { sku: -1, name, qty };
}

let seq = 0;
const nextId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function parseSpecBuffer(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const out: ParsedRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (!rows.length) continue;

    const headerIdx = findHeaderRow(rows);
    const cols = headerIdx >= 0 ? mapColumns(rows[headerIdx] ?? []) : guessColumns(rows);
    if (cols.name < 0 && cols.sku < 0) continue;
    const start = headerIdx >= 0 ? headerIdx + 1 : 0;

    for (let i = start; i < rows.length && out.length < MAX_ROWS; i++) {
      const row = rows[i] ?? [];
      const skuRaw = cols.sku >= 0 ? cellText(row[cols.sku]) : "";
      const nameRaw = cols.name >= 0 ? cellText(row[cols.name]) : "";
      const label = [nameRaw, skuRaw].filter(Boolean).join(" ").trim();
      if (!label) continue;
      if (/^(итого|всего|раздел|подраздел|№|n\/n)\b/i.test(label)) continue;
      // строка-заголовок раздела: буквы без цифр и без количества
      const qtyCell = cols.qty >= 0 ? row[cols.qty] : "";
      if (!cellText(qtyCell) && !/\d/.test(label) && label.length < 4) continue;

      const quantity = extractQuantity(qtyCell);
      const verdict = matchRow(label, quantity);
      out.push({
        id: nextId(),
        sheet: sheetName,
        originalString: label,
        quantity,
        status: verdict.status,
        score: verdict.score,
        sku: verdict.sku,
        name: verdict.name,
        candidates: verdict.candidates,
      });
    }
  }

  return {
    sheets: wb.SheetNames,
    rowsScanned: out.length,
    matched: out.filter((r) => r.status === "MATCHED").length,
    ambiguous: out.filter((r) => r.status === "AMBIGUOUS").length,
    notFound: out.filter((r) => r.status === "NOT_FOUND").length,
    rows: out,
  };
}
