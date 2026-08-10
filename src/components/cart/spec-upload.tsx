import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/store/cart-store";

const MAX_BYTES = 10 * 1024 * 1024;

const ACCEPT = {
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
};

export function SpecUpload({ compact = false }: { compact?: boolean }) {
  const setParsing = useCart((s) => s.setParsing);
  const applyParse = useCart((s) => s.applyParse);
  const parsing = useCart((s) => s.parsing);

  const onDropAccepted = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setParsing(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/parser/upload", { method: "POST", body });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Ошибка разбора файла");
        applyParse(json);
        const { matched = 0, ambiguous = 0, notFound = 0, rowsScanned = 0 } = json;
        toast.success(`Обработано ${rowsScanned} строк: ${matched} распознано`, {
          description:
            ambiguous || notFound
              ? `${ambiguous} требуют уточнения, ${notFound} не найдено — разрешите их в корзине.`
              : "Все позиции добавлены в корзину.",
          action: {
            label: "Открыть корзину",
            onClick: () => {
              window.location.href = "/cart";
            },
          },
        });


      } catch (e) {
        setParsing(false);
        toast.error(e instanceof Error ? e.message : "Не удалось разобрать файл");
      }
    },
    [applyParse, setParsing],
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const code = rejections[0]?.errors[0]?.code;
    if (code === "file-too-large")
      toast.error("Файл больше 10 МБ. Разделите спецификацию на части.");
    else toast.error("Формат не поддерживается. Загрузите таблицу Excel или CSV");
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: false,
    noClick: false,
    onDropAccepted,
    onDropRejected,
  });

  if (parsing && !compact) return null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={open}
        {...getRootProps({
          className:
            "flex min-h-[48px] cursor-pointer items-center gap-2 rounded-sm border border-[#D1D5DB] bg-[#F3F4F6] px-4 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary",
        })}
      >
        <input {...getInputProps()} />
        <FileSpreadsheet className="size-4" strokeWidth={1.75} />
        Загрузить спецификацию Excel
      </button>
    );
  }

  return (
    <div
      {...getRootProps({
        className:
          "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg px-5 py-10 text-center sm:px-8 sm:py-14 transition-all duration-200",
      })}
      style={{
        border: isDragActive ? "2px solid #E52421" : "2px dashed #D1D5DB",
        backgroundColor: isDragActive ? "#F1F2F4" : "#F8F9FA",
      }}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <UploadCloud className="size-12 text-primary" strokeWidth={1.5} />
      ) : (
        <FileSpreadsheet className="size-12 text-muted-foreground" strokeWidth={1.5} />
      )}
      <p className="text-base font-medium text-foreground">
        Перетащите вашу спецификацию сюда (.xls, .xlsx, .csv)
      </p>
      <p className="text-sm text-muted-foreground">
        Алгоритм распознает артикулы, сформирует заказ и выдаст PDF-счёт. До 10 МБ.
      </p>
    </div>
  );
}

export function ParsingSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm font-semibold text-foreground">Распознаем номенклатуру...</p>
      <div className="mt-5 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-[18%] animate-pulse rounded bg-[#E5E7EB]" />
            <div className="h-4 flex-1 animate-pulse rounded bg-[#EDEEF0]" />
            <div className="h-4 w-[10%] animate-pulse rounded bg-[#E5E7EB]" />
            <div className="h-4 w-[12%] animate-pulse rounded bg-[#EDEEF0]" />
          </div>
        ))}
      </div>
    </div>
  );
}
