import { ArrowLeft } from "lucide-react";

/**
 * Универсальный возврат: history.back() сохраняет позицию скролла
 * предыдущей страницы. Если истории нет — уходим на fallback.
 */
export function BackLink({
  fallback = "/",
  label = "Назад",
  className = "",
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const goBack = () => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) window.history.back();
    else window.location.assign(fallback);
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary ${className}`}
    >
      <ArrowLeft className="size-4 shrink-0" strokeWidth={1.75} />
      {label}
    </button>
  );
}
