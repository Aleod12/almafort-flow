import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, ImageUp, Loader2, RefreshCw, SwitchCamera, TriangleAlert, X } from "lucide-react";
import { useSwipeClose } from "@/lib/use-swipe-close";
import { toast } from "sonner";
import { useCart } from "@/store/cart-store";
import { formatPrice } from "@/lib/pricing";
import { QuoteRequestModal } from "@/components/catalog/quote-request-modal";

type Item = {
  sku: string;
  name: string;
  dims: string;
  price: number;
  stock: number;
  lead: string | null;
};

type Verdict = {
  status: "VALID" | "FOREIGN" | "INVALID";
  type: string;
  shape: string;
  color: string;
  has_threads: boolean;
  confidence: number;
  observed: string;
  hands_present: boolean;
};

type Result =
  | { scenario: "exact"; verdict: Verdict; category: string; variants: Item[] }
  | { scenario: "ambiguous"; verdict: Verdict; matches: Item[] }
  | { scenario: "foreign"; verdict: Verdict }
  | { scenario: "invalid"; verdict: Verdict };

/**
 * Резкость кадра через дисперсию лапласиана по яркости.
 * Смазанный кадр даёт низкую дисперсию — блокируем отправку и экономим API-бюджет.
 */
function sharpness(canvas: HTMLCanvasElement): number {
  const w = 160;
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  if (!ctx) return Infinity;
  ctx.drawImage(canvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - w]! - gray[i + w]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (!n) return Infinity;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

const BLUR_THRESHOLD = 45;

export function PhotoScanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const swipe = useSwipeClose(() => setResult(null));
  const [dragOver, setDragOver] = useState(false);
  const [shake, setShake] = useState(false);
  const [size, setSize] = useState("");
  const [reverse, setReverse] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addLine = useCart((s) => s.addLine);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const facingRef = useRef<"environment" | "user">("environment");
  facingRef.current = facing;

  const start = useCallback(async () => {
    setCamError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("no api"), { name: "NotFoundError" });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingRef.current }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (e) {
      // NotFoundError — камеры нет физически, NotAllowedError — доступ запрещён.
      const name = (e as { name?: string })?.name ?? "";
      const denied = name === "NotAllowedError" || name === "SecurityError";
      setDenied(denied);
      setCamError(
        denied
          ? "Доступ к камере запрещён"
          : name === "NotReadableError"
            ? "Камера занята другим приложением"
            : "Камера не обнаружена",
      );
    }
  }, []);

  const shakeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  useEffect(() => {
    if (!open) {
      stop();
      setResult(null);
      setCamError(null);
      setSize("");
      setReverse(false);
      setDenied(false);
      return;
    }
    void start();

    // Блокировка экрана обрывает трек: при возврате поднимаем поток заново,
    // иначе вместо видео остаётся чёрный квадрат.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const live = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
      if (!live) {
        stop();
        void start();
      } else {
        void videoRef.current?.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Фон под полноэкранным сканером не прокручивается
    // Esc закрывает полноэкранный сканер — привычная клавиша на ПК.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      document.body.style.overflow = prevOverflow;
      stop();
    };
  }, [open, start, stop, onClose]);

  /** Переключение основная ↔ фронтальная камера. */
  const flipCamera = () => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    facingRef.current = next;
    stop();
    void start();
  };

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
      const data = json as Result;
      setResult(data);
      setSize("");
      // Сценарий «мусор в кадре» — камеру не закрываем, клиент переснимает.
      if (data.scenario !== "invalid") stop();
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
    // Кроп строго по центральной рамке видоискателя: нейросеть получает деталь,
    // а не стол, руки и фон. Далее ужимаем до 1024px и жмём в WebP.
    const side = Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.72);
    const sx = Math.round((video.videoWidth - side) / 2);
    const sy = Math.round((video.videoHeight - side) / 2);
    const out = Math.min(1024, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    canvas.getContext("2d")?.drawImage(video, sx, sy, side, side, 0, 0, out, out);

    if (sharpness(canvas) < BLUR_THRESHOLD) {
      setShake(true);
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShake(false), 2000);
      return;
    }
    await analyze(canvas.toDataURL("image/webp", 0.85));
  };

  const retry = () => {
    setResult(null);
    void start();
  };

  if (!open) return null;

  const showCamera = !camError && (!result || result.scenario === "invalid");

  return (
    <div
      className="fixed inset-0 z-50 bg-[oklch(0.16_0.01_264)]"
      // В офисе веб-камеры обычно нет: фото детали перетаскивают мышью с рабочего стола.
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void pickFile(e.dataTransfer.files?.[0]);
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-6 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-white/70 bg-black/50 text-center text-white">
          <div>
            <ImageUp className="mx-auto size-8" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-semibold">Отпустите фото — распознаем деталь</p>
            <p className="text-xs text-white/70">JPG, PNG, WEBP · сжимаем на вашем компьютере</p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть сканер"
        className="absolute right-4 top-4 z-20 grid size-11 cursor-pointer place-items-center rounded-full bg-black/50 text-white"
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <X className="size-5" strokeWidth={2} />
      </button>

      {showCamera && (
        <button
          type="button"
          onClick={flipCamera}
          aria-label="Переключить камеру"
          className="absolute left-4 z-20 grid size-11 cursor-pointer place-items-center rounded-full bg-black/50 text-white"
          style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <SwitchCamera className="size-5" strokeWidth={2} />
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void pickFile(e.target.files?.[0])}
      />

      {camError && !result && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-white/10 text-white">
            <CameraOff className="size-8" strokeWidth={1.5} />
          </span>
          <p className="max-w-[46ch] text-base leading-[1.6] text-white/85">
            {camError}. Загрузите фото из галереи — распознавание работает и по снимку.
          </p>
          {denied && (
            <div className="max-w-[46ch] rounded-md bg-white/10 p-4 text-left text-xs leading-[1.6] text-white/75">
              <p className="mb-2 font-semibold text-white">Как включить камеру</p>
              <p>
                <b>iPhone (Safari):</b> «Настройки» → Safari → «Камера» → «Разрешить», затем
                обновите страницу.
              </p>
              <p className="mt-1.5">
                <b>Android (Chrome):</b> значок замка в адресной строке → «Разрешения» → «Камера»
                → «Разрешить».
              </p>
              <p className="mt-1.5">
                <b>Компьютер:</b> значок камеры справа в адресной строке → «Всегда разрешать».
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void start()}
            className="min-h-[44px] cursor-pointer rounded-full border border-white/25 px-6 text-sm font-semibold text-white"
          >
            Повторить запрос доступа
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2} />
            ) : (
              <ImageUp className="size-4" strokeWidth={1.75} />
            )}
            {busy ? "Анализируем фото…" : "Загрузить фото из галереи"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] cursor-pointer text-xs text-white/60 underline underline-offset-4 hover:text-white"
          >
            Закрыть сканер
          </button>
        </div>
      )}

      {showCamera && (
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
          {/* Прицел с перекрестием */}
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
            <path
              d="M50 44v12M44 50h12"
              fill="none"
              stroke="#E52421"
              strokeOpacity="0.8"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {shake && (
            <div className="pointer-events-none absolute left-1/2 top-[18%] z-10 -translate-x-1/2 rounded-full bg-black/75 px-5 py-3 text-sm font-semibold text-white">
              Зафиксируйте камеру
            </div>
          )}

          {/* Сценарий 3.4: мусор, пальцы, темнота */}
          {result?.scenario === "invalid" && (
            <div className="absolute inset-x-4 top-[10%] z-10 rounded-md bg-primary p-4 text-primary-foreground">
              <p className="flex items-start gap-2 text-sm leading-[1.5]">
                <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
                <span>
                  Деталь не распознана. Протрите объектив, включите вспышку или положите деталь
                  на контрастный однотонный фон, убрав пальцы из кадра.
                </span>
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-3 flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-white/15 text-sm font-semibold"
              >
                <RefreshCw className="size-4" strokeWidth={2} />
                Повторить
              </button>
            </div>
          )}

          <div
            className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 p-8"
            style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
          >
            <p className="max-w-[42ch] text-center text-xs leading-[1.5] text-white/75">
              Поместите деталь в центр рамки. Желательно на светлый однотонный фон (лист бумаги).
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={capture}
                disabled={busy}
                className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
              >
                {busy && <Loader2 className="size-4 animate-spin" strokeWidth={2} />}
                {busy ? "Анализируем кадр…" : "Распознать деталь"}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-white/30 px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <ImageUp className="size-4" strokeWidth={1.75} />
                Фото из галереи
              </button>
              <p className="hidden w-full text-center text-xs text-white/60 lg:block">
                Или перетащите файл фотографии детали прямо в это окно
              </p>
            </div>
          </div>
        </>
      )}

      {/* Сценарии 3.1–3.3: шторка с результатом */}
      {result && result.scenario !== "invalid" && (
        <div
          data-bottom-sheet
          className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-card p-6 motion-safe:animate-[slide-in-bottom_0.28s_ease-out]"
          style={{
            paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
            ...(swipe.sheetStyle ?? {}),
          }}
        >
          {/* Шторку можно смахнуть вниз, не целясь в крестик */}
          <div className="sheet-grabber -mt-3 mb-1" aria-hidden {...swipe.handleProps} />

          {result.scenario === "exact" && (
            <>
              <h3 className="text-lg font-bold text-foreground">
                Мы распознали: {result.category}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Уверенность {Math.round(result.verdict.confidence * 100)}%. Выберите размер:
              </p>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="mt-4 w-full rounded-sm border border-border bg-background px-4 py-3 text-base text-foreground"
              >
                <option value="">Выберите размер</option>
                {result.variants.map((v) => (
                  <option key={v.sku} value={v.sku}>
                    {v.dims} · {v.name} · {formatPrice(v.price)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!size}
                onClick={() => {
                  addLine(size, 1);
                  toast.success(`${size} добавлен в корзину`);
                  onClose();
                }}
                className="mt-4 min-h-[44px] w-full cursor-pointer rounded-sm bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                В корзину
              </button>
            </>
          )}

          {result.scenario === "ambiguous" && (
            <>
              <h3 className="text-lg font-bold text-foreground">
                Найдено несколько совпадений. Выберите подходящий вариант:
              </h3>
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
                        {m.stock > 0
                          ? `${m.stock.toLocaleString("ru-RU")} шт на складе`
                          : "под заказ"}
                      </span>
                      <span className="mt-1 block text-sm font-bold tabular-nums text-foreground">
                        {formatPrice(m.price)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        addLine(m.sku, 1);
                        toast.success(`${m.sku} добавлен в корзину`);
                      }}
                      className="min-h-[44px] shrink-0 cursor-pointer rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      В корзину
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {result.scenario === "foreign" && (
            <div className="rounded-md border border-[#F59E0B] bg-[oklch(0.97_0.06_90)] p-5">
              <h3 className="text-lg font-bold text-[oklch(0.35_0.08_70)]">
                В базовом каталоге ALMAFORT такой детали нет
              </h3>
              <p className="mt-2 text-sm leading-[1.6] text-[oklch(0.4_0.06_70)]">
                Но мы можем изготовить её для вас! Прикрепите фото к заявке на реверс-инжиниринг
                или литьё под давлением.
              </p>
              <button
                type="button"
                onClick={() => setReverse(true)}
                className="mt-4 min-h-[44px] w-full cursor-pointer rounded-sm bg-primary py-3.5 text-sm font-semibold text-primary-foreground"
              >
                Отправить фото в отдел разработки
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={retry}
            className="mt-4 flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-[#D1D5DB] py-3 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            <RefreshCw className="size-4" strokeWidth={1.75} />
            Сканировать ещё раз
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 min-h-[44px] w-full cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Закрыть
          </button>
        </div>
      )}

      {reverse && (
        <QuoteRequestModal
          sku="REVERSE-ENG"
          name="Реверс-инжиниринг детали по фото"
          onClose={() => setReverse(false)}
        />
      )}
    </div>
  );
}
