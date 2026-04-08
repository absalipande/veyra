import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { accounts } from "@/db/schema";
import {
  createAccountSchema,
  deleteAccountSchema,
  updateAccountSchema,
} from "@/features/accounts/server/schema";
import type { TRPCContext } from "@/server/api/trpc";

type CreateAccountInput = z.infer<typeof createAccountSchema>;
type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export async function listAccounts(ctx: Pick<TRPCContext, "db" | "userId">) {
  return ctx.db.query.accounts.findMany({
    where: eq(accounts.clerkUserId, ctx.userId!),
    orderBy: [desc(accounts.createdAt)],
  });
}

export async function getAccountsSummary(ctx: Pick<TRPCContext, "db" | "userId">) {
  const [row] = await ctx.db
    .select({
      totalAccounts: sql<number>`count(*)`,
      liquidAccounts: sql<number>`coalesce(sum(case when ${accounts.type} in ('cash', 'wallet') then 1 else 0 end), 0)`,
      liabilityAccounts: sql<number>`coalesce(sum(case when ${accounts.type} in ('credit', 'loan') then 1 else 0 end), 0)`,
      creditAccounts: sql<number>`coalesce(sum(case when ${accounts.type} = 'credit' then 1 else 0 end), 0)`,
      loanAccounts: sql<number>`coalesce(sum(case when ${accounts.type} = 'loan' then 1 else 0 end), 0)`,
      activeCurrencies: sql<number>`count(distinct ${accounts.currency})`,
    })
    .from(accounts)
    .where(eq(accounts.clerkUserId, ctx.userId!));

  return {
    activeCurrencies: Number(row?.activeCurrencies ?? 0),
    creditAccounts: Number(row?.creditAccounts ?? 0),
    liabilityAccounts: Number(row?.liabilityAccounts ?? 0),
    liquidAccounts: Number(row?.liquidAccounts ?? 0),
    loanAccounts: Number(row?.loanAccounts ?? 0),
    totalAccounts: Number(row?.totalAccounts ?? 0),
  };
}

export async function createAccount(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: CreateAccountInput
) {
  const existing = await ctx.db.query.accounts.findFirst({
    where: eq(accounts.clerkUserId, ctx.userId!),
    columns: { id: true },
  });

  const [created] = await ctx.db
    .insert(accounts)
    .values({
      id: crypto.randomUUID(),
      clerkUserId: ctx.userId!,
      name: input.name,
      currency: input.currency,
      institution: input.institution || null,
      type: input.type,
      balance: input.balance,
      creditLimit: input.type === "credit" ? input.creditLimit : 0,
    })
    .returning();

  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create account.",
    });
  }

  return {
    account: created,
    firstAccount: !existing,
  };
}

export async function updateAccount(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: UpdateAccountInput
) {
  const existing = await ctx.db.query.accounts.findFirst({
    where: eq(accounts.id, input.id),
  });

  if (!existing || existing.clerkUserId !== ctx.userId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Account not found.",
    });
  }

  const [updated] = await ctx.db
    .update(accounts)
    .set({
      name: input.name,
      currency: input.currency,
      institution: input.institution || null,
      type: input.type,
      balance: input.balance,
      creditLimit: input.type === "credit" ? input.creditLimit : 0,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, input.id))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update account.",
    });
  }

  return {
    account: updated,
  };
}

export async function deleteAccount(
  ctx: Pick<TRPCContext, "db" | "userId">,
  input: DeleteAccountInput
) {
  const existing = await ctx.db.query.accounts.findFirst({
    where: eq(accounts.id, input.id),
  });

  if (!existing || existing.clerkUserId !== ctx.userId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Account not found.",
    });
  }

  await ctx.db.delete(accounts).where(eq(accounts.id, input.id));

  return {
    success: true,
  };
}
