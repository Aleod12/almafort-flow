import { useCallback, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, FileUp, Loader2, X } from "lucide-react";

const BASES = ["Чертеж / 3D-модель", "Физический образец", "Только идея/ТЗ"] as const;

const MAX_SIZE = 50 * 1024 * 1024;

const schema = z.object({
  base: z.enum(BASES, { required_error: "Выберите исходную базу" }),
  volume: z
    .string()
    .trim()
    .min(1, "Укажите планируемый тираж")
    .refine((v) => Number(v.replace(/\s/g, "")) > 0, "Введите корректный тираж"),
  name: z.string().trim().min(2, "Введите имя").max(80),
  phone: z
    .string()
    .regex(/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/, "Введите корректный номер"),
  email: z.string().trim().email("Введите корректный e-mail").max(255),
});

type FormValues = z.infer<typeof schema>;

function formatThousands(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatPhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (!d.startsWith("7")) d = "7" + d;
  d = d.slice(0, 11);
  const p = d.slice(1);
  let out = "+7";
  if (p.length) out += ` (${p.slice(0, 3)}`;
  if (p.length >= 3) out += ")";
  if (p.length > 3) out += ` ${p.slice(3, 6)}`;
  if (p.length > 6) out += `-${p.slice(6, 8)}`;
  if (p.length > 8) out += `-${p.slice(8, 10)}`;
  return out;
}

export function EngineeringQuiz() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
  });

  const base = watch("base");
  const volume = watch("volume");
  const phone = watch("phone");

  const step = useMemo(() => {
    if (!base) return 1;
    if (!volume) return 2;
    return 3;
  }, [base, volume]);

  const canSubmit =
    status === "idle" &&
    Boolean(volume && Number(String(volume).replace(/\s/g, "")) > 0) &&
    /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(phone ?? "");

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    const tooBig = list.find((f) => f.size > MAX_SIZE);
    if (tooBig) {
      setFileError(`Файл «${tooBig.name}» больше 50 МБ`);
      return;
    }
    setFileError(null);
    setFiles((prev) => [...prev, ...list]);
  }, []);

  const onSubmit = handleSubmit(async () => {
    setStatus("loading");
    // TODO(backend): запросить pre-signed URL, залить файлы в S3, отправить вебхук в CRM
    await new Promise((r) => setTimeout(r, 1400));
    setStatus("success");
  });

  return (
    <div className="mt-16 overflow-hidden rounded-lg bg-background shadow-[0_20px_40px_oklch(0_0_0/0.08)]">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        <form onSubmit={onSubmit} noValidate className="lg:col-span-7">
          <div className="h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>

          <div className="p-8 lg:p-10">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Шаг {step} из 3
            </span>

            <fieldset className="mt-6">
              <legend className="text-base font-semibold text-foreground">
                Какая исходная база у вас есть?
              </legend>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {BASES.map((b) => {
                  const active = base === b;
                  return (
                    <button
                      type="button"
                      key={b}
                      onClick={() =>
                        setValue("base", b, { shouldValidate: true, shouldDirty: true })
                      }
                      className={`cursor-pointer rounded-md border-2 px-4 py-5 text-center text-sm font-medium transition-colors duration-200 ${
                        active
                          ? "border-primary bg-[color-mix(in_oklab,var(--primary)_6%,transparent)] font-semibold text-foreground"
                          : "border-[#D1D5DB] text-muted-foreground hover:border-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-foreground"
                      }`}

                      aria-pressed={active}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
              {errors.base && (
                <p className="mt-2 text-xs text-primary">{errors.base.message}</p>
              )}
            </fieldset>

            <div className="mt-10">
              <label htmlFor="volume" className="text-base font-semibold text-foreground">
                Планируемый тираж изделия?
              </label>
              <input
                id="volume"
                inputMode="numeric"
                placeholder="Например: 50 000 шт"
                {...register("volume")}
                onChange={(e) =>
                  setValue("volume", formatThousands(e.target.value), {
                    shouldValidate: true,
                  })
                }
                className="mt-4 h-12 w-full rounded-md border border-border bg-background px-4 text-base tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
              />
              {errors.volume && (
                <p className="mt-2 text-xs text-primary">{errors.volume.message}</p>
              )}
            </div>

            <div className="mt-10">
              <p className="text-base font-semibold text-foreground">Файлы и контакты</p>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? "border-primary bg-[color-mix(in_oklab,var(--primary)_4%,transparent)]" : "border-[#9CA3AF] bg-surface hover:bg-[#F3F4F6]"
                }`}
              >
                <FileUp className="size-6 text-muted-foreground" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium text-foreground">
                  Перетащите файлы сюда (.STL, .STEP, .PDF, .JPG)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">До 50 МБ на файл</p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".stl,.step,.stp,.pdf,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>
              {fileError && <p className="mt-2 text-xs text-primary">{fileError}</p>}
              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs text-foreground"
                    >
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        aria-label={`Удалить ${f.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles((prev) => prev.filter((_, idx) => idx !== i));
                        }}
                        className="ml-3 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <input
                    placeholder="Имя"
                    {...register("name")}
                    className="h-12 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors focus:border-foreground"
                  />
                  {errors.name && (
                    <p className="mt-2 text-xs text-primary">{errors.name.message}</p>
                  )}
                </div>
                <div>
                  <input
                    placeholder="+7 (999) 999-99-99"
                    inputMode="tel"
                    {...register("phone")}
                    onChange={(e) =>
                      setValue("phone", formatPhone(e.target.value), {
                        shouldValidate: true,
                      })
                    }
                    className="h-12 w-full rounded-md border border-border bg-background px-4 text-sm tabular-nums text-foreground outline-none transition-colors focus:border-foreground"
                  />
                  {errors.phone && (
                    <p className="mt-2 text-xs text-primary">{errors.phone.message}</p>
                  )}
                </div>
                <div>
                  <input
                    placeholder="E-mail"
                    inputMode="email"
                    {...register("email")}
                    className="h-12 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors focus:border-foreground"
                  />
                  {errors.email && (
                    <p className="mt-2 text-xs text-primary">{errors.email.message}</p>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit && status !== "success"}
              className={`mt-8 flex h-14 w-full items-center justify-center rounded-md text-base font-semibold transition-colors ${
                status === "success"
                  ? "bg-[oklch(0.696_0.17_162.5)] text-primary-foreground"
                  : canSubmit
                    ? "bg-primary text-primary-foreground hover:brightness-95"
                    : "cursor-not-allowed bg-disabled text-disabled-foreground"
              }`}
            >
              {status === "loading" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : status === "success" ? (
                <span className="flex items-center gap-2">
                  <Check className="size-5" /> Проект успешно отправлен
                </span>
              ) : (
                "Отправить проект на расчет"
              )}
            </button>
          </div>
        </form>

        <div className="relative min-h-[320px] bg-placeholder lg:col-span-5 lg:rounded-r-lg">
          <div className="absolute inset-x-6 bottom-6 rounded-md bg-background/85 p-6 backdrop-blur-lg lg:inset-x-8 lg:bottom-8">
            <p className="text-sm leading-[1.6] text-foreground">
              Инженерный отдел проанализирует допуски, геометрию и пришлет детальную смету
              на оснастку и серийное литье в течение 48 часов.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
