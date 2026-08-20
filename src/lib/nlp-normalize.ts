/**
 * Предобработка свободного текста для ИИ-конфигуратора ALMAFORT.
 *
 * Снабженец пишет как говорит: «кандер 150кг на сендвич толщина 100»,
 * иногда в английской раскладке («rhtgt; lkz nhe,s») или транслитом
 * («krepezh dlya truby»). Нормализуем ввод ДО обращения к нейросети,
 * а заодно ловим prompt-injection, абсурдные задачи и запредельные массы —
 * такие запросы до платного LLM-вызова вообще не доходят.
 */

/** Английская раскладка → русская (стандарт ЙЦУКЕН). */
const LAYOUT: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  "[": "х", "]": "ъ", a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о",
  k: "л", l: "д", ";": "ж", "'": "э", z: "я", x: "ч", c: "с", v: "м", b: "и",
  n: "т", m: "ь", ",": "б", ".": "ю", "/": ".",
};

/** Транслит → кириллица. Порядок важен: сначала диграфы. */
const TRANSLIT: Array<[RegExp, string]> = [
  [/shch/g, "щ"], [/sch/g, "щ"], [/zh/g, "ж"], [/kh/g, "х"], [/ch/g, "ч"],
  [/sh/g, "ш"], [/ts/g, "ц"], [/yu/g, "ю"], [/ya/g, "я"], [/yo/g, "ё"],
  [/jo/g, "ё"], [/ju/g, "ю"], [/ja/g, "я"], [/a/g, "а"], [/b/g, "б"],
  [/c/g, "к"], [/d/g, "д"], [/e/g, "е"], [/f/g, "ф"], [/g/g, "г"], [/h/g, "х"],
  [/i/g, "и"], [/j/g, "й"], [/k/g, "к"], [/l/g, "л"], [/m/g, "м"], [/n/g, "н"],
  [/o/g, "о"], [/p/g, "п"], [/q/g, "к"], [/r/g, "р"], [/s/g, "с"], [/t/g, "т"],
  [/u/g, "у"], [/v/g, "в"], [/w/g, "в"], [/x/g, "кс"], [/y/g, "ы"], [/z/g, "з"],
];

/**
 * Инженерный сленг и опечатки → термины каталога.
 * Границы слов заданы явно: \b в JS не работает с кириллицей.
 */
const W = "[а-яёa-z0-9]";
const SLANG: Array<[RegExp, string]> = [
  [/(^|[^а-яё])канд(ер|ей|юк|юх)[а-яё]*/gi, "$1кондиционер"],
  [/(^|[^а-яё])конде[йя][а-яё]*/gi, "$1кондиционер"],
  [/сплит[- ]?систем[а-яё]*/gi, "кондиционер"],
  [/сэндвич[- ]?панел[а-яё]*|сендвич[- ]?панел[а-яё]*/gi, "сэндвич-панель"],
  [/(^|[^а-яё])сендвич[а-яё]*/gi, "$1сэндвич-панель"],
  [/(^|[^а-яё])сэндвич(?!-панель)[а-яё]*/gi, "$1сэндвич-панель"],
  [/(^|[^а-яё])крепс[а-яё]*/gi, "$1КРЕПСС крепёж для сэндвич-панелей"],
  [/(^|[^а-яё])(чопик|затычк|пробк)[а-яё]*/gi, "$1заглушка"],
  [/(^|[^а-яё])(копыт|башмак|пятк|ножк)[а-яё]*/gi, "$1опора"],
  [/(^|[^а-яё])(краб|клипс)[а-яё]*/gi, "$1кляймер"],
  [/(^|[^а-яё])(террас|декинг)[а-яё]*/gi, "$1террасная доска ДПК"],
  [/(^|[^а-яё])профтруб[а-яё]*/gi, "$1профильная труба"],
  [/(^|[^а-яё])(гипрок|гкл)[а-яё]*/gi, "$1гипсокартон"],
  [/(^|[^а-яё])кандиционер[а-яё]*/gi, "$1кондиционер"],
];

const RU_HINTS = [
  "креп", "труб", "заглуш", "опор", "кондицион", "панел", "бетон", "металл",
  "дерев", "нужн", "гайк", "болт", "кляймер", "стеллаж", "монтаж", "для",
  "весом", "нагруз", "станок", "стан", "кг",
];

function ruScore(text: string): number {
  return RU_HINTS.reduce((s, h) => (text.includes(h) ? s + 1 : s), 0);
}

function fromLayout(text: string): string {
  return text.replace(/[a-z[\];',./]/gi, (ch) => {
    const lower = ch.toLowerCase();
    return LAYOUT[lower] ?? ch;
  });
}

function fromTranslit(text: string): string {
  let out = text.toLowerCase();
  for (const [re, ru] of TRANSLIT) out = out.replace(re, ru);
  return out;
}

export type NormalizedQuery = {
  /** Текст, который уходит в нейросеть. */
  text: string;
  /** Пояснения для клиента: что именно мы поняли из его формулировки. */
  notes: string[];
  /** Масса объекта в килограммах, если её удалось извлечь. */
  massKg: number | null;
  /** Толщина основания в мм (сэндвич-панель и т. п.). */
  thicknessMm: number | null;
  /** Найдено ли в тексте основание монтажа. */
  hasBase: boolean;
};

const MASS_UNITS: Array<[RegExp, number]> = [
  [/(\d[\d\s.,]*?)\s*т(?:онн[а-яё]*|\.)?(?![а-яёa-z])/i, 1000],
  [/(\d[\d\s.,]*?)\s*(?:кг|килограмм[а-яё]*)/i, 1],
];

