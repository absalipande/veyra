import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { categories, transactionEvents } from "@/db/schema";
import { deleteTransactionEvent } from "@/features/transactions/server/service";
import { logAuditEvent } from "@/features/trust/server/audit";
import {
  applyCategoryFixSchema,
  markOddReviewedSchema,
  removeDuplicateFixSchema,
} from "@/features/data-quality/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type ApplyCategoryFixInput = z.infer<typeof applyCategoryFixSchema>;
type RemoveDuplicateFixInput = z.infer<typeof removeDuplicateFixSchema>;
type MarkOddReviewedInput = z.infer<typeof markOddReviewedSchema>;

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }
  return userId;
}

function normalizeMerchant(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function getDataQualityReport(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentEvents = await ctx.db.query.transactionEvents.findMany({
    where: and(eq(transactionEvents.clerkUserId, userId), gte(transactionEvents.occurredAt, ninetyDaysAgo)),
    orderBy: [desc(transactionEvents.occurredAt), desc(transactionEvents.createdAt)],
  });

  const expenseEvents = recentEvents.filter((event) => event.type === "expense");
  const categoryRows = await ctx.db.query.categories.findMany({
    where: and(eq(categories.clerkUserId, userId), eq(categories.kind, "expense"), eq(categories.isArchived, false)),
    columns: { id: true, name: true },
  });
  const categoryMap = new Map(categoryRows.map((row) => [row.id, row.name]));

  const labeledByMerchant = new Map<string, string>();
  for (const event of expenseEvents) {
    if (!event.categoryId) continue;
    const merchant = normalizeMerchant(event.description);
    if (!merchant) continue;
    if (!labeledByMerchant.has(merchant)) {
      labeledByMerchant.set(merchant, event.categoryId);
    }
  }

  const uncategorized = expenseEvents
    .filter((event) => !event.categoryId)
    .slice(0, 8)
    .map((event) => {
      const merchant = normalizeMerchant(event.description);
      const suggestedCategoryId = labeledByMerchant.get(merchant) ?? null;
      return {
        id: event.id,
        description: event.description,
        amount: event.amount,
        currency: event.currency,
        occurredAt: event.occurredAt,
        suggestedCategoryId,
        suggestedCategoryName: suggestedCategoryId ? (categoryMap.get(suggestedCategoryId) ?? null) : null,
      };
    });

  const duplicateCandidates: Array<{
    id: string;
    keepEventId: string;
    removeEventId: string;
    description: string;
    amount: number;
    currency: string;
    occurredAt: Date;
  }> = [];
  const duplicateKeyMap = new Map<string, typeof expenseEvents[number]>();

  for (const event of expenseEvents) {
    const key = `${event.type}|${event.amount}|${toDayKey(event.occurredAt)}|${normalizeMerchant(event.description)}`;
    const existing = duplicateKeyMap.get(key);
    if (!existing) {
      duplicateKeyMap.set(key, event);
      continue;
    }

    const keepEvent = existing.createdAt <= event.createdAt ? existing : event;
    const removeEvent = keepEvent.id === existing.id ? event : existing;
    duplicateCandidates.push({
      id: `${keepEvent.id}:${removeEvent.id}`,
      keepEventId: keepEvent.id,
      removeEventId: removeEvent.id,
      description: keepEvent.description,
      amount: keepEvent.amount,
      currency: keepEvent.currency,
      occurredAt: keepEvent.occurredAt,
    });
  }

  const amountsByCategory = new Map<string, number[]>();
  for (const event of expenseEvents) {
    if (!event.categoryId) continue;
    const bucket = amountsByCategory.get(event.categoryId) ?? [];
    bucket.push(event.amount);
    amountsByCategory.set(event.categoryId, bucket);
  }

  const oddTransactions = expenseEvents
    .filter((event) => {
      if (!event.categoryId) return false;
      const amounts = amountsByCategory.get(event.categoryId) ?? [];
      if (amounts.length < 3) return false;
      const avg = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
      return avg > 0 && event.amount >= Math.round(avg * 2.5);
    })
    .slice(0, 8)
    .map((event) => ({
      id: event.id,
      description: event.description,
      amount: event.amount,
      currency: event.currency,
      occurredAt: event.occurredAt,
      categoryName: event.categoryId ? (categoryMap.get(event.categoryId) ?? "Unknown") : "Uncategorized",
      notes: event.notes,
    }));

  return {
    totals: {
      uncategorizedCount: uncategorized.length,
      duplicateCount: duplicateCandidates.length,
      oddCount: oddTransactions.length,
    },
    uncategorized,
    duplicateCandidates,
    oddTransactions,
  };
}

export async function applyCategoryFix(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: ApplyCategoryFixInput
) {
  const userId = assertUserId(ctx.userId);

  const event = await ctx.db.query.transactionEvents.findFirst({
    where: and(eq(transactionEvents.id, input.eventId), eq(transactionEvents.clerkUserId, userId)),
  });
  if (!event) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Transaction event not found.",
    });
  }
  if (event.type !== "expense") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Category fix only supports expense events.",
    });
  }

  const [category] = await ctx.db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      and(
        eq(categories.id, input.categoryId),
        eq(categories.clerkUserId, userId),
        eq(categories.kind, "expense"),
        eq(categories.isArchived, false)
      )
    )
    .limit(1);
  if (!category) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Category not found.",
    });
  }

  await ctx.db
    .update(transactionEvents)
    .set({
      categoryId: input.categoryId,
      updatedAt: new Date(),
    })
    .where(and(eq(transactionEvents.id, input.eventId), eq(transactionEvents.clerkUserId, userId)));

  await logAuditEvent(ctx, {
    action: "data_quality.apply_category",
    entityType: "transaction_event",
    entityId: input.eventId,
    summary: `Applied category "${category.name}" to transaction "${event.description}"`,
  });

  return { success: true };
}

