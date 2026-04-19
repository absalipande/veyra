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
  generateMonthlyHabitCoachingInsight,
  getStoredHabitInsight,
  saveHabitInsight,
} from "@/features/ai/server/service";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const aiRateLimitedProcedure = protectedProcedure.use(({ ctx, path, next }) => {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

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

const HABIT_INSIGHT_COOLDOWN_MS = 25 * 60 * 1000;

function getCooldownSecondsRemaining(generatedAtIso: string) {
  const generatedAtMs = new Date(generatedAtIso).getTime();
  if (!Number.isFinite(generatedAtMs)) return 0;
  const remainingMs = generatedAtMs + HABIT_INSIGHT_COOLDOWN_MS - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export const aiRouter = createTRPCRouter({
  dashboardInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    try {
      const checkpoint = await getAiDashboardInsightCheckpoint(ctx);
      return getOrComputeInsight({
        userId: ctx.userId,
        surface: "dashboard",
        checkpoint,
        cooldownMs: 45_000,
        compute: () => getAiDashboardInsight(ctx),
      });
    } catch (error) {
      console.error("[ai.dashboardInsight] failed", error);
      return {
        statement: "AI insights are temporarily unavailable.",
        projectedImpact: "No projection available",
        confidence: "Initial estimate",
        window: "Next 7 days",
        nextActionLabel: "Review budgets",
        nextActionHref: "/budgets",
        budgetStatusSummary: "Try again shortly",
        totalBudgets: 0,
        atRisk: 0,
        onTrack: 0,
        totalRemaining: 0,
      };
    }
  }),
  quickCaptureDraft: aiRateLimitedProcedure
    .input(getQuickCaptureDraftSchema)
    .query(async ({ ctx, input }) => {
      try {
        const checkpoint = await getAiQuickCaptureCheckpoint(ctx, input);
        return getOrComputeInsight({
          userId: ctx.userId,
          surface: "quick-capture",
          checkpoint,
          cooldownMs: 15_000,
          compute: () => getAiQuickCaptureDraft(ctx, input),
        });
      } catch (error) {
        console.error("[ai.quickCaptureDraft] failed", error);
        const fallbackMissing: Array<
          "amount" | "description" | "intent" | "account" | "sourceAccount" | "destinationAccount"
        > = ["intent", "amount", "description"];
        return {
          intent: null,
          amountMiliunits: null,
          description: null,
          dateValue: new Date().toISOString().slice(0, 10),
          sourceAccountId: null,
          destinationAccountId: null,
          categoryId: null,
          budgetId: null,
          confidence: "low" as const,
          missing: fallbackMissing,
        };
      }
    }),
  transactionsInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    try {
      const checkpoint = await getAiTransactionsInsightCheckpoint(ctx);
      return getOrComputeInsight({
        userId: ctx.userId,
        surface: "transactions",
        checkpoint,
        cooldownMs: 45_000,
        compute: () => getAiTransactionsInsight(ctx),
      });
    } catch (error) {
      console.error("[ai.transactionsInsight] failed", error);
      return {
        headline: "AI transaction intelligence",
        summary: "Insights are loading. Trends and category shifts will appear here.",
        confidence: "Initial estimate",
        metrics: [],
        recommendations: ["No recommendation yet."],
      };
    }
  }),
  budgetsInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    try {
      const checkpoint = await getAiBudgetsInsightCheckpoint(ctx);
      return getOrComputeInsight({
        userId: ctx.userId,
        surface: "budgets",
        checkpoint,
        cooldownMs: 45_000,
        compute: () => getAiBudgetsInsight(ctx),
      });
    } catch (error) {
      console.error("[ai.budgetsInsight] failed", error);
      return {
        headline: "AI budget intelligence",
        summary: "Cycle pacing and overshoot guidance will appear here.",
        confidence: "Initial estimate",
        timeWindow: "Current budget cycle",
        likelyOvershootDate: null,
        recommendations: ["No recommendation yet."],
        metrics: [],
      };
    }
  }),
  latestHabitInsight: protectedProcedure.query(({ ctx }) => {
    return getStoredHabitInsight(ctx);
  }),
  generateHabitInsight: aiRateLimitedProcedure.mutation(async ({ ctx }) => {
    try {
      const latest = await getStoredHabitInsight(ctx);
      if (latest) {
        const remainingSeconds = getCooldownSecondsRemaining(latest.generatedAt);
        if (remainingSeconds > 0) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `You can generate a new insight in ${remainingSeconds}s.`,
          });
        }
      }

      const generated = await generateMonthlyHabitCoachingInsight(ctx);
      await saveHabitInsight(ctx, generated);
      return generated;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("[ai.generateHabitInsight] failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not generate habit insight right now.",
      });
    }
  }),
});
