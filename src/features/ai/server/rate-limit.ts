type LimitBucket = {
  burstHits: number[];
  dailyHits: number[];
};

type LimitResult =
  | {
      ok: true;
      remainingBurst: number;
      remainingDaily: number;
    }
  | {
      ok: false;
      reason: "burst" | "daily";
      retryAfterSeconds: number;
      remainingBurst: number;
      remainingDaily: number;
    };

type ConsumeAiRateLimitInput = {
  userId: string;
  routeKey: string;
  burstLimit: number;
  burstWindowMs: number;
  dailyLimit: number;
  dailyWindowMs?: number;
  nowMs?: number;
};

const globalLimiterStore = globalThis as typeof globalThis & {
  __veyraAiRateLimiter?: Map<string, LimitBucket>;
};

const limiterStore =
  globalLimiterStore.__veyraAiRateLimiter ?? (globalLimiterStore.__veyraAiRateLimiter = new Map());

function pruneWindow(timestamps: number[], thresholdMs: number) {
  const next = timestamps.filter((stamp) => stamp >= thresholdMs);
  timestamps.splice(0, timestamps.length, ...next);
}

function getOrCreateBucket(key: string): LimitBucket {
  const existing = limiterStore.get(key);
  if (existing) return existing;

  const created: LimitBucket = {
    burstHits: [],
    dailyHits: [],
  };
  limiterStore.set(key, created);
  return created;
}

function secondsUntilWindowReset(hits: number[], windowMs: number, nowMs: number) {
  if (hits.length === 0) return Math.ceil(windowMs / 1000);
  const oldestInWindow = hits[0] ?? nowMs;
  return Math.max(1, Math.ceil((oldestInWindow + windowMs - nowMs) / 1000));
}

export function consumeAiRateLimit(input: ConsumeAiRateLimitInput): LimitResult {
  const nowMs = input.nowMs ?? Date.now();
  const dailyWindowMs = input.dailyWindowMs ?? 24 * 60 * 60 * 1000;
  const key = `${input.routeKey}:${input.userId}`;
  const bucket = getOrCreateBucket(key);

  pruneWindow(bucket.burstHits, nowMs - input.burstWindowMs);
  pruneWindow(bucket.dailyHits, nowMs - dailyWindowMs);

  if (bucket.burstHits.length >= input.burstLimit) {
    return {
      ok: false,
      reason: "burst",
      retryAfterSeconds: secondsUntilWindowReset(bucket.burstHits, input.burstWindowMs, nowMs),
      remainingBurst: 0,
      remainingDaily: Math.max(0, input.dailyLimit - bucket.dailyHits.length),
    };
  }

  if (bucket.dailyHits.length >= input.dailyLimit) {
    return {
      ok: false,
      reason: "daily",
      retryAfterSeconds: secondsUntilWindowReset(bucket.dailyHits, dailyWindowMs, nowMs),
      remainingBurst: Math.max(0, input.burstLimit - bucket.burstHits.length),
      remainingDaily: 0,
    };
  }

  bucket.burstHits.push(nowMs);
  bucket.dailyHits.push(nowMs);

  return {
    ok: true,
    remainingBurst: Math.max(0, input.burstLimit - bucket.burstHits.length),
    remainingDaily: Math.max(0, input.dailyLimit - bucket.dailyHits.length),
  };
}

