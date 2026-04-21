type InsightCacheEntry = {
  checkpoint: string;
  value: unknown;
  updatedAtMs: number;
};

type GetOrComputeInsightInput<T> = {
  userId: string;
  surface: "dashboard" | "accounts" | "transactions" | "budgets" | "quick-capture";
  checkpoint: string;
  cooldownMs: number;
  compute: () => Promise<T> | T;
};

const globalInsightCache = globalThis as typeof globalThis & {
  __veyraAiInsightCache?: Map<string, InsightCacheEntry>;
};

const insightCache =
  globalInsightCache.__veyraAiInsightCache ??
  (globalInsightCache.__veyraAiInsightCache = new Map());

function pruneCache(nowMs: number) {
  if (insightCache.size < 2000) return;

  for (const [key, entry] of insightCache.entries()) {
    if (nowMs - entry.updatedAtMs > 24 * 60 * 60 * 1000) {
      insightCache.delete(key);
    }
  }
}

export async function getOrComputeInsight<T>(input: GetOrComputeInsightInput<T>): Promise<T> {
  const nowMs = Date.now();
  pruneCache(nowMs);

  const key = `${input.surface}:${input.userId}`;
  const existing = insightCache.get(key);

  if (existing && existing.checkpoint === input.checkpoint) {
    return existing.value as T;
  }

  if (existing && nowMs - existing.updatedAtMs < input.cooldownMs) {
    return existing.value as T;
  }

  const computed = await input.compute();
  insightCache.set(key, {
    checkpoint: input.checkpoint,
    value: computed,
    updatedAtMs: nowMs,
  });

  return computed;
}
