import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  accounts,
  aiInsights,
  auditLogs,
  billOccurrences,
  billSeries,
  budgets,
  categories,
  goals,
  ledgerEntries,
  loanInstallments,
  loanPayments,
  loans,
  transactionEvents,
  userPreferences,
} from "@/db/schema";
import {
  clearWorkspaceSchema,
  listAuditLogSchema,
  updateSettingsSchema,
} from "@/features/settings/server/schema";
import { listAuditEvents, logAuditEvent } from "@/features/trust/server/audit";
import { trackUsageEvent } from "@/features/trust/server/usage-analytics";
import type { TRPCContext } from "@/server/api/trpc";

type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
type ClearWorkspaceInput = z.infer<typeof clearWorkspaceSchema>;
type ListAuditLogInput = z.infer<typeof listAuditLogSchema>;

function assertUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to sign in to continue.",
    });
  }

  return userId;
}

const defaultPreferences = {
  defaultCurrency: "PHP" as const,
  locale: "en-PH" as const,
  weekStartsOn: "monday" as const,
  dateFormat: "month-day-year" as const,
  timezone: "Asia/Manila" as const,
  allowAiCoaching: true,
  allowUsageAnalytics: false,
};

async function ensureUserPreferences(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const existing = await ctx.db.query.userPreferences.findFirst({
    where: eq(userPreferences.clerkUserId, userId),
  });

  if (existing) {
    return existing;
  }

  const [created] = await ctx.db
    .insert(userPreferences)
    .values({
      id: crypto.randomUUID(),
      clerkUserId: userId,
      ...defaultPreferences,
    })
    .returning();

  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create user settings.",
    });
  }

  return created;
}

export async function getUserSettings(ctx: Pick<TRPCContext, "db" | "userId">) {
  return ensureUserPreferences(ctx);
}

export async function updateUserSettings(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: UpdateSettingsInput
) {
  const current = await ensureUserPreferences(ctx);
  const changedFields: string[] = [];
  if (current.defaultCurrency !== input.defaultCurrency) changedFields.push("defaultCurrency");
  if (current.locale !== input.locale) changedFields.push("locale");
  if (current.weekStartsOn !== input.weekStartsOn) changedFields.push("weekStartsOn");
  if (current.dateFormat !== input.dateFormat) changedFields.push("dateFormat");
  if (current.timezone !== input.timezone) changedFields.push("timezone");
  if (current.allowAiCoaching !== input.allowAiCoaching) changedFields.push("allowAiCoaching");
  if (current.allowUsageAnalytics !== input.allowUsageAnalytics) changedFields.push("allowUsageAnalytics");

  const [updated] = await ctx.db
    .update(userPreferences)
    .set({
      defaultCurrency: input.defaultCurrency,
      locale: input.locale,
      weekStartsOn: input.weekStartsOn,
      dateFormat: input.dateFormat,
      timezone: input.timezone,
      allowAiCoaching: input.allowAiCoaching,
      allowUsageAnalytics: input.allowUsageAnalytics,
      updatedAt: new Date(),
    })
    .where(eq(userPreferences.id, current.id))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update user settings.",
    });
  }

  if (current.allowAiCoaching !== updated.allowAiCoaching) {
    await logAuditEvent(ctx, {
      action: "settings.ai_coaching_changed",
      entityType: "settings",
      entityId: updated.id,
      summary: `AI coaching ${updated.allowAiCoaching ? "enabled" : "disabled"}`,
      metadata: {
        from: current.allowAiCoaching,
        to: updated.allowAiCoaching,
      },
    });
  }

  if (current.allowUsageAnalytics !== updated.allowUsageAnalytics) {
    await logAuditEvent(ctx, {
      action: "settings.usage_analytics_changed",
      entityType: "settings",
      entityId: updated.id,
      summary: `Usage analytics ${updated.allowUsageAnalytics ? "enabled" : "disabled"}`,
      metadata: {
        from: current.allowUsageAnalytics,
        to: updated.allowUsageAnalytics,
      },
    });
  }

  if (changedFields.some((field) => field !== "allowAiCoaching" && field !== "allowUsageAnalytics")) {
    await logAuditEvent(ctx, {
      action: "settings.preferences_changed",
      entityType: "settings",
      entityId: updated.id,
      summary: "Updated workspace preference defaults",
      metadata: {
        changedFields,
      },
    });
  }

  await trackUsageEvent(ctx, {
    eventName: "settings.preferences_updated",
    surface: "settings",
    metadata: {
      changedFields,
      allowAiCoaching: updated.allowAiCoaching,
      allowUsageAnalytics: updated.allowUsageAnalytics,
    },
  });

  return {
    settings: updated,
  };
}

