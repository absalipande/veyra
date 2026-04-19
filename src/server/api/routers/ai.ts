import { TRPCError } from "@trpc/server";

import { getOrComputeInsight } from "@/features/ai/server/insight-cache";
import { consumeAiRateLimit } from "@/features/ai/server/rate-limit";
import { getQuickCaptureDraftSchema } from "@/features/ai/server/schema";
import {
  getAiBudgetsInsightCheckpoint,
  getAiBudgetsInsight,
  getAiDashboardInsightCheckpoint,
  getAiDashboardInsight,
  getAiQuickCaptureCheckpoint,
  getAiQuickCaptureDraft,
  getAiTransactionsInsightCheckpoint,
  getAiTransactionsInsight,
} from "@/features/ai/server/service";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const aiRateLimitedProcedure = protectedProcedure.use(({ ctx, path, next }) => {
  const limiter = consumeAiRateLimit({
    userId: ctx.userId,
    routeKey: `ai:${path}`,
    burstLimit: 12,
    burstWindowMs: 60_000,
    dailyLimit: 240,
  });

  if (!limiter.ok) {
    console.warn("[ai-rate-limit]", {
      userId: ctx.userId,
      path,
      reason: limiter.reason,
      retryAfterSeconds: limiter.retryAfterSeconds,
    });

    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `AI request limit reached. Try again in ${limiter.retryAfterSeconds}s.`,
    });
  }

  return next();
});

export const aiRouter = createTRPCRouter({
  dashboardInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    const checkpoint = await getAiDashboardInsightCheckpoint(ctx);
    return getOrComputeInsight({
      userId: ctx.userId,
      surface: "dashboard",
      checkpoint,
      cooldownMs: 45_000,
      compute: () => getAiDashboardInsight(ctx),
    });
  }),
  quickCaptureDraft: aiRateLimitedProcedure
    .input(getQuickCaptureDraftSchema)
    .query(async ({ ctx, input }) => {
      const checkpoint = await getAiQuickCaptureCheckpoint(ctx, input);
      return getOrComputeInsight({
        userId: ctx.userId,
        surface: "quick-capture",
        checkpoint,
        cooldownMs: 15_000,
        compute: () => getAiQuickCaptureDraft(ctx, input),
      });
    }),
  transactionsInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    const checkpoint = await getAiTransactionsInsightCheckpoint(ctx);
    return getOrComputeInsight({
      userId: ctx.userId,
      surface: "transactions",
      checkpoint,
      cooldownMs: 45_000,
      compute: () => getAiTransactionsInsight(ctx),
    });
  }),
  budgetsInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    const checkpoint = await getAiBudgetsInsightCheckpoint(ctx);
    return getOrComputeInsight({
      userId: ctx.userId,
      surface: "budgets",
      checkpoint,
      cooldownMs: 45_000,
      compute: () => getAiBudgetsInsight(ctx),
    });
  }),
});
