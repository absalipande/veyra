import {
  createAccount,
  deleteAccount,
  getAccountsSummary,
  listAccounts,
  updateAccount,
} from "@/features/accounts/server/service";
import {
  createAccountSchema,
  deleteAccountSchema,
  updateAccountSchema,
} from "@/features/accounts/server/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const accountsRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => listAccounts(ctx)),
  summary: protectedProcedure.query(({ ctx }) => getAccountsSummary(ctx)),
  create: protectedProcedure.input(createAccountSchema).mutation(({ ctx, input }) => createAccount(ctx, input)),
  update: protectedProcedure.input(updateAccountSchema).mutation(({ ctx, input }) => updateAccount(ctx, input)),
  remove: protectedProcedure.input(deleteAccountSchema).mutation(({ ctx, input }) => deleteAccount(ctx, input)),
});
