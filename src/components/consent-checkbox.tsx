/**
 * Согласие на обработку персональных данных (152-ФЗ).
 * Без галочки кнопка отправки блокируется, при попытке отправки текст краснеет.
 */
export function ConsentCheckbox({
  checked,
  onChange,
  invalid = false,
  id = "consent",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`mt-6 flex cursor-pointer items-start gap-3 text-xs leading-[1.6] ${
        invalid && !checked ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`mt-0.5 size-4 shrink-0 cursor-pointer rounded-[3px] accent-[var(--primary)] ${
          invalid && !checked ? "outline outline-1 outline-primary" : ""
        }`}
      />
      <span>
        Я согласен на обработку персональных данных в соответствии с{" "}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          Политикой конфиденциальности
        </a>
        .
      </span>
    </label>
  );
}
