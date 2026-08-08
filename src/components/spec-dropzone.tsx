import { useRef, useState, type DragEvent } from "react";
import { Download, Table2, Upload } from "lucide-react";
import { toast } from "sonner";

export function SpecDropzone() {
  const [active, setActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    toast.success(`Спецификация «${file.name}» принята`, {
      description: "Алгоритм распознаёт артикулы и формирует счёт.",
    });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setActive(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Desktop / tablet drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        className={`hidden cursor-pointer flex-col items-center justify-center gap-3 rounded-md px-8 py-12 text-center transition-all duration-200 ease-in-out sm:flex ${
          active
            ? "border border-solid border-primary bg-accent"
            : "border border-dashed bg-surface"
        }`}
        style={{ borderColor: active ? "var(--primary)" : "var(--dashed)" }}
      >
        {active ? (
          <Upload className="size-8 text-primary" strokeWidth={1.5} />
        ) : (
          <Table2 className="size-8 text-muted-foreground" strokeWidth={1.5} />
        )}
        <p className="text-base font-medium text-foreground">
          Перетащите вашу спецификацию сюда (.xls, .csv)
        </p>
        <p className="text-xs text-muted-foreground">
          Алгоритм распознает артикулы, сформирует заказ и выдаст PDF-счет
        </p>
      </div>

      {/* Mobile tap button */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition-all duration-200 ease-in-out active:opacity-90 sm:hidden"
      >
        <Download className="size-5" strokeWidth={1.5} />
        Загрузить спецификацию
      </button>
    </div>
  );
}
