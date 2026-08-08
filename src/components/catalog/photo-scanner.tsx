import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, ImageUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/store/cart-store";

type Match = {
  sku: string;
  name: string;
  dims: string;
  price: number;
  stock: number;
  lead: string | null;
};

type Verdict = {
  type: string;
  shape: string;
  color: string;
  has_threads: boolean;
  confidence: number;
};

type Result = { verdict: Verdict; matches: Match[] };

const money = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PhotoScanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addLine = useCart((s) => s.addLine);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      setResult(null);
      setCamError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("no api"), { name: "NotFoundError" });
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        // NotFoundError — камеры нет физически, NotAllowedError — доступ запрещён.
        const name = (e as { name?: string })?.name ?? "";
        setCamError(
          name === "NotAllowedError"
            ? "Доступ к камере запрещён"
            : "Камера не обнаружена",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop]);

  const analyze = async (image: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/vision/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Не удалось распознать деталь");
      setResult(json as Result);
      stop();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка распознавания");
    } finally {
      setBusy(false);
    }
  };

  /** Загрузка картинки с диска — сценарий для офисного ПК без камеры. */
  const pickFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Нужен файл изображения: JPG, PNG или WEBP");
      return;
    }
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
      toast.error("Не удалось прочитать изображение");
      return;
    }
    const scale = Math.min(1, 1024 / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    await analyze(canvas.toDataURL("image/webp", 0.8));
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    try {
      // Масштабируем до 1024px и жмём в WebP 0.8 — payload в килобайтах, не мегабайтах.
      const scale = Math.min(1, 1024 / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/webp", 0.8);

      const res = await fetch("/api/vision/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Не удалось распознать деталь");
      setResult(json as Result);
      stop();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка распознавания");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[oklch(0.16_0.01_264)]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть сканер"
        className="absolute right-4 top-4 z-10 grid size-10 cursor-pointer place-items-center rounded-full bg-black/50 text-white"
      >
        <X className="size-5" strokeWidth={2} />
      </button>

      {!result && (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover opacity-90"
          />
          {/* Тёмная маска с прозрачным окном видоискателя */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[58vw] max-h-[420px] w-[58vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-sm shadow-[0_0_0_100vmax_oklch(0_0_0/0.62)]"
            aria-hidden
          >
            {busy && <span className="scan-beam" />}
          </div>
          {/* Прицел */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[58vw] max-h-[420px] w-[58vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2"
            aria-hidden
          >
            <path
              d="M2 22V2h20M78 2h20v20M98 78v20H78M22 98H2V78"
              fill="none"
              stroke="#E52421"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 p-8">
            <p className="max-w-[42ch] text-center text-xs leading-[1.5] text-white/75">
              {camError ??
                "Поместите деталь в центр. Для тёмных деталей используйте светлый фон."}
            </p>

            <button
              type="button"
              onClick={capture}
              disabled={busy || !!camError}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground shadow-[0_0_0_0_oklch(0.58_0.22_27/0.6)] transition-transform hover:scale-[1.02] disabled:opacity-50 motion-safe:animate-[pulse_2s_ease-in-out_infinite]"
            >
              {busy && <Loader2 className="size-4 animate-spin" strokeWidth={2} />}
              {busy ? "Анализируем кадр…" : "Распознать деталь"}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card p-6 motion-safe:animate-[slide-in-bottom_0.28s_ease-out]">
          <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-[#D1D5DB]" />
          <h3 className="text-lg font-bold text-foreground">
            Распознана {result.verdict.type} {result.verdict.shape}
            {result.verdict.color ? `, ${result.verdict.color}` : ""}
            {result.verdict.has_threads ? ", с резьбой" : ""}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Уверенность {Math.round(result.verdict.confidence * 100)}%. Наиболее точные совпадения
            из нашего каталога:
          </p>
          <ul className="mt-5 space-y-3">
            {result.matches.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Совпадений не найдено — пришлите фото менеджеру, подберём вручную.
              </li>
            )}
            {result.matches.map((m) => (
              <li
                key={m.sku}
                className="flex items-center gap-4 rounded-md border border-border p-4"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-sm bg-surface text-xs font-semibold text-muted-foreground">
                  {m.sku.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.sku} · {m.dims} ·{" "}
                    {m.stock > 0 ? `${m.stock.toLocaleString("ru-RU")} шт на складе` : "под заказ"}
                  </span>
                  <span className="mt-1 block text-sm font-bold tabular-nums text-foreground">
                    {money(m.price)} ₽
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    addLine(m.sku, 1);
                    toast.success(`${m.sku} добавлен в корзину`);
                  }}
                  className="shrink-0 cursor-pointer rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  В корзину
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full cursor-pointer rounded-sm border border-[#D1D5DB] py-3 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            Закрыть
          </button>
        </div>
      )}
    </div>
  );
}
