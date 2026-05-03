import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";

import { assistantMemories, userPreferences } from "@/db/schema";
import {
  type RememberAssistantMemoryInput,
  type RememberAssistantSessionInput,
} from "@/features/assistant/server/schema";
import { generateAssistantResponse } from "@/features/assistant/server/providers";
import { type AssistantIntent, detectAssistantIntent } from "@/features/assistant/server/safety";
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

async function generateSessionMemorySummary(messages: RememberAssistantSessionInput["messages"]) {
  const response = await generateAssistantResponse([
    {
      role: "system",
      content:
        "You create compact long-term memory hints for a personal finance assistant. " +
        "Summarize only durable context from this chat session: preferences, recurring concerns, constraints, habits, or active financial focus. " +
        "Do not repeat pleasantries. Do not mention that this came from a chat. " +
        "If there is nothing worth remembering long-term, reply with exactly SKIP. " +
        "Otherwise reply with one plain sentence under 220 characters.",
    },
    {
      role: "user",
      content: JSON.stringify({
        sessionMessages: messages,
      }),
    },
  ]);

  const normalized = response.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.toUpperCase() === "SKIP") return null;
  return compactText(normalized, 280);
}

async function persistAssistantMemory(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: {
    id?: string;
    kind: ReturnType<typeof memoryKindForIntent>;
    summary: string;
    source: string;
    metadata?: Record<string, unknown>;
  }
) {
  const userId = assertUserId(ctx.userId);
  const now = new Date();

  if (input.id) {
    const [updated] = await ctx.db
      .update(assistantMemories)
      .set({
        kind: input.kind,
        summary: input.summary,
        source: input.source,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        updatedAt: now,
      })
      .where(and(eq(assistantMemories.id, input.id), eq(assistantMemories.clerkUserId, userId)))
      .returning();

    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Assistant memory not found.",
      });
    }

    await ctx.db
      .update(userPreferences)
      .set({ assistantMemoryUpdatedAt: now, updatedAt: now })
      .where(eq(userPreferences.clerkUserId, userId));

    await logAuditEvent(ctx, {
      action: "assistant.memory_updated",
      entityType: "assistant_memory",
      entityId: updated.id,
      summary: "Updated assistant memory summary",
      metadata: {
        kind: updated.kind,
        source: input.source,
      },
    });

    return updated;
  }

  const [created] = await ctx.db
    .insert(assistantMemories)
    .values({
      id: crypto.randomUUID(),
      clerkUserId: userId,
      kind: input.kind,
      summary: input.summary,
      source: input.source,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
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
      kind: created?.kind ?? input.kind,
      source: input.source,
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
  assertUserId(ctx.userId);
  const enabled = await isAssistantMemoryEnabled(ctx);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Assistant memory is disabled in Settings.",
    });
  }

  return persistAssistantMemory(ctx, {
    kind: memoryKindForIntent(input.intent),
    summary: buildMemorySummary(input),
    source: "user_confirmed",
    metadata: {
      intent: input.intent,
      dataBasis: input.dataBasis,
      sourceQuestion: compactText(input.message, 180),
    },
  });
}

export async function rememberAssistantSession(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: RememberAssistantSessionInput
) {
  assertUserId(ctx.userId);
  const enabled = await isAssistantMemoryEnabled(ctx);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Assistant memory is disabled in Settings.",
    });
  }

  const summary = await generateSessionMemorySummary(input.messages);
  if (!summary) {
    return { saved: false as const, memoryId: input.memoryId ?? null, summary: null };
  }

  const userMessages = input.messages.filter((message) => message.role === "user");
  const dominantIntent = detectAssistantIntent(userMessages.map((message) => message.content).join("\n"));
  const persisted = await persistAssistantMemory(ctx, {
    id: input.memoryId,
    kind: memoryKindForIntent(dominantIntent),
    summary,
    source: "session_summary",
    metadata: {
      intent: dominantIntent,
      turnCount: input.messages.length,
      userTurns: userMessages.length,
    },
  });

  return {
    saved: true as const,
    memoryId: persisted.id,
    summary: persisted.summary,
  };
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
