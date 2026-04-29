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
  getAiAccountsInsight,
  getAiAccountsInsightCheckpoint,
  getAiLoansInsight,
  getAiLoansInsightCheckpoint,
  getAiTransactionsInsightCheckpoint,
  getAiTransactionsInsight,
  generateMonthlyHabitCoachingInsight,
  getStoredHabitInsight,
  isAiCoachingEnabled,
  saveHabitInsight,
} from "@/features/ai/server/service";
import { logAuditEvent } from "@/features/trust/server/audit";
import { trackUsageEvent } from "@/features/trust/server/usage-analytics";
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

const HABIT_INSIGHT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function getCooldownSecondsRemaining(generatedAtIso: string) {
  const generatedAtMs = new Date(generatedAtIso).getTime();
  if (!Number.isFinite(generatedAtMs)) return 0;
  const remainingMs = generatedAtMs + HABIT_INSIGHT_COOLDOWN_MS - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function formatCooldownRemaining(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.ceil((seconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, minutes)}m`;
}

function getDisabledDashboardInsight() {
  return {
    statement: "AI coaching is currently disabled in settings.",
    projectedImpact: "Enable AI coaching to view forecasts",
    confidence: "Disabled in settings",
    window: "Next 7 days",
    nextActionLabel: "Open settings",
    nextActionHref: "/settings",
    budgetStatusSummary: "AI coaching disabled",
    totalBudgets: 0,
    atRisk: 0,
    onTrack: 0,
    totalRemaining: 0,
  };
}

function getDisabledQuickCaptureDraft() {
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
    missing: ["intent", "amount", "description"] as Array<
      "amount" | "description" | "intent" | "account" | "sourceAccount" | "destinationAccount"
    >,
  };
}

function getDisabledAccountsInsight() {
  return {
    headline: "AI accounts watchdog",
    summary: "AI coaching is disabled in settings.",
    confidence: "Disabled in settings",
    recommendations: ["Enable AI coaching in Settings to see account guidance."],
    metrics: [],
  };
}

function getDisabledTransactionsInsight() {
  return {
    headline: "AI transaction intelligence",
    summary: "AI coaching is disabled in settings.",
    confidence: "Disabled in settings",
    metrics: [],
    recommendations: ["Enable AI coaching in Settings to see spending recommendations."],
  };
}

function getDisabledBudgetsInsight() {
  return {
    headline: "AI budget intelligence",
    summary: "AI coaching is disabled in settings.",
    confidence: "Disabled in settings",
    timeWindow: "Current budget cycle",
    likelyOvershootDate: null,
    recommendations: ["Enable AI coaching in Settings to restore budget insights."],
    metrics: [],
  };
}

function getDisabledLoansInsight() {
  return {
    headline: "AI loan coach",
    summary: "AI coaching is disabled in settings.",
    confidence: "Disabled in settings",
    recommendations: ["Enable AI coaching in Settings to restore repayment guidance."],
    metrics: [],
  };
}

async function logAiBlockedByPolicy(
  ctx: Parameters<typeof logAuditEvent>[0],
  route: string
) {
  await logAuditEvent(ctx, {
    action: "ai.request_blocked_by_policy",
    entityType: "ai",
    summary: `Blocked AI request for "${route}" because AI coaching is disabled`,
    metadata: {
      route,
      reason: "allowAiCoaching=false",
    },
  });
}

export const aiRouter = createTRPCRouter({
  dashboardInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    await trackUsageEvent(ctx, {
      eventName: "ai.dashboard_insight_requested",
      surface: "ai",
      metadata: { route: "dashboardInsight" },
    });

    const aiEnabled = await isAiCoachingEnabled(ctx);
    if (!aiEnabled) {
      await logAiBlockedByPolicy(ctx, "dashboardInsight");
      return getDisabledDashboardInsight();
    }

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
      await trackUsageEvent(ctx, {
        eventName: "ai.quick_capture_draft_requested",
        surface: "ai",
        metadata: { route: "quickCaptureDraft" },
      });

      const aiEnabled = await isAiCoachingEnabled(ctx);
      if (!aiEnabled) {
        await logAiBlockedByPolicy(ctx, "quickCaptureDraft");
        return getDisabledQuickCaptureDraft();
      }

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
        return getDisabledQuickCaptureDraft();
      }
    }),
  accountsInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    await trackUsageEvent(ctx, {
      eventName: "ai.accounts_insight_requested",
      surface: "ai",
      metadata: { route: "accountsInsight" },
    });

    const aiEnabled = await isAiCoachingEnabled(ctx);
    if (!aiEnabled) {
      await logAiBlockedByPolicy(ctx, "accountsInsight");
      return getDisabledAccountsInsight();
    }

    try {
      const checkpoint = await getAiAccountsInsightCheckpoint(ctx);
      return getOrComputeInsight({
        userId: ctx.userId,
        surface: "accounts",
        checkpoint,
        cooldownMs: 45_000,
        compute: () => getAiAccountsInsight(ctx),
      });
    } catch (error) {
      console.error("[ai.accountsInsight] failed", error);
      return {
        headline: "AI accounts watchdog",
        summary: "Account pressure signals will appear here.",
        confidence: "Initial estimate",
        recommendations: ["No recommendation yet."],
        metrics: [],
      };
    }
  }),
  loansInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    await trackUsageEvent(ctx, {
      eventName: "ai.loans_insight_requested",
      surface: "ai",
      metadata: { route: "loansInsight" },
    });

    const aiEnabled = await isAiCoachingEnabled(ctx);
    if (!aiEnabled) {
      await logAiBlockedByPolicy(ctx, "loansInsight");
      return getDisabledLoansInsight();
    }

    try {
      const checkpoint = await getAiLoansInsightCheckpoint(ctx);
      return getOrComputeInsight({
        userId: ctx.userId,
        surface: "loans",
        checkpoint,
        cooldownMs: 45_000,
        compute: () => getAiLoansInsight(ctx),
      });
    } catch (error) {
      console.error("[ai.loansInsight] failed", error);
      return {
        headline: "AI loan coach",
        summary: "Repayment pacing and due-date guidance will appear here.",
        confidence: "Initial estimate",
        recommendations: ["No recommendation yet."],
        metrics: [],
      };
    }
  }),
  transactionsInsight: aiRateLimitedProcedure.query(async ({ ctx }) => {
    await trackUsageEvent(ctx, {
      eventName: "ai.transactions_insight_requested",
      surface: "ai",
      metadata: { route: "transactionsInsight" },
    });

    const aiEnabled = await isAiCoachingEnabled(ctx);
    if (!aiEnabled) {
      await logAiBlockedByPolicy(ctx, "transactionsInsight");
      return getDisabledTransactionsInsight();
    }

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
    await trackUsageEvent(ctx, {
      eventName: "ai.budgets_insight_requested",
      surface: "ai",
      metadata: { route: "budgetsInsight" },
    });

    const aiEnabled = await isAiCoachingEnabled(ctx);
    if (!aiEnabled) {
      await logAiBlockedByPolicy(ctx, "budgetsInsight");
      return getDisabledBudgetsInsight();
    }

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
  latestHabitInsight: protectedProcedure.query(async ({ ctx }) => {
    await trackUsageEvent(ctx, {
      eventName: "ai.latest_habit_insight_requested",
      surface: "ai",
      metadata: { route: "latestHabitInsight" },
    });

    const aiEnabled = await isAiCoachingEnabled(ctx);
    if (!aiEnabled) {
      await logAiBlockedByPolicy(ctx, "latestHabitInsight");
      return null;
    }
    return getStoredHabitInsight(ctx);
  }),
  generateHabitInsight: aiRateLimitedProcedure.mutation(async ({ ctx }) => {
    await trackUsageEvent(ctx, {
      eventName: "ai.generate_habit_insight_requested",
      surface: "ai",
      metadata: { route: "generateHabitInsight" },
      auditOnDrop: true,
    });

    const aiEnabled = await isAiCoachingEnabled(ctx);
    if (!aiEnabled) {
      await logAiBlockedByPolicy(ctx, "generateHabitInsight");
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "AI coaching is disabled in Settings.",
      });
    }

    try {
      const latest = await getStoredHabitInsight(ctx);
      if (latest) {
        const remainingSeconds = getCooldownSecondsRemaining(latest.generatedAt);
        if (remainingSeconds > 0) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `You can generate a new Veyra insight in ${formatCooldownRemaining(remainingSeconds)}.`,
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
