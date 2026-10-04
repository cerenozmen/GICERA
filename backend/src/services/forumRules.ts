export const FORUM_CATEGORIES = ["Cilt bakımı", "İçerikler", "Rutin", "Ürün önerisi"] as const;
export type ForumCategory = (typeof FORUM_CATEGORIES)[number];

/** Device ids are server-issued UUIDs (POST /api/forum/devices). */
export const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const UUID = DEVICE_ID;

/**
 * Search text safe inside a PostgREST `or=(...ilike...)` filter: its separators (`,` `(` `)`),
 * LIKE wildcards, quotes and backslashes are dropped, so a query can't widen or break the filter.
 */
export function sanitizeSearch(query: string): string {
  return query.replace(/[,()%_*\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Supabase returns an embedded `relation(count)` as `[{ count }]`. */
export function embeddedCount(value: unknown): number {
  return Array.isArray(value) && typeof value[0]?.count === "number" ? value[0].count : 0;
}

/**
 * At most `limit` writes per device in a sliding `windowMs` (in memory: a restart forgets it, and
 * each server instance counts on its own). Enough to stop a stuck loop or a flood from one phone.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const time = now();
    const recent = (hits.get(key) ?? []).filter((t) => time - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(time);
    hits.set(key, recent);
    if (hits.size > 10_000) {
      for (const [k, times] of hits) if (times.every((t) => time - t >= windowMs)) hits.delete(k);
    }
    return true;
  };
}
