/**
 * Антипарсинг: скользящее окно по IP для публичных API.
 * Хранилище в памяти воркера — дешёвая защита от массового съёма оптовых цен
 * и от перебора форм. Для распределённой блокировки нужен внешний счётчик.
 */
type Bucket = { hits: number[]; blockedUntil: number };

const buckets = new Map<string, Bucket>();

export function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * @returns Response 429, если лимит превышен, иначе null.
 */
export function rateLimit(
  request: Request,
  bucket: string,
  { limit = 60, windowMs = 60_000, blockMs = 60_000 } = {},
): Response | null {
  const key = `${bucket}:${clientIp(request)}`;
  const now = Date.now();
  const entry = buckets.get(key) ?? { hits: [], blockedUntil: 0 };

  if (entry.blockedUntil > now) return tooMany(entry.blockedUntil - now);

  entry.hits = entry.hits.filter((t) => now - t < windowMs);
  entry.hits.push(now);

  if (entry.hits.length > limit) {
    entry.blockedUntil = now + blockMs;
    entry.hits = [];
    buckets.set(key, entry);
    return tooMany(blockMs);
  }

  buckets.set(key, entry);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.blockedUntil < now && (v.hits.at(-1) ?? 0) < now - windowMs) buckets.delete(k);
    }
  }
  return null;
}

function tooMany(retryMs: number): Response {
  const retryAfter = Math.max(1, Math.ceil(retryMs / 1000));
  return Response.json(
    { error: "Слишком много запросов. Повторите позже." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
