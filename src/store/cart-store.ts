import { create } from "zustand";
import { PRODUCTS, tierOf, unitPrice, type Product } from "@/data/catalog";

export type CartLine = {
  sku: string;
  name: string;
  quantity: number;
  /** Как строка называлась в исходной спецификации клиента */
  originalName?: string | undefined;
};

export type AnalogSuggestion = {
  id: string;
  originalName: string;
  quantity: number;
  suggestedSku: string;
  suggestedName: string;
  matchConfidence: number;
};

export type UnmappedLine = { id: string; originalString: string; quantity: number };

export type Carrier = "cdek" | "dl" | "pickup";

export type ParsePayload = {
  fileName?: string;
  exactMatches: Array<{ sku: string; name?: string; quantity: number; originalName?: string }>;
  suggestedAnalogs: Array<{
    originalName: string;
    quantity: number;
    suggestedSku: string;
    suggestedName?: string;
    matchConfidence: number;
  }>;
  unmapped: Array<{ originalString: string; quantity: number }>;
};

export const productBySku = (sku: string) => PRODUCTS.find((p) => p.sku === sku);

/** Чистая функция каскадных скидок. */
export function linePrice(sku: string, qty: number) {
  const p = productBySku(sku);
  if (!p) return { base: 0, unit: 0, tier: 0 as 0 | 1 | 2, sum: 0 };
  const unit = unitPrice(p, qty);
  return { base: p.price, unit, tier: tierOf(qty), sum: unit * qty };
}

export function cartTotals(lines: CartLine[]) {
  let goods = 0;
  let weight = 0;
  for (const l of lines) {
    goods += linePrice(l.sku, l.quantity).sum;
    weight += (productBySku(l.sku)?.weight ?? 0) * l.quantity;
  }
  return { goods, weight };
}

export type Quote = { carrier: Exclude<Carrier, "pickup">; label: string; price: number; days: number };

/** Локальный фолбэк, если сервис расчёта недоступен. */
export function deliveryCost(carrier: Carrier, weight: number) {
  if (carrier === "pickup" || weight <= 0) return 0;
  const base = carrier === "cdek" ? 690 : 1250;
  return Math.round(base + weight * (carrier === "cdek" ? 32 : 18));
}

type State = {
  fileName: string | null;
  parsing: boolean;
  lines: CartLine[];
  analogs: AnalogSuggestion[];
  unmapped: UnmappedLine[];
  carrier: Carrier;
  city: string;
  quotes: Quote[];
  quoting: boolean;
  quoteError: string | null;
  setQuotes: (q: Quote[]) => void;
  setQuoting: (v: boolean) => void;
  setQuoteError: (e: string | null) => void;
  setParsing: (v: boolean) => void;
  applyParse: (payload: ParsePayload) => void;
  addLine: (sku: string, quantity: number, originalName?: string) => void;
  setQuantity: (sku: string, quantity: number) => void;
  removeLine: (sku: string) => void;
  confirmAnalog: (id: string) => void;
  rejectAnalog: (id: string) => void;
  resolveUnmapped: (id: string, product: Product) => void;
  removeUnmapped: (id: string) => void;
  setCarrier: (c: Carrier) => void;
  setCity: (c: string) => void;
  clear: () => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const useCart = create<State>((set) => ({
  fileName: null,
  parsing: false,
  lines: [],
  analogs: [],
  unmapped: [],
  carrier: "cdek",
  city: "",
  quotes: [],
  quoting: false,
  quoteError: null,

  setQuotes: (quotes) => set({ quotes, quoteError: null }),
  setQuoting: (quoting) => set({ quoting }),
  setQuoteError: (quoteError) => set({ quoteError, quotes: [] }),

  setParsing: (v) => set({ parsing: v }),

  applyParse: (payload) =>
    set((s) => {
      const lines = [...s.lines];
      for (const m of payload.exactMatches) {
        const p = productBySku(m.sku);
        if (!p) continue;
        const found = lines.find((l) => l.sku === m.sku);
        if (found) found.quantity += m.quantity;
        else
          lines.push({
            sku: p.sku,
            name: p.name,
            quantity: m.quantity,
            originalName: m.originalName,
          });
      }
      return {
        fileName: payload.fileName ?? s.fileName,
        parsing: false,
        lines,
        analogs: [
          ...s.analogs,
          ...payload.suggestedAnalogs.map((a) => ({
            id: uid(),
            originalName: a.originalName,
            quantity: a.quantity,
            suggestedSku: a.suggestedSku,
            suggestedName: a.suggestedName ?? productBySku(a.suggestedSku)?.name ?? a.suggestedSku,
            matchConfidence: a.matchConfidence,
          })),
        ],
        unmapped: [
          ...s.unmapped,
          ...payload.unmapped.map((u) => ({ id: uid(), ...u })),
        ],
      };
    }),

  addLine: (sku, quantity, originalName) =>
    set((s) => {
      const p = productBySku(sku);
      if (!p) return s;
      const lines = [...s.lines];
      const found = lines.find((l) => l.sku === sku);
      if (found) found.quantity += quantity;
      else lines.push({ sku, name: p.name, quantity, originalName });
      return { lines };
    }),

  setQuantity: (sku, quantity) =>
    set((s) => ({
      lines: s.lines.map((l) => (l.sku === sku ? { ...l, quantity: Math.max(0, quantity) } : l)),
    })),

  removeLine: (sku) => set((s) => ({ lines: s.lines.filter((l) => l.sku !== sku) })),

  confirmAnalog: (id) =>
    set((s) => {
      const a = s.analogs.find((x) => x.id === id);
      if (!a) return s;
      const p = productBySku(a.suggestedSku);
      if (!p) return s;
      const lines = [...s.lines];
      const found = lines.find((l) => l.sku === p.sku);
      if (found) found.quantity += a.quantity;
      else
        lines.push({
          sku: p.sku,
          name: p.name,
          quantity: a.quantity,
          originalName: a.originalName,
        });
      return { lines, analogs: s.analogs.filter((x) => x.id !== id) };
    }),

  rejectAnalog: (id) =>
    set((s) => {
      const a = s.analogs.find((x) => x.id === id);
      if (!a) return s;
      return {
        analogs: s.analogs.filter((x) => x.id !== id),
        unmapped: [
          ...s.unmapped,
          { id: uid(), originalString: a.originalName, quantity: a.quantity },
        ],
      };
    }),

  resolveUnmapped: (id, product) =>
    set((s) => {
      const u = s.unmapped.find((x) => x.id === id);
      if (!u) return s;
      const lines = [...s.lines];
      const found = lines.find((l) => l.sku === product.sku);
      if (found) found.quantity += u.quantity;
      else
        lines.push({
          sku: product.sku,
          name: product.name,
          quantity: u.quantity,
          originalName: u.originalString,
        });
      return { lines, unmapped: s.unmapped.filter((x) => x.id !== id) };
    }),

  removeUnmapped: (id) => set((s) => ({ unmapped: s.unmapped.filter((x) => x.id !== id) })),

  setCarrier: (carrier) => set({ carrier }),
  setCity: (city) => set({ city }),

  clear: () =>
    set({ lines: [], analogs: [], unmapped: [], fileName: null, quotes: [], quoteError: null }),
}));