export async function exportWorkspaceData(ctx: Pick<TRPCContext, "db" | "userId">) {
  const userId = assertUserId(ctx.userId);

  const [
    settings,
    accountRows,
    categoryRows,
    budgetRows,
    goalRows,
    transactionRows,
    ledgerRows,
    billSeriesRows,
    billOccurrenceRows,
    loanRows,
    loanInstallmentRows,
    loanPaymentRows,
  ] = await Promise.all([
    ensureUserPreferences(ctx),
    ctx.db.query.accounts.findMany({ where: eq(accounts.clerkUserId, userId) }),
    ctx.db.query.categories.findMany({ where: eq(categories.clerkUserId, userId) }),
    ctx.db.query.budgets.findMany({ where: eq(budgets.clerkUserId, userId) }),
    ctx.db.query.goals.findMany({ where: eq(goals.clerkUserId, userId) }),
    ctx.db.query.transactionEvents.findMany({ where: eq(transactionEvents.clerkUserId, userId) }),
    ctx.db.query.ledgerEntries.findMany({ where: eq(ledgerEntries.clerkUserId, userId) }),
    ctx.db.query.billSeries.findMany({ where: eq(billSeries.clerkUserId, userId) }),
    ctx.db.query.billOccurrences.findMany({ where: eq(billOccurrences.clerkUserId, userId) }),
    ctx.db.query.loans.findMany({ where: eq(loans.clerkUserId, userId) }),
    ctx.db.query.loanInstallments.findMany({ where: eq(loanInstallments.clerkUserId, userId) }),
    ctx.db.query.loanPayments.findMany({ where: eq(loanPayments.clerkUserId, userId) }),
  ]);

  await logAuditEvent(ctx, {
    action: "settings.export_data",
    entityType: "workspace",
    summary: "Exported workspace data snapshot",
  });

  await trackUsageEvent(ctx, {
    eventName: "settings.export_data",
    surface: "settings",
    metadata: {
      accounts: accountRows.length,
      categories: categoryRows.length,
      budgets: budgetRows.length,
      goals: goalRows.length,
      transactions: transactionRows.length,
      bills: billSeriesRows.length,
      loans: loanRows.length,
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    counts: {
      accounts: accountRows.length,
      categories: categoryRows.length,
      budgets: budgetRows.length,
      goals: goalRows.length,
      transactions: transactionRows.length,
      bills: billSeriesRows.length,
      loans: loanRows.length,
    },
    settings,
    accounts: accountRows,
    categories: categoryRows,
    budgets: budgetRows,
    goals: goalRows,
    transactions: transactionRows,
    ledgerEntries: ledgerRows,
    billSeries: billSeriesRows,
    billOccurrences: billOccurrenceRows,
    loans: loanRows,
    loanInstallments: loanInstallmentRows,
    loanPayments: loanPaymentRows,
  };
}

export async function getAuditLog(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: ListAuditLogInput
) {
  return listAuditEvents(ctx, input.limit);
}

export async function clearWorkspaceData(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: ClearWorkspaceInput
) {
  const userId = assertUserId(ctx.userId);

  if (input.confirmation !== "DELETE WORKSPACE DATA") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Please confirm the delete phrase exactly.",
    });
  }

  await ctx.db.delete(auditLogs).where(eq(auditLogs.clerkUserId, userId));
  await ctx.db.delete(aiInsights).where(eq(aiInsights.clerkUserId, userId));
  await ctx.db.delete(ledgerEntries).where(eq(ledgerEntries.clerkUserId, userId));
  await ctx.db.delete(billOccurrences).where(eq(billOccurrences.clerkUserId, userId));
  await ctx.db.delete(billSeries).where(eq(billSeries.clerkUserId, userId));
  await ctx.db.delete(transactionEvents).where(eq(transactionEvents.clerkUserId, userId));
  await ctx.db.delete(loanPayments).where(eq(loanPayments.clerkUserId, userId));
  await ctx.db.delete(loanInstallments).where(eq(loanInstallments.clerkUserId, userId));
  await ctx.db.delete(loans).where(eq(loans.clerkUserId, userId));
  await ctx.db.delete(goals).where(eq(goals.clerkUserId, userId));
  await ctx.db.delete(budgets).where(eq(budgets.clerkUserId, userId));
  await ctx.db.delete(categories).where(eq(categories.clerkUserId, userId));
  await ctx.db.delete(accounts).where(eq(accounts.clerkUserId, userId));

  await logAuditEvent(ctx, {
    action: "settings.clear_workspace",
    entityType: "workspace",
    summary: "Cleared workspace data",
  });

  await trackUsageEvent(ctx, {
    eventName: "settings.clear_workspace",
    surface: "settings",
    metadata: {
      confirmationMatched: true,
    },
  });

  return {
    success: true,
  };
}