export async function removeDuplicateFix(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: RemoveDuplicateFixInput
) {
  const userId = assertUserId(ctx.userId);
  const event = await ctx.db.query.transactionEvents.findFirst({
    where: and(eq(transactionEvents.id, input.eventId), eq(transactionEvents.clerkUserId, userId)),
  });
  if (!event) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Transaction event not found.",
    });
  }

  await deleteTransactionEvent(ctx, { id: input.eventId });

  await logAuditEvent(ctx, {
    action: "data_quality.remove_duplicate",
    entityType: "transaction_event",
    entityId: input.eventId,
    summary: `Removed duplicate transaction "${event.description}"`,
  });

  return { success: true };
}

export async function markOddTransactionReviewed(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: MarkOddReviewedInput
) {
  const userId = assertUserId(ctx.userId);
  const [event] = await ctx.db
    .select({
      id: transactionEvents.id,
      description: transactionEvents.description,
      notes: transactionEvents.notes,
    })
    .from(transactionEvents)
    .where(and(eq(transactionEvents.id, input.eventId), eq(transactionEvents.clerkUserId, userId)))
    .limit(1);

  if (!event) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Transaction event not found.",
    });
  }

  const reviewTag = `[Reviewed ${new Date().toISOString().slice(0, 10)}]`;
  const nextNotes = event.notes?.includes(reviewTag)
    ? event.notes
    : [event.notes, reviewTag].filter(Boolean).join(" ");

  await ctx.db
    .update(transactionEvents)
    .set({ notes: nextNotes, updatedAt: new Date() })
    .where(and(eq(transactionEvents.id, input.eventId), eq(transactionEvents.clerkUserId, userId)));

  await logAuditEvent(ctx, {
    action: "data_quality.mark_reviewed",
    entityType: "transaction_event",
    entityId: event.id,
    summary: `Marked odd transaction as reviewed: "${event.description}"`,
  });

  return { success: true };
}
