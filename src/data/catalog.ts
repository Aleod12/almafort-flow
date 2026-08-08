export type Stock = { qty: number; lead?: string };

/**
 * Инженерные ассеты детали. В БД это колонка JSONB `engineering_assets`,
 * в которой хранятся только текстовые URL — бинарники лежат в S3
 * (Yandex Object Storage, бакет almafort-cad-assets) с CORS для домена
 * и заголовком Content-Disposition: attachment.
 */
export type EngineeringAssets = {
  model_glb_url: string | null; // сжатая Draco-модель для WebGL-вьювера
  model_step_url: string; // твердотельная модель
  model_dwg_url: string; // 2D-чертёж AutoCAD
  passport_pdf_url: string; // технический паспорт
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  dims: string;
  material: string;
  gost: string;
  load: string;
  weight: number; // kg, вес единицы
  volume: number; // m3, объём единицы в упаковке
  stock: Stock;
  price: number;
  price1000: number;
  price5000: number;
  engineering_assets: EngineeringAssets;
};

export const CATEGORIES = [
  "Заглушки трубные",
  "Крепёж сэндвич-панелей",
  "Опоры КРЕПСС",
  "Колпачки защитные",
  "Хомуты и стяжки",
];

const raw: Array<[string, string, string, string, number, number, number, number, number, number]> = [
  ["ZG-100x100", "Заглушка квадратная 100х100", "Заглушки трубные", "100×100 мм", 12400, 18.4, 15.6, 13.2, 0.021, 0.00035],
  ["ZG-080x080", "Заглушка квадратная 80х80", "Заглушки трубные", "80×80 мм", 8600, 14.9, 12.7, 10.8, 0.017, 0.00026],
  ["ZG-D60", "Заглушка круглая Ø60", "Заглушки трубные", "Ø60 мм", 640, 9.8, 8.4, 7.1, 0.009, 0.00012],
  ["KR-458-B", "Опора КРЕПСС 458-B", "Опоры КРЕПСС", "112×64×48 мм", 21500, 54.2, 46.1, 39.0, 0.086, 0.00048],
  ["KR-512-A", "Опора КРЕПСС 512-A усиленная", "Опоры КРЕПСС", "140×70×52 мм", 0, 71.5, 60.8, 51.4, 0.121, 0.00072],
  ["SP-120", "Крепёж сэндвич-панели 120 мм", "Крепёж сэндвич-панелей", "L=120 мм", 34000, 11.2, 9.5, 8.1, 0.014, 0.00018],
  ["SP-160", "Крепёж сэндвич-панели 160 мм", "Крепёж сэндвич-панелей", "L=160 мм", 9800, 13.7, 11.6, 9.9, 0.019, 0.00024],
  ["KP-M12", "Колпачок защитный М12", "Колпачки защитные", "М12", 52000, 3.4, 2.9, 2.4, 0.003, 4e-05],
  ["KP-M16", "Колпачок защитный М16", "Колпачки защитные", "М16", 870, 4.1, 3.5, 2.9, 0.004, 6e-05],
  ["HM-200", "Хомут кабельный 200 мм", "Хомуты и стяжки", "200×4.8 мм", 128000, 1.8, 1.5, 1.2, 0.002, 3e-05],
  ["HM-300", "Хомут кабельный 300 мм", "Хомуты и стяжки", "300×4.8 мм", 46000, 2.6, 2.2, 1.9, 0.003, 5e-05],
  ["ZG-120x60", "Заглушка прямоугольная 120х60", "Заглушки трубные", "120×60 мм", 3200, 16.3, 13.9, 11.8, 0.019, 0.00029],
];

export const PRODUCTS: Product[] = raw.map(([sku, name, category, dims, qty, p, p1, p5, weight, volume]) => ({
  id: sku.toLowerCase(),
  sku,
  name,
  category,
  dims,
  material: "Полипропилен PP, ударопрочный",
  gost: "ГОСТ 26996-86 / ТУ 22.29.29",
  load: "до 240 кг статической нагрузки",
  weight,
  volume,
  stock: qty > 0 ? { qty } : { qty: 0, lead: "Под заказ 3 дня" },
  price: p,
  price1000: p1,
  price5000: p5,
}));

export function tierOf(qty: number): 0 | 1 | 2 {
  if (qty >= 5000) return 2;
  if (qty >= 1000) return 1;
  return 0;
}

export function unitPrice(p: Product, qty: number) {
  const t = tierOf(qty);
  return t === 2 ? p.price5000 : t === 1 ? p.price1000 : p.price;
}
