const STEPS = [
  {
    title: "Мгновенный парсинг",
    text: "Загрузите смету. Алгоритм за 3 секунды распознает 10 000+ артикулов и найдет 100% совпадения или ближайшие ГОСТ-аналоги.",
  },
  {
    title: "Матрица оптовых цен",
    text: "Система автоматически применит каскадные скидки (до 40%) в зависимости от объема партии прямо в корзине.",
  },
  {
    title: "Бесшовная логистика",
    text: "Прямая API-интеграция. Точный расчет сроков и стоимости доставки (СДЭК, ПЭК, Деловые Линии) до вашего объекта.",
  },
  {
    title: "ЭДО и документы",
    text: "Платформа сгенерирует готовый договор и счет в PDF. Обмен закрывающими документами через СБИС и Диадок.",
  },
];

export function PlatformTerminal() {
  return (
    <aside
      className="rounded-lg border border-border bg-card p-6 lg:p-8"
      style={{ boxShadow: "0 10px 30px oklch(0 0 0 / 0.05)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Как работает платформа
      </p>

      <ol className="mt-7 space-y-7 border-l border-border pl-6">
        {STEPS.map((step) => (
          <li key={step.title} className="relative">
            <span
              aria-hidden
              className="absolute -left-[27.5px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card"
            />
            <h3 className="text-base font-bold text-foreground">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-[1.55] text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
