import { TRPCError } from "@trpc/server";

import { consumeAiRateLimit } from "@/features/ai/server/rate-limit";
import { getQuickCaptureDraftSchema } from "@/features/ai/server/schema";
import {
  getAiBudgetsInsight,
  getAiDashboardInsight,
  getAiQuickCaptureDraft,
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
  dashboardInsight: aiRateLimitedProcedure.query(({ ctx }) => getAiDashboardInsight(ctx)),
  quickCaptureDraft: aiRateLimitedProcedure
    .input(getQuickCaptureDraftSchema)
    .query(({ ctx, input }) => getAiQuickCaptureDraft(ctx, input)),
  transactionsInsight: aiRateLimitedProcedure.query(({ ctx }) => getAiTransactionsInsight(ctx)),
  budgetsInsight: aiRateLimitedProcedure.query(({ ctx }) => getAiBudgetsInsight(ctx)),
});