/** «50 000 тонн», «150кг», «2,5 т» → килограммы. */
export function extractMassKg(text: string): number | null {
  for (const [re, k] of MASS_UNITS) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const value = Number(m[1].replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(value) && value > 0) return value * k;
  }
  return null;
}

const BASE_RE =
  /бетон|кирпич|металл|сталь|дерев|сэндвич|сендвич|гипсокартон|профил|кровл|стен|пол\b|потол|панел|фасад|швеллер|каркас/i;

/** Нормализация ввода: раскладка, транслит, сленг, единицы измерения. */
export function normalizeQuery(raw: string): NormalizedQuery {
  const notes: string[] = [];
  let text = raw.replace(/\s+/g, " ").trim();

  const hasCyrillic = /[а-яё]/i.test(text);
  if (!hasCyrillic && /[a-z]/i.test(text)) {
    const layout = fromLayout(text);
    const translit = fromTranslit(text);
    const best = ruScore(layout) >= ruScore(translit) ? layout : translit;
    if (ruScore(best) > 0) {
      text = best;
      notes.push(`Запрос распознан как «${text}»`);
    }
  }

  const before = text;
  for (const [re, term] of SLANG) text = text.replace(re, term);
  if (text !== before) notes.push("Инженерный сленг приведён к терминам каталога");

  const massKg = extractMassKg(text);
  const thick = text.match(/толщин[а-яё]*\s*(?:панели\s*)?(\d{2,4})|(\d{2,4})\s*мм/i);
  const thicknessMm = thick ? Number(thick[1] ?? thick[2]) : null;

  return { text, notes, massKg, thicknessMm, hasBase: BASE_RE.test(text) };
}

/* --------------------------- GUARDRAILS ---------------------------------- */

const INJECTION = [
  /забудь\s+(все|всё|предыдущ|прошл)/i,
  /игнорир\w*\s+(все|всё|предыдущ|инструкц)/i,
  /ignore\s+(all\s+)?(previous|prior)/i,
  /(системн\w+|system)\s*(промпт|prompt)/i,
  /(покажи|выведи|раскрой|скажи)\b[^.]{0,60}(промпт|prompt|инструкц)/i,
  /ты\s+(больше\s+не|теперь)\s+/i,
  /наценк\w*|маржинальн\w*|себестоимост\w*/i,
  /jailbreak|developer mode|do anything now/i,
  /act as|веди себя как(?!.*инженер)/i,
];

/** Попытка взлома промпта или выуживания коммерческой тайны. */
export function isPromptInjection(text: string): boolean {
  return INJECTION.some((re) => re.test(text));
}

/** Попытка продиктовать цену/скидку — считаем только цены из базы. */
export function isPriceManipulation(text: string): boolean {
  return (
    /(по\s*цене|за)\s*0[\s,.]*(руб|₽|р\b)/i.test(text) ||
    /бесплатн\w*|нулев\w*\s*цен|скидк\w*\s*100/i.test(text) ||
    /(я\s+(ваш|твой)\s+)?(генеральн\w*\s+)?директор|я\s+админ/i.test(text)
  );
}

/** Технологически невозможные сочетания материалов и операций. */
export function impossibleCombo(text: string): string | null {
  const t = text.toLowerCase();
  const welding = /привар|сварк|сварить|варить/.test(t);
  const plastic = /пластик|полимер|пвх|пнд|пп\b|абс\b|дпк/.test(t);
  const mineral = /бетон|кирпич|камен|стекл/.test(t);
  if (welding && plastic && mineral) {
    return "Сварка пластика с бетоном технологически невозможна: полимер не сваривается с минеральным основанием. Рабочее решение — стальные хомуты на трубе с анкерным креплением в бетон, а полимерные детали ALMAFORT применяются как проставки и заглушки узла.";
  }
  if (welding && plastic) {
    return "Пластиковые детали не привариваются к металлу. Используйте механическое крепление: сквозной крепёж, хомуты или клеевое соединение под конкретный полимер.";
  }
  if (/склеи|клей/.test(t) && /масл|мокр|под водой|влажн\w* поверхн/.test(t)) {
    return "Клеевое соединение на замасленной или мокрой поверхности не держит нагрузку. Требуется механическое крепление.";
  }
  return null;
}

/** Верхний предел типового крепежа: выше — только индивидуальный расчёт. */
export const MASS_LIMIT_KG = 5000;

/**
 * Достаточно ли данных для расчёта нагруженного узла.
 * Возвращает список уточняющих вопросов (пусто — данных хватает).
 */
export function clarificationQuestions(n: NormalizedQuery): string[] {
  const loadTask =
    /закреп|повес|подвес|нагруз|станок|оборудован|тяжел|весом|подвеш/i.test(n.text);
  if (!loadTask) return [];
  const questions: string[] = [];
  if (n.massKg === null) questions.push("Какой точный вес закрепляемого объекта (в кг)?");
  if (!n.hasBase)
    questions.push("В какое основание выполняется монтаж: бетон, металл, дерево, сэндвич-панель?");
  // Один недостающий параметр модель до-считает сама, два — гадание.
  return questions.length >= 2 ? questions : [];
}

/** Классическая схема навесного монтажа: 4 точки и запас 1.5. */
export function loadDistribution(massKg: number, points = 4, margin = 1.5) {
  const perPoint = massKg / points;
  return {
    points,
    perPoint: Math.round(perPoint * 100) / 100,
    margin,
    requiredPerPoint: Math.round(perPoint * margin * 100) / 100,
  };
}
