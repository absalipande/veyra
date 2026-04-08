import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { accounts } from "@/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  institution: z.string().trim().max(80).optional().or(z.literal("")),
  type: z.enum(["cash", "credit", "loan", "wallet"]),
  balance: z.number().int(),
});

export const accountsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.accounts.findMany({
      where: eq(accounts.clerkUserId, ctx.userId),
      orderBy: [desc(accounts.createdAt)],
    });
  }),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        totalAccounts: sql<number>`count(*)`,
        totalCash: sql<number>`coalesce(sum(case when ${accounts.type} in ('cash', 'wallet') then ${accounts.balance} else 0 end), 0)`,
        totalCredit: sql<number>`coalesce(sum(case when ${accounts.type} = 'credit' then ${accounts.balance} else 0 end), 0)`,
        totalLoans: sql<number>`coalesce(sum(case when ${accounts.type} = 'loan' then ${accounts.balance} else 0 end), 0)`,
      })
      .from(accounts)
      .where(eq(accounts.clerkUserId, ctx.userId));

    return {
      totalAccounts: Number(row?.totalAccounts ?? 0),
      totalCash: Number(row?.totalCash ?? 0),
      totalCredit: Number(row?.totalCredit ?? 0),
      totalLoans: Number(row?.totalLoans ?? 0),
    };
  }),

  create: protectedProcedure.input(createAccountSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.accounts.findFirst({
      where: eq(accounts.clerkUserId, ctx.userId),
      columns: { id: true },
    });

    const [created] = await ctx.db
      .insert(accounts)
      .values({
        id: crypto.randomUUID(),
        clerkUserId: ctx.userId,
        name: input.name,
        institution: input.institution || null,
        type: input.type,
        balance: input.balance,
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
  }),
});
