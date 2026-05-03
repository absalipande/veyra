import { TRPCError } from "@trpc/server";

import { consumeAiRateLimit } from "@/features/ai/server/rate-limit";
import {
  askAssistantSchema,
  deleteAssistantMemorySchema,
  rememberAssistantMemorySchema,
  rememberAssistantSessionSchema,
} from "@/features/assistant/server/schema";
import {
  deleteAllAssistantMemories,
  deleteAssistantMemory,
  listAssistantMemories,
  rememberAssistantMemory,
  rememberAssistantSession,
} from "@/features/assistant/server/memory";
import { askAssistant, detectAssistantIntent } from "@/features/assistant/server/service";
import { logAuditEvent } from "@/features/trust/server/audit";
import { trackUsageEvent } from "@/features/trust/server/usage-analytics";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const assistantRateLimitedProcedure = protectedProcedure.use(({ ctx, path, next }) => {
  const limiter = consumeAiRateLimit({
    userId: ctx.userId,
    routeKey: `assistant:${path}`,
    burstLimit: process.env.NODE_ENV === "production" ? 8 : 30,
    burstWindowMs: 60_000,
    dailyLimit: process.env.NODE_ENV === "production" ? 60 : 240,
  });

  if (!limiter.ok) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        limiter.reason === "daily"
          ? "Ask Veyra has reached today's limit. Try again tomorrow."
          : `Ask Veyra is cooling down. Try again in ${limiter.retryAfterSeconds}s.`,
    });
  }

  return next();
});

export const assistantRouter = createTRPCRouter({
  memories: protectedProcedure.query(({ ctx }) => listAssistantMemories(ctx)),
  remember: protectedProcedure
    .input(rememberAssistantMemorySchema)
    .mutation(({ ctx, input }) => rememberAssistantMemory(ctx, input)),
  rememberSession: protectedProcedure
    .input(rememberAssistantSessionSchema)
    .mutation(({ ctx, input }) => rememberAssistantSession(ctx, input)),
  deleteMemory: protectedProcedure
    .input(deleteAssistantMemorySchema)
    .mutation(({ ctx, input }) => deleteAssistantMemory(ctx, input.id)),
  clearMemories: protectedProcedure.mutation(({ ctx }) => deleteAllAssistantMemories(ctx)),
  ask: assistantRateLimitedProcedure.input(askAssistantSchema).mutation(async ({ ctx, input }) => {
    const intent = detectAssistantIntent(input.message);
    await trackUsageEvent(ctx, {
      eventName: "assistant.ask_requested",
      surface: "assistant",
      metadata: { route: "ask", intent },
    });

    try {
      return await askAssistant(ctx, input);
    } catch (error) {
      if (error instanceof TRPCError) {
        if (error.code === "FORBIDDEN") {
          await logAuditEvent(ctx, {
            action: "assistant.request_blocked_by_policy",
            entityType: "assistant",
            summary: "Blocked Ask Veyra request because AI coaching is disabled",
            metadata: { route: "ask", reason: "allowAiCoaching=false" },
          });
        }
        throw error;
      }

      console.error("[assistant.ask] failed", error);
      await logAuditEvent(ctx, {
        action: "assistant.provider_failed",
        entityType: "assistant",
        summary: "Ask Veyra provider request failed",
        metadata: {
          route: "ask",
          intent,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Ask Veyra is temporarily unavailable.",
      });
    }
  }),
});
