import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";

import { assistantMemories, userPreferences } from "@/db/schema";
import type { RememberAssistantMemoryInput } from "@/features/assistant/server/schema";
import type { AssistantIntent } from "@/features/assistant/server/safety";
import { logAuditEvent } from "@/features/trust/server/audit";
import type { TRPCContext } from "@/server/api/trpc";

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }

  return userId;
}

function memoryKindForIntent(intent: AssistantIntent) {
  switch (intent) {
    case "budgets":
      return "budget_pressure" as const;
    case "spending":
      return "recurring_pattern" as const;
    case "cashflow":
    case "bills":
    case "loans":
    case "accounts":
    case "general":
    default:
      return "note" as const;
  }
}

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength - 1).trim()}…`;
}

function buildMemorySummary(input: RememberAssistantMemoryInput) {
  const answerLead = input.answer
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .find(Boolean);

  const source = answerLead ?? input.answer;
  return compactText(`${input.intent}: ${source}`, 280);
}

export async function isAssistantMemoryEnabled(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const preferences = await ctx.db.query.userPreferences.findFirst({
    where: eq(userPreferences.clerkUserId, userId),
    columns: { allowAssistantMemory: true },
  });

  return preferences?.allowAssistantMemory ?? false;
}

export async function listAssistantMemories(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  return ctx.db.query.assistantMemories.findMany({
    where: eq(assistantMemories.clerkUserId, userId),
    orderBy: [desc(assistantMemories.updatedAt)],
    limit: 30,
  });
}

export async function rememberAssistantMemory(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: RememberAssistantMemoryInput
) {
  const userId = assertUserId(ctx.userId);
  const enabled = await isAssistantMemoryEnabled(ctx);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Assistant memory is disabled in Settings.",
    });
  }

  const now = new Date();
  const [created] = await ctx.db
    .insert(assistantMemories)
    .values({
      id: crypto.randomUUID(),
      clerkUserId: userId,
      kind: memoryKindForIntent(input.intent),
      summary: buildMemorySummary(input),
      source: "user_confirmed",
      metadata: JSON.stringify({
        intent: input.intent,
        dataBasis: input.dataBasis,
        sourceQuestion: compactText(input.message, 180),
      }),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await ctx.db
    .update(userPreferences)
    .set({ assistantMemoryUpdatedAt: now, updatedAt: now })
    .where(eq(userPreferences.clerkUserId, userId));

  await logAuditEvent(ctx, {
    action: "assistant.memory_created",
    entityType: "assistant_memory",
    entityId: created?.id ?? null,
    summary: "Saved assistant memory summary",
    metadata: {
      kind: created?.kind ?? memoryKindForIntent(input.intent),
      intent: input.intent,
    },
  });

  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not save assistant memory.",
    });
  }

  return created;
}

export async function deleteAssistantMemory(
  ctx: Pick<TRPCContext, "db" | "userId">,
  id: string
) {
  const userId = assertUserId(ctx.userId);
  const [deleted] = await ctx.db
    .delete(assistantMemories)
    .where(and(eq(assistantMemories.id, id), eq(assistantMemories.clerkUserId, userId)))
    .returning();

  if (!deleted) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Assistant memory not found.",
    });
  }

  const now = new Date();
  await ctx.db
    .update(userPreferences)
    .set({ assistantMemoryUpdatedAt: now, updatedAt: now })
    .where(eq(userPreferences.clerkUserId, userId));

  await logAuditEvent(ctx, {
    action: "assistant.memory_deleted",
    entityType: "assistant_memory",
    entityId: deleted.id,
    summary: "Deleted assistant memory summary",
    metadata: {
      kind: deleted.kind,
    },
  });

  return { success: true };
}

export async function deleteAllAssistantMemories(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const deleted = await ctx.db
    .delete(assistantMemories)
    .where(eq(assistantMemories.clerkUserId, userId))
    .returning({ id: assistantMemories.id });

  const now = new Date();
  await ctx.db
    .update(userPreferences)
    .set({ assistantMemoryUpdatedAt: now, updatedAt: now })
    .where(eq(userPreferences.clerkUserId, userId));

  await logAuditEvent(ctx, {
    action: "assistant.memory_cleared",
    entityType: "assistant_memory",
    summary: "Deleted all assistant memory summaries",
    metadata: {
      deletedCount: deleted.length,
    },
  });

  return { success: true, deletedCount: deleted.length };
}
