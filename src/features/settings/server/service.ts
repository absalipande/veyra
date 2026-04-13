import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  accounts,
  budgets,
  categories,
  ledgerEntries,
  transactionEvents,
  userPreferences,
} from "@/db/schema";
import {
  clearWorkspaceSchema,
  updateSettingsSchema,
} from "@/features/settings/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
type ClearWorkspaceInput = z.infer<typeof clearWorkspaceSchema>;

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

  const [updated] = await ctx.db
    .update(userPreferences)
    .set({
      defaultCurrency: input.defaultCurrency,
      locale: input.locale,
      weekStartsOn: input.weekStartsOn,
      dateFormat: input.dateFormat,
      timezone: input.timezone,
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

  return {
    settings: updated,
  };
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

  await ctx.db.delete(ledgerEntries).where(eq(ledgerEntries.clerkUserId, userId));
  await ctx.db.delete(transactionEvents).where(eq(transactionEvents.clerkUserId, userId));
  await ctx.db.delete(budgets).where(eq(budgets.clerkUserId, userId));
  await ctx.db.delete(categories).where(eq(categories.clerkUserId, userId));
  await ctx.db.delete(accounts).where(eq(accounts.clerkUserId, userId));

  return {
    success: true,
  };
}
