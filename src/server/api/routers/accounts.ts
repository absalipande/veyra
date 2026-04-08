import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { accounts } from "@/db/schema";
import { supportedCurrencies } from "@/lib/currencies";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  currency: z.enum(supportedCurrencies),
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
        liquidAccounts: sql<number>`coalesce(sum(case when ${accounts.type} in ('cash', 'wallet') then 1 else 0 end), 0)`,
        liabilityAccounts: sql<number>`coalesce(sum(case when ${accounts.type} in ('credit', 'loan') then 1 else 0 end), 0)`,
        creditAccounts: sql<number>`coalesce(sum(case when ${accounts.type} = 'credit' then 1 else 0 end), 0)`,
        loanAccounts: sql<number>`coalesce(sum(case when ${accounts.type} = 'loan' then 1 else 0 end), 0)`,
        activeCurrencies: sql<number>`count(distinct ${accounts.currency})`,
      })
      .from(accounts)
      .where(eq(accounts.clerkUserId, ctx.userId));

    return {
      activeCurrencies: Number(row?.activeCurrencies ?? 0),
      creditAccounts: Number(row?.creditAccounts ?? 0),
      liabilityAccounts: Number(row?.liabilityAccounts ?? 0),
      liquidAccounts: Number(row?.liquidAccounts ?? 0),
      loanAccounts: Number(row?.loanAccounts ?? 0),
      totalAccounts: Number(row?.totalAccounts ?? 0),
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
        currency: input.currency,
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

  update: protectedProcedure
    .input(
      createAccountSchema.extend({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
    }),

  remove: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
    }),
});
